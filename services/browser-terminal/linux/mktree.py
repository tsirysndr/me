#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (C) 2026 Pooya Parsa <pooya@pi0.io>
"""The final tree of a distro image as a tar stream with the right metadata,
built without root privileges from an unprivileged extraction (STAGE) and
the distro's upstream tarball.

    mktree.py STAGE UPSTREAM.tar.gz OUT.tar --id PREFIX [--debugfs FILE]
              [--keep-mtime DIR]... [--owner PATH=UID:GID]...
    mktree.py --first LIST IN.tar OUT.tar

Every file, directory and symlink under STAGE becomes one entry, in path
order (parents first):
  - owner and permission bits (setuid, setgid, sticky included): the
    upstream tarball's for paths it has, else root:root (or the owner of
    the nearest --owner PATH it is in or under: a user's home) and
    STAGE's bits;
  - hard links: files that share an inode in STAGE (tar -x keeps the
    tarball's) become link entries to the first path;
  - device nodes and FIFOs of the upstream tarball, which an unprivileged
    extraction cannot create, are taken from it as they are;
  - mtime: the upstream tarball's where STAGE still has it (an unchanged
    upstream file), else the newest mtime in the upstream tarball (files
    the build added or changed), so the result does not depend on when it
    was built; files the build put under a --keep-mtime DIR (relative to
    STAGE) keep STAGE's (whole seconds): the build sets them on purpose.
The image id PREFIX-<16 hex digits> is a hash of every entry but the id file
itself (paths, types, modes, owners, link targets and contents; not
times), so an identical rebuild keeps it; it is written to
STAGE/usr/lib/kw-image and into the tar, and printed.
--debugfs FILE writes debugfs commands that give an ext4 image made with
`mke2fs -d STAGE` the same owners, modes and times (sif per inode).

--first copies such a stream with the regular files that LIST names (one
path per line, as guest/tools/erofs-trace.py prints them) moved to the
front, in LIST's order, and prints how many (# lines are comments). Each
should be a file with data, not a hard link entry (the first name of its
inode in path order; another name is skipped with a message);
the rest keep their order, so links still follow their target. The tree
the stream describes, and so the image id, stay the same; mkfs.erofs
--sort=tar then puts those files' data first (lib/image.sh).
"""
import hashlib
import os
import stat
import sys
import tarfile

ID_FILE = "usr/lib/kw-image"


def norm(name):
    n = name
    while n.startswith("./"):
        n = n[2:]
    n = n.strip("/")
    return "" if n in ("", ".") else n


def walk(stage):
    """Paths relative to STAGE in tar order: each directory, then its
    entries sorted by name (bytes)."""
    out = [""]

    def rec(rel):
        full = os.path.join(stage, rel) if rel else stage
        for name in sorted(os.listdir(full), key=os.fsencode):
            p = f"{rel}/{name}" if rel else name
            out.append(p)
            st = os.lstat(os.path.join(stage, p))
            if stat.S_ISDIR(st.st_mode):
                rec(p)

    rec("")
    return out


def first(listfile, src, out):
    with open(listfile) as f:
        names = list(dict.fromkeys("./" + l.rstrip("\n") for l in f if l.strip() and not l.startswith("#")))
    with tarfile.open(src) as t, tarfile.open(out, "w", format=tarfile.GNU_FORMAT) as o:
        members = t.getmembers()
        by_name = {m.name: m for m in members}
        front = []
        for n in names:
            m = by_name.get(n)
            if m is None or not m.isreg() or not m.size:
                # A recorded list (guest/distro/NAME/boot-files) may be older than the tree.
                print(f"mktree: --first: {n[2:]} is not a file with data in {src}: skipped", file=sys.stderr)
                continue
            front.append(m)
        moved = {id(m) for m in front}
        for m in front + [m for m in members if id(m) not in moved]:
            o.addfile(m, t.extractfile(m) if m.isreg() else None)
    print(len(front))


def main():
    args = sys.argv[1:]
    if args[:1] == ["--first"] and len(args) == 4:
        return first(*args[1:])
    debugfs = None
    prefix = None
    keep = []
    owners = {}
    pos = []
    while args:
        a = args.pop(0)
        if a == "--debugfs":
            debugfs = args.pop(0)
        elif a == "--id":
            prefix = args.pop(0)
        elif a == "--keep-mtime":
            keep.append(norm(args.pop(0)))
        elif a == "--owner":
            path, _, ids = args.pop(0).rpartition("=")
            uid, _, gid = ids.partition(":")
            owners[norm(path)] = (int(uid), int(gid))
        else:
            pos.append(a)
    if len(pos) != 3 or not prefix:
        raise SystemExit(__doc__)
    stage, upstream, out = pos

    up = {}
    with tarfile.open(upstream) as t:
        for m in t.getmembers():
            up[norm(m.name)] = m
    epoch = max(m.mtime for m in up.values())

    entries = []   # (path, TarInfo, file path or None)
    inodes = {}
    for p in walk(stage):
        full = os.path.join(stage, p) if p else stage
        st = os.lstat(full)
        u = up.get(p)
        i = tarfile.TarInfo("./" + p if p else ".")
        if u is not None:
            i.mode, i.uid, i.gid = u.mode & 0o7777, u.uid, u.gid
            i.mtime = u.mtime if int(st.st_mtime) == u.mtime else epoch
        else:
            i.mode, i.uid, i.gid = stat.S_IMODE(st.st_mode), 0, 0
            o = max((k for k in owners if p == k or p.startswith(k + "/")), key=len, default=None)
            if o is not None:
                i.uid, i.gid = owners[o]
            kept = any(p.startswith(k + "/") for k in keep) and not stat.S_ISDIR(st.st_mode)
            i.mtime = int(st.st_mtime) if kept else epoch
        i.uname = i.gname = ""
        src = None
        if stat.S_ISDIR(st.st_mode):
            i.type = tarfile.DIRTYPE
        elif stat.S_ISLNK(st.st_mode):
            i.type = tarfile.SYMTYPE
            i.linkname = os.readlink(full)
            i.mode = 0o777
        elif stat.S_ISREG(st.st_mode):
            key = (st.st_dev, st.st_ino)
            if st.st_nlink > 1 and key in inodes:
                i.type = tarfile.LNKTYPE
                i.linkname = "./" + inodes[key]
            else:
                inodes[key] = p
                i.type = tarfile.REGTYPE
                i.size = st.st_size
                src = full
        else:
            raise SystemExit(f"mktree: {p}: unexpected file type {st.st_mode:o}")
        entries.append((p, i, src))
    # Device nodes and FIFOs the extraction could not make (their parents
    # exist in STAGE, or the upstream tarball would not be a root fs).
    have = {p for p, _, _ in entries}
    for p, u in sorted(up.items()):
        if p not in have and (u.ischr() or u.isblk() or u.isfifo()):
            i = tarfile.TarInfo("./" + p)
            i.type, i.mode, i.uid, i.gid, i.mtime = u.type, u.mode & 0o7777, u.uid, u.gid, u.mtime
            i.devmajor, i.devminor = u.devmajor, u.devminor
            i.uname = i.gname = ""
            entries.append((p, i, None))
    entries.sort(key=lambda e: [os.fsencode(c) for c in e[0].split("/")] if e[0] else [])

    h = hashlib.sha256()
    for p, i, src in entries:
        if p == ID_FILE:
            continue
        h.update(f"{p}\0{i.type.decode()}\0{i.mode:o}\0{i.uid}:{i.gid}\0{i.linkname}\0"
                 f"{i.devmajor}:{i.devminor}\0".encode())
        if src:
            fh = hashlib.sha256()
            with open(src, "rb") as f:
                for b in iter(lambda: f.read(1 << 20), b""):
                    fh.update(b)
            h.update(fh.digest())
    image_id = f"{prefix}-{h.hexdigest()[:16]}"
    idpath = os.path.join(stage, ID_FILE)
    with open(idpath, "w") as f:
        f.write(image_id + "\n")
    os.chmod(idpath, 0o644)
    if ID_FILE not in have:
        i = tarfile.TarInfo("./" + ID_FILE)
        i.mode, i.mtime, i.uname, i.gname = 0o644, epoch, "", ""
        entries.append((ID_FILE, i, idpath))
        entries.sort(key=lambda e: [os.fsencode(c) for c in e[0].split("/")] if e[0] else [])
    for p, i, src in entries:
        if p == ID_FILE:
            i.size = os.path.getsize(idpath)
            i.mode, i.uid, i.gid, i.mtime = 0o644, 0, 0, epoch

    with tarfile.open(out, "w", format=tarfile.GNU_FORMAT) as t:
        for p, i, src in entries:
            if src:
                with open(src, "rb") as f:
                    t.addfile(i, f)
            else:
                t.addfile(i)

    if debugfs:
        ftype = {tarfile.DIRTYPE: stat.S_IFDIR, tarfile.REGTYPE: stat.S_IFREG,
                 tarfile.SYMTYPE: stat.S_IFLNK, tarfile.CHRTYPE: stat.S_IFCHR,
                 tarfile.BLKTYPE: stat.S_IFBLK, tarfile.FIFOTYPE: stat.S_IFIFO}
        cmds = []
        for p, i, src in entries:
            if i.type == tarfile.LNKTYPE:
                continue   # the same inode as its target
            if i.type in (tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE):
                raise SystemExit(f"mktree: {p}: device nodes are not supported for ext4 (mke2fs -d)")
            if '"' in p or "\n" in p:
                raise SystemExit(f"mktree: unsupported path {p!r}")
            q = f'"/{p}"'
            cmds += [f"sif {q} uid {i.uid}", f"sif {q} gid {i.gid}"]
            if i.type != tarfile.SYMTYPE:
                cmds.append(f"sif {q} mode 0{ftype[i.type] | i.mode:o}")
            for f in ("atime", "mtime", "ctime", "crtime"):
                cmds.append(f"sif {q} {f} @{i.mtime}")
        with open(debugfs, "w") as f:
            f.write("\n".join(cmds) + "\n")

    print(image_id)


if __name__ == "__main__":
    main()
