"""Names on the station network (#165): DNS records and /etc/hosts."""

import ipaddress
from typing import Annotated, Literal

from pydantic import Field, model_validator

from ..base import _Strict
from .addresses import HOST_NAME, HostName, station_address


class DnsRecord(_Strict):
    """One record the station's resolver answers with (#165). A PTR record's
    name is the reverse form, 47.113.0.203.in-addr.arpa, as in a real zone."""

    name: HostName
    type: Literal["A", "CNAME", "MX", "TXT", "PTR"] = "A"
    value: Annotated[str, Field(min_length=1, max_length=255)]  # MX: "10 mail.depot-sync.net"
    ttl: Annotated[int, Field(ge=1, le=86400)] = 300

    @model_validator(mode="after")
    def _valid(self):
        where = f"dns {self.name} {self.type}"
        if self.type == "A":
            try:
                station_address(self.value)
            except ValueError as exc:
                raise ValueError(f"{where}: {exc}") from None
        elif self.type in ("CNAME", "PTR") and not HOST_NAME.match(self.value):
            raise ValueError(f"{where}: {self.value!r} is not a host name")
        elif self.type == "MX":
            pref, _, exchange = self.value.partition(" ")
            if not pref.isdigit() or int(pref) > 65535 or not HOST_NAME.match(exchange):
                raise ValueError(f"{where}: {self.value!r} should be a preference and a host name, like '10 mail.depot-sync.net'")
        if self.type == "PTR":
            octets = self.name.removesuffix(".in-addr.arpa").split(".")
            try:
                ipaddress.IPv4Address(".".join(reversed(octets)))
            except ValueError:
                raise ValueError(f"{where}: a PTR record's name is the address reversed, like 47.113.0.203.in-addr.arpa") from None
        elif self.name.endswith(".in-addr.arpa"):
            raise ValueError(f"{where}: only PTR records live under in-addr.arpa")
        return self


class DnsSpec(_Strict):
    """The station's DNS: the resolver /etc/resolv.conf names, and its records.
    A name that isn't here is NXDOMAIN; host names aren't added on their own."""

    server: str | None = None  # the resolver's address; null for the gateway
    records: Annotated[list[DnsRecord], Field(max_length=50)] = []

    @model_validator(mode="after")
    def _consistent(self):
        if self.server is not None:
            try:
                station_address(self.server)
            except ValueError as exc:
                raise ValueError(f"dns server: {exc}") from None
        aliases = {r.name: r.value for r in self.records if r.type == "CNAME"}
        for name in aliases:
            if sum(r.name == name for r in self.records) > 1:
                raise ValueError(f"dns {name}: a name with a CNAME can't have any other record")
        for start in aliases:
            seen, name = {start}, aliases[start]
            while name in aliases:
                if name in seen:
                    raise ValueError(f"dns {start}: its CNAMEs go round in a loop")
                seen.add(name)
                name = aliases[name]
        return self


# A fresh Ubuntu 24.04 server's /etc/hosts, with the console's name. shell.js
# has the same text (ETC_HOSTS) for a filesystem without one; a test keeps them equal.
ETC_HOSTS = (
    "127.0.0.1 localhost\n127.0.1.1 meridian\n\n"
    "# The following lines are desirable for IPv6 capable hosts\n"
    "::1     ip6-localhost ip6-loopback\nfe00::0 ip6-localnet\nff00::0 ip6-mcastprefix\n"
    "ff02::1 ip6-allnodes\nff02::2 ip6-allrouters\n"
)
