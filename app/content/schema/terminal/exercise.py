"""A module's terminal exercise, and the checks it makes of its own spec."""

from typing import Annotated

from pydantic import Field, model_validator

from ..base import Text, _Strict
from .checks import (
    ActiveCheck,
    ContainsCheck,
    CwdCheck,
    DisabledCheck,
    EnabledCheck,
    ExecutableCheck,
    ExistsCheck,
    FilesUnderCheck,
    InactiveCheck,
    LacksCheck,
    RunningCheck,
    SignalledCheck,
    StoppedCheck,
    SymlinkCheck,
    TerminalCheck,
    check_path,
    describe,
)
from .dns import ETC_HOSTS
from .files import AbsPath, Account, FsEntry, _parent, size_bytes
from .firewall import UFW_INSTALLED, ufw_conf, ufw_rules
from .network import NetworkSpec
from .services import ADMIN_DIR, VENDOR_DIR, JournalEntry, SystemdUnit
from .system import AccountSpec, DiskSpec, MemorySpec, ProcessSpec, proc_name

KNOWN_GIDS = {"root": 0, "adm": 4, "sudo": 27, "docker": 998}


class TerminalExercise(_Strict):
    task: Text  # what Okafor asks for (Markdown)
    user: Account = "cadet"
    group: Account = "crew"
    groups: list[Account] = []  # the user's supplementary groups, e.g. [sudo]
    # The user's password, for sudo's prompt. It's in-story and shown in the
    # task, not a secret: the console needs it to check what's typed.
    password: Annotated[str, Field(min_length=1, max_length=64)] | None = None
    accounts: list[AccountSpec] = []
    processes: Annotated[list[ProcessSpec], Field(max_length=20)] = []
    env: dict[Annotated[str, Field(pattern=r"^[A-Z_][A-Z0-9_]*$")], str] = {}  # extra exported variables, e.g. PATH
    cwd: AbsPath = "/station"
    disk: DiskSpec | None = None
    memory: MemorySpec | None = None
    network: NetworkSpec | None = None  # #164; without it, NetworkSpec's defaults
    services: Annotated[list[SystemdUnit], Field(max_length=20)] = []  # #303: systemd's units
    journal: Annotated[list[JournalEntry], Field(max_length=200)] = []  # #304: the log so far
    files: Annotated[list[FsEntry], Field(min_length=1, max_length=100)]
    checks: Annotated[list[TerminalCheck], Field(min_length=1, max_length=10)]
    success: Text = "Okafor's voice crackles over the comm: \"Confirmed. Nice work, cadet.\""
    # Commands that complete the task, run through the real shell in CI
    # (tests/js/). Never sent to the browser, like quiz answers.
    solution: Annotated[list[Annotated[str, Field(min_length=1)]], Field(min_length=1, max_length=40)]

    def starting_fs(self) -> dict[str, dict]:
        """{path: node} for the whole starting tree. Parent directories that
        aren't listed exist anyway, owned by root, mode 755, as on a real system."""
        fs = {"/": {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}}
        listed = {e.path for e in self.files}
        system = (
            ("/etc/passwd", self.passwd()),
            ("/etc/group", self.group_file()),
            ("/etc/hosts", ETC_HOSTS),  # #165: checked before DNS, as nsswitch.conf's `hosts: files dns` says
            ("/etc/resolv.conf", self.resolv_conf()),
        )
        firewall = (self.network or NetworkSpec()).firewall
        tuples = [r.tuple() for r in firewall.rules]
        system += (
            ("/etc/ufw/ufw.conf", ufw_conf(firewall.enabled)),  # #166: ufw keeps its state in its files
            ("/etc/ufw/user.rules", ufw_rules(tuples) if tuples else UFW_INSTALLED),
            ("/etc/ufw/user6.rules", ufw_rules(tuples, six=True) if tuples else UFW_INSTALLED.replace("ufw-", "ufw6-")),
        )
        for path, contents in system:
            if path not in listed:
                for parent in ("/etc", "/etc/ufw") if path.startswith("/etc/ufw/") else ("/etc",):
                    fs.setdefault(parent, {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""})
                mode = 0o640 if path.endswith(".rules") else 0o644  # ufw's rules are root's to read
                fs[path] = {"type": "file", "mode": mode, "owner": "root", "group": "root", "contents": contents}
        if self.services:
            # #303: the unit files, and a link in each WantedBy target's .wants/
            # for an enabled unit, as `systemctl enable` makes.
            for d in ("/etc", "/etc/systemd", ADMIN_DIR, "/usr", "/usr/lib", "/usr/lib/systemd", VENDOR_DIR):
                fs.setdefault(d, {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""})
            for u in self.services:
                if u.unit is not None and u.path not in listed:
                    fs[u.path] = {"type": "file", "mode": 0o644, "owner": "root", "group": "root", "contents": u.unit}
                if u.enabled:
                    for target in u.wanted_by():
                        wants = f"{ADMIN_DIR}/{target}.wants"
                        fs.setdefault(wants, {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""})
                        fs[f"{wants}/{u.name}"] = {
                            "type": "link", "mode": 0o777, "owner": "root", "group": "root", "contents": "", "target": u.path,
                        }
        if "/root" not in listed:
            fs["/root"] = {"type": "dir", "mode": 0o700, "owner": "root", "group": "root", "contents": ""}
        for entry in self.files:
            parent = _parent(entry.path)
            while parent not in fs:
                fs[parent] = {"type": "dir", "mode": 0o755, "owner": "root", "group": "root", "contents": ""}
                parent = _parent(parent)
            mode = "777" if entry.type == "link" else entry.mode or ("755" if entry.type == "dir" else "644")
            node = {
                "type": entry.type,
                "mode": int(mode, 8),
                "owner": entry.owner or self.user,
                "group": entry.group or self.group,
                "contents": entry.contents,
            }
            # Only when set, so exercises without them keep their exact shape.
            if entry.target is not None:
                node["target"] = entry.target
            if entry.size is not None:
                node["size"] = size_bytes(entry.size)
            if entry.mtime:
                node["mtime"] = entry.modified().isoformat()
            fs[entry.path] = node
        return dict(sorted(fs.items()))

    def gids(self) -> dict[str, int]:
        """Every group the exercise mentions, with its GID."""
        gids = {"root": 0, self.group: 1000}
        for a in self.accounts:
            gids.setdefault(a.group or a.name, a.uid)
        named = set(self.groups) | {g for a in self.accounts for g in a.groups}
        spare = 1001
        for g in sorted(named):
            if g in KNOWN_GIDS:
                gids.setdefault(g, KNOWN_GIDS[g])
            elif g not in gids:
                gids[g] = spare
                spare += 1
        gids.setdefault("sudo", 27)
        return gids

    def resolv_conf(self) -> str:
        # A plain one, naming the station's resolver. Ubuntu's own points at
        # systemd-resolved's stub, 127.0.0.53, which the console doesn't have.
        server = (self.network or NetworkSpec()).resolver()
        return f"nameserver {server}\n" if server else "# no nameserver: the console has no gateway and no DNS server\n"

    def passwd(self) -> str:
        rows = [("root", 0, 0, "root", "/root", "/bin/bash")]
        gids = self.gids()
        for a in sorted(self.accounts, key=lambda a: a.uid):
            rows.append((a.name, a.uid, gids[a.group or a.name], a.comment, a.home or f"/var/lib/{a.name}", a.shell))
        rows.append((self.user, 1000, 1000, self.user.capitalize(), f"/home/{self.user}", "/bin/bash"))
        return "".join(f"{n}:x:{u}:{g}:{c}:{h}:{sh}\n" for n, u, g, c, h, sh in rows)

    def group_file(self) -> str:
        members: dict[str, list[str]] = {}
        for g in self.groups:
            members.setdefault(g, []).append(self.user)
        for a in self.accounts:
            for g in a.groups:
                members.setdefault(g, []).append(a.name)
        return "".join(
            f"{g}:x:{gid}:{','.join(members.get(g, []))}\n" for g, gid in sorted(self.gids().items(), key=lambda kv: kv[1])
        )

    @model_validator(mode="after")
    def _consistent(self):
        paths = [e.path for e in self.files]
        if dupes := sorted({p for p in paths if paths.count(p) > 1}):
            raise ValueError(f"files: {', '.join(dupes)} listed twice")
        fs = self.starting_fs()
        for entry in self.files:
            if fs[_parent(entry.path)]["type"] != "dir":
                raise ValueError(f"files: {entry.path} is inside {_parent(entry.path)}, which is a file")
        if fs.get(self.cwd, {}).get("type") != "dir":
            raise ValueError(f"cwd: {self.cwd} is not a directory in the starting filesystem")
        users = {"root", self.user} | {a.name for a in self.accounts}
        for p in self.processes:
            if p.user and p.user not in users:
                raise ValueError(f"processes: {p.command!r} runs as {p.user}, which is not an account")
        started = {proc_name(p.command) for p in self.processes}
        if self.network:
            for s in self.network.listening:
                if s.process not in started | {"sshd"}:
                    raise ValueError(f"network: listening {s.port}/{s.proto}: no starting process is called {s.process}")
            for c in self.network.connections:
                if c.process not in started | {"sshd"}:
                    raise ValueError(f"network: connection {c.remote}: no starting process is called {c.process}")
        units = {u.name: u for u in self.services}
        if len(units) != len(self.services):
            raise ValueError("services: a unit is listed twice")
        for u in self.services:
            where = f"services: {u.name}"
            for user in u.sections().get("Service", {}).get("User", []):
                if user not in users:
                    raise ValueError(f"{where}: User={user} is not an account")
            program = u.program()
            if program and fs.get(program, {}).get("type") != "file" and not program.startswith(("/usr/bin/", "/bin/")):
                raise ValueError(f"{where}: ExecStart's {program} is not a file in the starting filesystem")
            if u.kind == "timer" and u.activates() not in units:
                raise ValueError(f"{where}: it starts {u.activates()}, which isn't in services")
            if u.state == "active" and u.exits is not None and u.runs_for == 0:
                raise ValueError(f"{where}: a program that exits at once can't start active; give runs_for")
        for i, check in enumerate(self.checks):
            # A unit that must end stopped or disabled must be there to start with;
            # active and enabled may name a unit the learner writes (#308).
            if isinstance(check, InactiveCheck | DisabledCheck) and check_path(check) not in units:
                raise ValueError(f"checks.{i} ({describe(check)}): {check_path(check)} is not in services")
            if isinstance(check, StoppedCheck | SignalledCheck) and check_path(check) not in started:
                raise ValueError(f"checks.{i} ({describe(check)}): no starting process is called {check_path(check)}")
        for i, check in enumerate(self.checks):
            # A mode, owner or missing check reads something that must already be there.
            # exists, contains and lacks may name what the learner creates: lacks fails
            # until the file exists, so it reads "made, and without this" (#249).
            if isinstance(check, CwdCheck) and fs.get(check.cwd, {}).get("type") != "dir":
                raise ValueError(f"checks.{i} ({describe(check)}): {check.cwd} is not a directory in the starting filesystem")
            if isinstance(check, FilesUnderCheck) and fs.get(check.files_under, {}).get("type") != "dir":
                raise ValueError(f"checks.{i} ({describe(check)}): {check.files_under} is not a directory in the starting filesystem")
            if isinstance(check, RunningCheck | StoppedCheck | SignalledCheck | ActiveCheck | InactiveCheck | EnabledCheck | DisabledCheck):
                continue
            creatable = ExistsCheck | ExecutableCheck | ContainsCheck | LacksCheck | CwdCheck | SymlinkCheck | FilesUnderCheck
            if not isinstance(check, creatable) and check_path(check) not in fs:
                raise ValueError(
                    f"checks.{i} ({describe(check)}): {check_path(check)} is not in the starting filesystem"
                )
        return self
