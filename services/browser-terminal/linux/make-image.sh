#!/bin/sh
set -eu
tar -cf /tmp/tree.tar -C /rootfs .
n=$(python3 /mktree.py --first /boot-files /tmp/tree.tar /tmp/ordered.tar)
set -- --quiet --tar=f -L kwroot -zzstd,level=15 -C131072 -Efragments --sort=tar --nofrag-first="$n" --MZ
if ! mkfs.erofs "$@" --MZ-front=1 /out/alpine.erofs /tmp/ordered.tar 2>/tmp/layout.log; then
    blocks=$(sed -n 's/.*the metazone needs \([0-9]*\) blocks.*/\1/p' /tmp/layout.log)
    if [ -z "$blocks" ]; then cat /tmp/layout.log; exit 1; fi
    rm -f /out/alpine.erofs
    mkfs.erofs "$@" --MZ-front="$blocks" /out/alpine.erofs /tmp/ordered.tar
fi
rm -f /out/rootfs.tar
cd /out
sha256sum alpine.erofs > SHA256SUMS
