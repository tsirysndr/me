FROM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS linux

RUN apk add --no-cache bash busybox-suid openssh-client openssh-keygen curl git sudo linux-virt ca-certificates cpio
COPY neofetch /usr/local/bin/neofetch
COPY neofetch-LICENSE.txt /usr/share/licenses/neofetch/LICENSE
RUN echo '3dc33493e54029fb1528251552093a9f9a2894fcf94f9c3a6f809136a42348c7  /usr/local/bin/neofetch' | sha256sum -c - && chmod 755 /usr/local/bin/neofetch
COPY init /init
COPY bashrc /etc/skel/.bashrc
RUN chmod 755 /init && \
    adduser -D -s /bin/bash visitor && \
    printf '. ~/.bashrc\n' > /home/visitor/.bash_profile && \
    mkdir -p /home/visitor/.ssh && chmod 700 /home/visitor/.ssh && \
    chown -R visitor:visitor /home/visitor && \
    sed -i 's|:/root:/bin/ash$|:/root:/bin/bash|' /etc/passwd && \
    cp /etc/skel/.bashrc /root/.bashrc && \
    printf '. ~/.bashrc\n' > /root/.bash_profile && \
    passwd -d root && mkdir -p /etc/sudoers.d && \
    printf 'visitor ALL=(ALL:ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/visitor && \
    chmod 440 /etc/sudoers.d/visitor && \
    visudo -cf /etc/sudoers && \
    printf 'browser\n' > /etc/hostname

# Keep only the emulated NIC and console drivers and their dependencies.
RUN kernel="$(ls /lib/modules)" && mkdir /tmp/modules && \
    for driver in ne2k-pci virtio_pci virtio_console; do \
      modprobe -S "$kernel" --show-depends "$driver"; \
    done > /tmp/required-modules && \
    awk '$1 == "insmod" {print $2}' /tmp/required-modules | \
    while read -r module; do cp --parents "$module" /tmp/modules; done && \
    cp /lib/modules/"$kernel"/modules.builtin* /lib/modules/"$kernel"/modules.order /tmp/modules/lib/modules/"$kernel"/ && \
    rm -rf /lib/modules && cp -a /tmp/modules/lib/modules /lib/modules && \
    depmod "$kernel" && rm -rf /tmp/modules /tmp/required-modules

RUN mkdir /out && cp /boot/vmlinuz-virt /out/vmlinuz && \
    apk info -v | sort > /out/packages.txt && \
    rm -rf /boot /var/cache/apk/* /lib/firmware && \
    cd / && find . -path ./out -prune -o -path ./proc -prune -o -path ./sys -prune -o -path ./dev -prune -o -print | \
    cpio -o -H newc 2>/dev/null | gzip -9 > /out/initramfs.gz && \
    cd /out && sha256sum vmlinuz initramfs.gz > SHA256SUMS

FROM scratch
COPY --from=linux /out/ /
