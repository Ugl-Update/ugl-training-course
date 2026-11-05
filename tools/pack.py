"""The pack file: one download that holds many small files (a deck's narration, a page's pictures).

Format: 4-byte little-endian header length, a UTF-8 JSON header {key: [offset, length, mime]}, then the
blobs back to back (offsets count from the end of the header). module.html reads it with readPack().
"""
import json, struct


def pack(items):
    """items: {key: (bytes, mime)} in the order the page needs them (first on the page first)."""
    header, blobs, off = {}, [], 0
    for key, (data, mime) in items.items():
        header[key] = [off, len(data), mime]
        blobs.append(data); off += len(data)
    head = json.dumps(header, separators=(",", ":")).encode()
    return struct.pack("<I", len(head)) + head + b"".join(blobs)


def unpack(raw):
    """-> {key: (bytes, mime)}"""
    hl = struct.unpack("<I", raw[:4])[0]
    head, base = json.loads(raw[4:4 + hl]), 4 + hl
    return {k: (raw[base + v[0]:base + v[0] + v[1]], v[2] if len(v) > 2 else "application/octet-stream") for k, v in head.items()}
