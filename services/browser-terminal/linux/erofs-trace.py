#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
"""The files a traced boot read from an erofs image (guest/lib/image.sh: the
boot set, which goes first in the distro image).

    erofs-trace.py IMAGE TRACE

IMAGE is uncompressed and made with -Enoinline_data, so that every regular
file's data has blocks of its own (FLAT_PLAIN); TRACE is what
`vm-run.ts --trace` wrote for it, one "OFFSET LENGTH" line per read. Prints
each regular file whose data blocks any read touched, one path per line
(relative, no leading slash), in path order; a file with several names
(hard links) once, under its first name in path order.
"""
import bisect
import struct
import sys

FT_REG, FT_DIR = 1, 2
FLAT_PLAIN, FLAT_INLINE = 0, 2


def path_key(p):
    """mktree.py's order: by component, as bytes."""
    return [c.encode("utf-8", "surrogateescape") for c in p.split("/")]


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    img, trace = sys.argv[1:]
    with open(img, "rb") as f:
        data = f.read()
    magic, = struct.unpack_from("<I", data, 1024)
    if magic != 0xE0F5E1E2:
        raise SystemExit(f"erofs-trace: {img}: not an erofs image")
    bits = data[1024 + 12]
    bs = 1 << bits
    root, = struct.unpack_from("<H", data, 1024 + 14)
    meta, = struct.unpack_from("<I", data, 1024 + 40)

    def inode(nid):
        pos = meta * bs + nid * 32
        fmt, icount, mode = struct.unpack_from("<HHH", data, pos)
        # i_size at 8 (u64 extended, u32 compact), i_u (the block) at 16.
        size = struct.unpack_from("<Q" if fmt & 1 else "<I", data, pos + 8)[0]
        blk, = struct.unpack_from("<I", data, pos + 16)
        isize = 64 if fmt & 1 else 32
        xsize = 12 + (icount - 1) * 4 if icount else 0
        return (fmt >> 1) & 7, size, blk, pos + isize + xsize

    def dir_blocks(nid):
        layout, size, blk, tail = inode(nid)
        full = size // bs if layout == FLAT_INLINE else -(-size // bs)
        if layout not in (FLAT_PLAIN, FLAT_INLINE):
            raise SystemExit(f"erofs-trace: {img}: a directory has layout {layout} (compressed?)")
        for i in range(full):
            yield data[(blk + i) * bs:(blk + i) * bs + min(bs, size - i * bs)]
        if layout == FLAT_INLINE and size % bs:
            yield data[tail:tail + size % bs]

    files = {}   # nid -> (path, start, end)
    stack = [(root, "")]
    while stack:
        nid, path = stack.pop()
        for b in dir_blocks(nid):
            n = struct.unpack_from("<H", b, 8)[0] // 12
            ents = [struct.unpack_from("<QHB", b, i * 12) for i in range(n)]
            for i, (cnid, off, ft) in enumerate(ents):
                end = ents[i + 1][1] if i + 1 < n else len(b)
                name = b[off:end].rstrip(b"\0").decode("utf-8", "surrogateescape")
                if name in (".", ".."):
                    continue
                p = f"{path}/{name}" if path else name
                if ft == FT_DIR:
                    stack.append((cnid, p))
                elif ft == FT_REG:
                    layout, size, blk, _ = inode(cnid)
                    if layout != FLAT_PLAIN:
                        raise SystemExit(f"erofs-trace: {img}: /{p} has layout {layout}"
                                         " (want uncompressed and -Enoinline_data)")
                    if size and (cnid not in files or path_key(p) < path_key(files[cnid][0])):
                        files[cnid] = (p, blk * bs, blk * bs + size)

    spans = sorted((s, e, p) for p, s, e in files.values())
    starts = [s for s, _, _ in spans]
    hit = set()
    with open(trace) as f:
        for line in f:
            off, length = map(int, line.split())
            i = max(bisect.bisect_right(starts, off) - 1, 0)
            while i < len(spans) and spans[i][0] < off + length:
                if spans[i][1] > off:
                    hit.add(spans[i][2])
                i += 1
    for p in sorted(hit, key=path_key):
        print(p)


if __name__ == "__main__":
    main()
