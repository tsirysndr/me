FROM --platform=$BUILDPLATFORM golang:1.27-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS posh
ADD --checksum=sha256:0fe906adbd0c2f31a2b81df854529aa59e71f3f33a479e41638ca00f67e442bd https://codeload.github.com/JanDeDobbeleer/oh-my-posh/tar.gz/refs/tags/v33.4.1 /tmp/posh.tar.gz
RUN mkdir /src && tar -xzf /tmp/posh.tar.gz -C /src --strip-components=1
WORKDIR /src/src
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath \
    -ldflags='-s -w -X github.com/jandedobbeleer/oh-my-posh/src/build.Version=33.4.1' \
    -o /out/oh-my-posh .

FROM --platform=$BUILDPLATFORM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS tmux-config
ADD --checksum=sha256:5189baec2b8ba2cea62008faf959b1ea20fd394b09a277e0c78d61a8d092390c https://codeload.github.com/gpakosz/.tmux/tar.gz/58a3dcc0d718ec0fa1c0d5a2fddd640a1ad7a5b7 /tmp/tmux.tar.gz
RUN mkdir -p /out/skel/.tmux && tar -xzf /tmp/tmux.tar.gz -C /out/skel/.tmux --strip-components=1 && \
    ln -s .tmux/.tmux.conf /out/skel/.tmux.conf && \
    cp /out/skel/.tmux/.tmux.conf.local /out/skel/.tmux.conf.local

FROM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS linux

RUN apk add --no-cache bash fish busybox-suid openssh-client openssh-keygen curl git sudo tmux zoxide perl ncurses less ca-certificates
COPY --from=posh /out/oh-my-posh /usr/local/bin/oh-my-posh
COPY --from=posh /src/COPYING /usr/share/licenses/oh-my-posh/LICENSE
COPY --from=tmux-config /out/skel/ /etc/skel/
COPY tmux.conf.local /tmp/tmux-overrides
RUN cat /tmp/tmux-overrides >> /etc/skel/.tmux.conf.local && rm /tmp/tmux-overrides
COPY orange.omp.json /etc/skel/.config/oh-my-posh/orange.omp.json
COPY config.fish /etc/skel/.config/fish/config.fish
COPY neofetch /usr/local/bin/neofetch
COPY neofetch-LICENSE.txt /usr/share/licenses/neofetch/LICENSE
RUN echo '3dc33493e54029fb1528251552093a9f9a2894fcf94f9c3a6f809136a42348c7  /usr/local/bin/neofetch' | sha256sum -c - && chmod 755 /usr/local/bin/neofetch
COPY inittab /etc/inittab
COPY bashrc /etc/skel/.bashrc
RUN adduser -D -s /usr/bin/fish visitor && \
    printf '. ~/.bashrc\n' > /home/visitor/.bash_profile && \
    mkdir -p /home/visitor/.ssh && chmod 700 /home/visitor/.ssh && \
    chown -R visitor:visitor /home/visitor && \
    sed -i '/^root:/s|:[^:]*$|:/usr/bin/fish|' /etc/passwd && \
    cp -a /etc/skel/. /root/ && \
    printf '. ~/.bashrc\n' > /root/.bash_profile && \
    passwd -d root && mkdir -p /etc/sudoers.d && \
    printf 'visitor ALL=(ALL:ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/visitor && \
    chmod 440 /etc/sudoers.d/visitor && \
    visudo -cf /etc/sudoers && \
    printf 'browser\n' > /etc/hostname

# The bundled unkernel base mounts this read-only distro below a writable overlay.
RUN mkdir /out && printf 'alpine\n' > /usr/lib/kw-distro && \
    printf 'portfolio-alpine-fish-v1\n' > /usr/lib/kw-image && \
    apk info -v | sort > /out/packages.txt && \
    rm -rf /var/cache/apk/* && \
    tar --exclude=./out --exclude=./proc --exclude=./sys --exclude=./dev -cf /out/rootfs.tar -C / .

FROM --platform=$BUILDPLATFORM alpine:3.22.8@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f AS erofs-tools
RUN apk add --no-cache build-base autoconf automake libtool pkgconf zstd-dev lz4-dev util-linux-dev
ADD --checksum=sha256:7d135aa2550326a5acf20f53c518aea5a8900015ce50700044e40f818c31dd80 https://git.kernel.org/pub/scm/linux/kernel/git/xiang/erofs-utils.git/snapshot/erofs-utils-1.9.4.tar.gz /tmp/erofs.tar.gz
COPY *.patch /tmp/patches/
RUN mkdir /erofs && tar -xzf /tmp/erofs.tar.gz -C /erofs --strip-components=1 && \
    cd /erofs && for patchfile in /tmp/patches/*.patch; do patch -p1 < "$patchfile"; done && ./autogen.sh && ./configure --with-libzstd --disable-fuse && \
    make -j4 && make install
RUN apk add --no-cache python3
FROM erofs-tools AS filesystem
COPY --from=linux /out/ /out/
RUN mkdir /rootfs && tar -xpf /out/rootfs.tar -C /rootfs && \
    mkdir -p /rootfs/dev /rootfs/proc /rootfs/sys /rootfs/run /rootfs/tmp

FROM filesystem AS trace
RUN mkfs.erofs -L kwroot -Enoinline_data /out/alpine.erofs /rootfs && \
    rm /out/rootfs.tar && cd /out && sha256sum alpine.erofs > SHA256SUMS

FROM filesystem AS image
COPY boot-files /boot-files
COPY mktree.py /mktree.py
COPY make-image.sh /make-image.sh
RUN sh /make-image.sh

FROM scratch AS trace-output
COPY --from=trace /out/ /

FROM scratch
COPY --from=image /out/ /
