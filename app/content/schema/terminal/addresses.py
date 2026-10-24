"""The station network's ports, protocols, host names and addresses."""

import ipaddress
import re
from typing import Annotated, Literal

from pydantic import Field

# The station network (#164): the console's addresses, its own sockets, and
# the other hosts it can reach. All simulated by shell.js. Addresses come from
# the private ranges or the documentation ones (RFC 5737), never a real
# machine's (docs/story.md).
Port = Annotated[int, Field(ge=1, le=65535)]
Proto = Literal["tcp", "udp"]
HOST_NAME = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$")
HostName = Annotated[str, Field(pattern=HOST_NAME.pattern, max_length=253)]
STATION_RANGES = tuple(
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)


def station_address(text: str) -> ipaddress.IPv4Address:
    """An IPv4 address in the station's ranges, or a ValueError saying why not."""
    try:
        address = ipaddress.IPv4Address(text)
    except ValueError:
        raise ValueError(f"{text} is not an IPv4 address") from None
    if not any(address in n for n in STATION_RANGES):
        raise ValueError(f"{text} is not a private or documentation address (10/8, 172.16/12, 192.168/16, 203.0.113/24 …)")
    return address
