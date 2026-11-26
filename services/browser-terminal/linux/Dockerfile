FROM --platform=$BUILDPLATFORM golang:1.27-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS posh
ADD --checksum=sha256:0fe906adbd0c2f31a2b81df854529aa59e71f3f33a479e41638ca00f67e442bd https://codeload.github.com/JanDeDobbeleer/oh-my-posh/tar.gz/refs/tags/v33.4.1 /tmp/posh.tar.gz
RUN mkdir /src && tar -xzf /tmp/posh.tar.gz -C /src --strip-components=1
WORKDIR /src/src
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=386 go build -trimpath \
    -ldflags='-s -w -X github.com/jandedobbeleer/oh-my-posh/src/build.Version=33.4.1' \
    -o /out/oh-my-posh .

FROM --platform=$BUILDPLATFORM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS shell-plugins
RUN apk add --no-cache bash gawk make git
ADD --checksum=sha256:2e8b73e210e84226b50a96958aad48e6d4a761bef68b6a79fc1f9b62fd896a9d https://codeload.github.com/akinomyoga/ble.sh/tar.gz/152942758f567e51fd17bdc7b3783d27b3c476aa /tmp/ble.tar.gz
ADD --checksum=sha256:a31f459f2647e6d7c48a302845cd8bf80093a10794ed349d6c4a418425a2d1c6 https://codeload.github.com/akinomyoga/blesh-contrib/tar.gz/d2109203480a7dfe1dead5f5f8f9f15a9146c90d /tmp/contrib.tar.gz
RUN mkdir /ble && tar -xzf /tmp/ble.tar.gz -C /ble --strip-components=1 && \
    tar -xzf /tmp/contrib.tar.gz -C /ble/contrib --strip-components=1 && \
    make -C /ble install PREFIX=/out/usr/local
ADD --checksum=sha256:5189baec2b8ba2cea62008faf959b1ea20fd394b09a277e0c78d61a8d092390c https://codeload.github.com/gpakosz/.tmux/tar.gz/58a3dcc0d718ec0fa1c0d5a2fddd640a1ad7a5b7 /tmp/tmux.tar.gz
RUN mkdir -p /out/skel/.tmux && tar -xzf /tmp/tmux.tar.gz -C /out/skel/.tmux --strip-components=1 && \
    ln -s .tmux/.tmux.conf /out/skel/.tmux.conf && \
    cp /out/skel/.tmux/.tmux.conf.local /out/skel/.tmux.conf.local

FROM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS linux

RUN apk add --no-cache bash busybox-suid openssh-client openssh-keygen curl git sudo tmux atuin zoxide perl gawk ncurses linux-virt ca-certificates cpio
COPY --from=posh /out/oh-my-posh /usr/local/bin/oh-my-posh
COPY --from=posh /src/COPYING /usr/share/licenses/oh-my-posh/LICENSE
COPY --from=shell-plugins /out/usr/local/share/blesh /usr/local/share/blesh
COPY --from=shell-plugins /out/skel/ /etc/skel/
COPY tmux.conf.local /tmp/tmux-overrides
RUN cat /tmp/tmux-overrides >> /etc/skel/.tmux.conf.local && rm /tmp/tmux-overrides
COPY orange.omp.json /etc/skel/.config/oh-my-posh/orange.omp.json
COPY atuin.toml /etc/skel/.config/atuin/config.toml
COPY neofetch /usr/local/bin/neofetch
COPY neofetch-LICENSE.txt /usr/share/licenses/neofetch/LICENSE
RUN echo '3dc33493e54029fb1528251552093a9f9a2894fcf94f9c3a6f809136a42348c7  /usr/local/bin/neofetch' | sha256sum -c - && chmod 755 /usr/local/bin/neofetch
COPY bootstrap /init
COPY init /sbin/browser-init
COPY bashrc /etc/skel/.bashrc
RUN chmod 755 /init /sbin/browser-init && \
    adduser -D -s /bin/bash visitor && \
    printf '. ~/.bashrc\n' > /home/visitor/.bash_profile && \
    mkdir -p /home/visitor/.ssh && chmod 700 /home/visitor/.ssh && \
    chown -R visitor:visitor /home/visitor && \
    sed -i 's|:/root:/bin/ash$|:/root:/bin/bash|' /etc/passwd && \
    cp -a /etc/skel/. /root/ && \
    printf '. ~/.bashrc\n' > /root/.bash_profile && \
    passwd -d root && mkdir -p /etc/sudoers.d && \
    printf 'visitor ALL=(ALL:ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/visitor && \
    chmod 440 /etc/sudoers.d/visitor && \
    visudo -cf /etc/sudoers && \
    printf 'browser\n' > /etc/hostname

COPY warm-blesh /tmp/warm-blesh
RUN apk add --no-cache --virtual .ble-cache-tools util-linux-misc && \
    su - root -c 'sh /tmp/warm-blesh' && \
    su - visitor -c 'sh /tmp/warm-blesh' && \
    apk del .ble-cache-tools && rm /tmp/warm-blesh
RUN rm -f /root/.bash_history /home/visitor/.bash_history

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
