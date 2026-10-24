"""The console's firewall (#166): ufw's rules and the files ufw writes."""

import ipaddress
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict
from .addresses import Port


class FirewallRule(_Strict):
    """One ufw rule, as `ufw allow|deny [from ADDR to any port] PORT[/PROTO]` makes it."""

    action: Literal["allow", "deny"] = "allow"
    port: Port | None = None  # null: every port (a rule on `from` alone)
    proto: Literal["tcp", "udp", "any"] = "any"
    source: str | None = Field(default=None, alias="from")  # an address or a CIDR network; null for anywhere

    @model_validator(mode="after")
    def _valid(self):
        if self.port is None and self.source is None:
            raise ValueError("firewall rule: give a port, a from, or both")
        if self.port is None and self.proto != "any":
            raise ValueError("firewall rule: a protocol needs a port")
        if self.source is not None:
            try:
                ipaddress.IPv4Network(self.source)
            except ValueError:
                raise ValueError(f"firewall rule: from {self.source} is not an IPv4 address or network") from None
        return self

    def tuple(self) -> str:
        """The rule as ufw keeps it in user.rules: `### tuple ### allow tcp 22 …`."""
        port = str(self.port) if self.port else "any"
        src = self.source or "0.0.0.0/0"
        return f"{self.action} {self.proto} {port} 0.0.0.0/0 any {src} in"


class FirewallSpec(_Strict):
    """ufw on the console (#166): off, as on a fresh Ubuntu server, unless the
    exercise turns it on. It becomes /etc/ufw/ufw.conf and user.rules."""

    enabled: bool = False
    rules: Annotated[list[FirewallRule], Field(max_length=20)] = []


# ufw's own files (#166), as ufw 0.36.2 on Ubuntu 24.04 writes them. shell.js
# reads them to decide what gets in, and writes them the same way (a test runs
# the console's renderer over every exercise's and expects these bytes).
def ufw_conf(enabled: bool) -> str:
    return (
        "# /etc/ufw/ufw.conf\n#\n\n"
        "# Set to yes to start on boot. If setting this remotely, be sure to add a rule\n"
        "# to allow your remote connection before starting ufw. Eg: 'ufw allow 22/tcp'\n"
        f"ENABLED={'yes' if enabled else 'no'}\n\n"
        "# Please use the 'ufw' command to set the loglevel. Eg: 'ufw logging medium'.\n"
        "# See 'man ufw' for details.\nLOGLEVEL=low\n"
    )


UFW_INSTALLED = (
    "*filter\n:ufw-user-input - [0:0]\n:ufw-user-output - [0:0]\n:ufw-user-forward - [0:0]\n"
    ":ufw-user-limit - [0:0]\n:ufw-user-limit-accept - [0:0]\n### RULES ###\n"
    '-A ufw-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n'
    "-A ufw-user-limit -j REJECT\n-A ufw-user-limit-accept -j ACCEPT\nCOMMIT\n"
)


def ufw_rules(tuples: list[str], six: bool = False) -> str:
    """user.rules (or user6.rules) holding these `allow tcp 22 0.0.0.0/0 any 0.0.0.0/0 in` tuples."""
    chain = "ufw6" if six else "ufw"
    out = "*filter\n" + "".join(
        f":{chain}-{name} - [0:0]\n"
        for name in (
            "user-input", "user-output", "user-forward", "before-logging-input", "before-logging-output",
            "before-logging-forward", "user-logging-input", "user-logging-output", "user-logging-forward",
            "after-logging-input", "after-logging-output", "after-logging-forward", "logging-deny",
            "logging-allow", "user-limit", "user-limit-accept",
        )
    )
    out += "### RULES ###\n"
    for t in tuples:
        action, proto, port, _dst, _dport, src, _dir = t.split()
        if six:
            if src != "0.0.0.0/0":
                continue  # an IPv4 source has no IPv6 rule
            t = t.replace("0.0.0.0/0", "::/0")
        out += f"\n### tuple ### {t}\n"
        jump = "ACCEPT" if action == "allow" else "DROP"
        source = f" -s {src}" if src not in ("0.0.0.0/0", "::/0") else ""
        if port == "any":
            out += f"-A {chain}-user-input{source} -j {jump}\n"
        else:
            for p in ("tcp", "udp") if proto == "any" else (proto,):
                out += f"-A {chain}-user-input -p {p} --dport {port}{source} -j {jump}\n"
    log = '-m limit --limit 3/min --limit-burst 10'
    out += (
        "\n### END RULES ###\n\n### LOGGING ###\n"
        f'-A {chain}-after-logging-input -j LOG --log-prefix "[UFW BLOCK] " {log}\n'
        f'-A {chain}-after-logging-forward -j LOG --log-prefix "[UFW BLOCK] " {log}\n'
        f"-I {chain}-logging-deny -m conntrack --ctstate INVALID -j RETURN {log}\n"
        f'-A {chain}-logging-deny -j LOG --log-prefix "[UFW BLOCK] " {log}\n'
        f'-A {chain}-logging-allow -j LOG --log-prefix "[UFW ALLOW] " {log}\n'
        "### END LOGGING ###\n\n### RATE LIMITING ###\n"
        f'-A {chain}-user-limit -m limit --limit 3/minute -j LOG --log-prefix "[UFW LIMIT BLOCK] "\n'
        f"-A {chain}-user-limit -j REJECT\n-A {chain}-user-limit-accept -j ACCEPT\n"
        "### END RATE LIMITING ###\nCOMMIT\n"
    )
    return out
