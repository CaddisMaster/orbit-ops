"""A minimal PNG writer and reader: 8-bit RGBA, filter type 0, nothing else.

Pixels are compared decoded rather than as file bytes, because two zlib
builds may compress the same pixels differently (tests/test_art.py).
"""

import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def encode(width: int, height: int, rows: list[list[tuple[int, int, int, int]]]) -> bytes:
    raw = b"".join(b"\x00" + b"".join(bytes(px) for px in row) for row in rows)
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return SIGNATURE + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")


def decode(data: bytes) -> tuple[int, int, list[list[tuple[int, int, int, int]]]]:
    """The inverse of encode(), for the files encode() writes."""
    if not data.startswith(SIGNATURE):
        raise ValueError("not a PNG")
    at, idat, width, height = len(SIGNATURE), b"", 0, 0
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        kind, body = data[at + 4 : at + 8], data[at + 8 : at + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour, _, filt, _ = struct.unpack(">IIBBBBB", body)
            if (depth, colour, filt) != (8, 6, 0):
                raise ValueError("only 8-bit RGBA PNGs from art/png.py are supported")
        elif kind == b"IDAT":
            idat += body
        at += 12 + length
    raw = zlib.decompress(idat)
    stride = 1 + width * 4
    rows = []
    for y in range(height):
        line = raw[y * stride : (y + 1) * stride]
        if line[0] != 0:
            raise ValueError("only filter type 0 is supported")
        rows.append([tuple(line[1 + x * 4 : 5 + x * 4]) for x in range(width)])
    return width, height, rows
