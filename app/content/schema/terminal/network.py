"""The station network (#164): interfaces, routes, services, hosts and sockets."""

import ipaddress
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict
from .addresses import HostName, Port, Proto, station_address
from .dns import DnsSpec
from .firewall import FirewallSpec


class InterfaceSpec(_Strict):
    """One of the console's network interfaces. `lo` is always there too."""

    name: Annotated[str, Field(pattern=r"^[a-z][a-z0-9]{0,14}$")] = "eth0"
    address: Annotated[str, Field(max_length=18)]  # with its prefix: 10.4.0.12/24

    def network(self) -> ipaddress.IPv4Interface:
        return ipaddress.IPv4Interface(self.address)

    @model_validator(mode="after")
    def _valid(self):
        if self.name == "lo":
            raise ValueError("interface lo: the loopback interface is always there; don't list it")
        address, _, prefix = self.address.partition("/")
        try:
            station_address(address)
        except ValueError as exc:
            raise ValueError(f"interface {self.name}: {exc}") from None
        if not prefix.isdigit() or not 8 <= int(prefix) <= 30:
            raise ValueError(f"interface {self.name}: {self.address} needs a prefix from /8 to /30, like 10.4.0.12/24")
        if self.network().ip in (self.network().network.network_address, self.network().network.broadcast_address):
            raise ValueError(f"interface {self.name}: {self.address} is its subnet's network or broadcast address")
        return self


class RouteSpec(_Strict):
    """What one URL on a host's HTTP service answers (#166). Anything not
    listed is that server's 404."""

    path: Annotated[str, Field(pattern=r"^/[^\s?#]*$", max_length=200)]  # the query string isn't matched
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    status: Annotated[int, Field(ge=100, le=599)] = 200
    headers: dict[Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9-]{0,40}$")], Annotated[str, Field(max_length=300)]] = {}
    body: Annotated[str, Field(max_length=4000)] = ""


class ServiceSpec(_Strict):
    """A port another host listens on."""

    port: Port
    proto: Proto = "tcp"
    # #166: an HTTP server on this port, and what it answers. With `tls`, it's
    # HTTPS, and its certificate is trusted or has expired (curl -v shows which).
    http: Annotated[list[RouteSpec], Field(max_length=20)] | None = None
    tls: Literal["trusted", "expired"] | None = None

    @model_validator(mode="after")
    def _valid(self):
        if self.http is not None and self.proto != "tcp":
            raise ValueError(f"service {self.port}/{self.proto}: HTTP runs over tcp")
        if self.tls and self.http is None:
            raise ValueError(f"service {self.port}: tls needs http routes")
        routes = [(r.method, r.path) for r in self.http or []]
        if dupes := sorted({f"{m} {p}" for m, p in routes if routes.count((m, p)) > 1}):
            raise ValueError(f"service {self.port}: {dupes[0]} listed twice")
        return self


class HostSpec(_Strict):
    """Another machine on the station network (or beyond it)."""

    name: HostName
    address: str
    up: bool = True  # a host that's down answers nothing: unreachable
    ping: bool = True  # False: up, but it drops ping (a blocked ping proves little)
    services: Annotated[list[ServiceSpec], Field(max_length=20)] = []
    filtered: Annotated[list[Port], Field(max_length=20)] = []  # TCP ports a firewall drops: nc times out
    # #166: `ssh NAME 'COMMAND'` runs COMMAND there (your key is already on it),
    # so a task can test the console from outside, through its firewall.
    login: bool = False

    @model_validator(mode="after")
    def _valid(self):
        try:
            station_address(self.address)
        except ValueError as exc:
            raise ValueError(f"host {self.name}: {exc}") from None
        served = [(s.port, s.proto) for s in self.services]
        if dupes := sorted({f"{p}/{proto}" for p, proto in served if served.count((p, proto)) > 1}):
            raise ValueError(f"host {self.name}: {', '.join(dupes)} listed twice")
        if both := sorted({s.port for s in self.services if s.proto == "tcp"} & set(self.filtered)):
            raise ValueError(f"host {self.name}: port {both[0]} is both a service and filtered")
        if self.login and not any(s.port == 22 and s.proto == "tcp" for s in self.services):
            raise ValueError(f"host {self.name}: login needs sshd, a service on 22/tcp")
        return self


class ListenSpec(_Strict):
    """A socket the console itself listens on, held by one of its processes."""

    port: Port
    proto: Proto = "tcp"
    process: Annotated[str, Field(min_length=1, max_length=32)]  # a starting process's name, as ps shows it
    address: str = "0.0.0.0"  # or 127.0.0.1 (this machine only), or one interface's address
    http: Annotated[list[RouteSpec], Field(max_length=20)] | None = None  # #166: what curl gets from it


class ConnectionSpec(_Strict):
    """An established TCP connection: out to a host's service, or, with
    `local_port`, in to one of the console's listeners."""

    process: Annotated[str, Field(min_length=1, max_length=32)]
    remote: Annotated[str, Field(pattern=r"^[0-9.]+:\d{1,5}$")]  # 10.4.0.20:5432
    local_port: Port | None = None

    def remote_address(self) -> str:
        return self.remote.rsplit(":", 1)[0]

    def remote_port(self) -> int:
        return int(self.remote.rsplit(":", 1)[1])


class NetworkSpec(_Strict):
    # The defaults are shell.js's DEFAULT_NETWORK (a test keeps them equal), so
    # an exercise that never mentions the network still has one to look at.
    interfaces: Annotated[list[InterfaceSpec], Field(min_length=1, max_length=4)] = [InterfaceSpec(address="10.4.0.12/24")]
    gateway: str | None = "10.4.0.1"  # the default route; null for none
    listening: Annotated[list[ListenSpec], Field(max_length=20)] = []
    connections: Annotated[list[ConnectionSpec], Field(max_length=20)] = []
    hosts: Annotated[list[HostSpec], Field(max_length=30)] = []
    dns: DnsSpec = DnsSpec()  # #165
    firewall: FirewallSpec = FirewallSpec()  # #166

    def resolver(self) -> str | None:
        """The nameserver /etc/resolv.conf starts with: the DNS server, or the gateway."""
        return self.dns.server or self.gateway

    @model_validator(mode="after")
    def _consistent(self):
        names = [i.name for i in self.interfaces]
        if dupes := sorted({n for n in names if names.count(n) > 1}):
            raise ValueError(f"interface {dupes[0]} listed twice")
        nets = [i.network() for i in self.interfaces]
        mine = {str(n.ip) for n in nets}
        if self.gateway is not None:
            try:
                gateway = station_address(self.gateway)
            except ValueError as exc:
                raise ValueError(f"gateway: {exc}") from None
            if not any(gateway in n.network for n in nets):
                raise ValueError(f"gateway: {self.gateway} isn't on any interface's subnet")
            if str(gateway) in mine:
                raise ValueError(f"gateway: {self.gateway} is the console's own address")
        if self.dns.server in mine:
            raise ValueError(f"dns server: {self.dns.server} is the console's own address")
        seen: dict[str, str] = {}
        for host in self.hosts:
            if host.name in seen.values():
                raise ValueError(f"host {host.name}: listed twice")
            if host.address in mine:
                raise ValueError(f"host {host.name}: {host.address} is the console's own address")
            if host.address in seen:
                raise ValueError(f"host {host.name}: {host.address} is {seen[host.address]}'s address too")
            seen[host.address] = host.name
        sockets = [(s.port, s.proto) for s in self.listening]
        for s in self.listening:
            where = f"listening {s.port}/{s.proto}"
            if sockets.count((s.port, s.proto)) > 1:
                raise ValueError(f"{where}: listed twice")
            if s.address not in mine and s.address != "0.0.0.0" and not s.address.startswith("127."):
                raise ValueError(f"{where}: {s.address} is not 0.0.0.0, 127.0.0.1 or one of the console's addresses")
            if s.port == 22 and s.proto == "tcp":
                raise ValueError(f"{where}: sshd already listens on 22")
        by_address = {h.address: h for h in self.hosts}
        for c in self.connections:
            where = f"connection {c.remote}"
            host = by_address.get(c.remote_address())
            if host is None:
                raise ValueError(f"{where}: {c.remote_address()} is not one of the hosts")
            if c.local_port is not None:
                if (c.local_port, "tcp") not in sockets and c.local_port != 22:
                    raise ValueError(f"{where}: nothing listens on local port {c.local_port}")
            elif not any(s.port == c.remote_port() and s.proto == "tcp" for s in host.services):
                raise ValueError(f"{where}: {host.name} has no TCP service on port {c.remote_port()}")
        return self
