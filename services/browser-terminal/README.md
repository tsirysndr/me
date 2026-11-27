# Browser Linux terminal

The portfolio's floating keyboard button opens shortcut help. **Ctrl +
backtick** toggles a resizable bottom pane; **Ctrl + Shift + backtick** expands
it to fill the page or restores the split. **?** shows shortcuts outside text
fields. The existing **− / +** volume shortcuts stay on the page and do not
intercept terminal input.

Opening the terminal creates an iframe and loads wterm, unkernel and a custom
ARM64 Alpine Linux image. No Linux assets are requested during the initial page
load. The first prompt needs about 8.9 MB of kernel and guest data (plus the
terminal/SDK JavaScript), rather than the complete 31.6 MB distro image. The
compressed kernel downloads in concurrent chunks while a worker prefetches only
the measured boot blocks. At most six asset downloads run concurrently.

The image uses upstream's boot-first EROFS layout. A read-only block device
verifies and caches each 128 KiB block; binaries and libraries for other tools
load only when used. Whole-image caches from the previous loader remain usable.
Kernel and image caches contain immutable software only; guest files still reset
on reload. Cache failures do not prevent boot, and corrupt blocks are fetched
again. The worker owns the kernel, disk and networking so guest work does not
block the page. Timestamped boot logs show downloads, cache hits, compilation,
disk setup, kernel stages and shell readiness.

The guest has Fish, GNU Bash, BusyBox's Unix commands, curl, Git, sudo,
neofetch, OpenSSH (`ssh`, `scp`, `sftp`), `ssh-keygen`, tmux with Oh My Tmux, Oh
My Posh, and zoxide. Fish is the default login shell for both accounts. Neofetch
runs on interactive Fish startup, skipping the package count so it does not load
APK and crypto libraries just for that number. The `visitor` account has
passwordless sudo, and the guest's root account has an empty password (`sudo -i`
or `su -`). Commands run in the visitor's browser. No host files, login tokens
or SSH keys are mounted into the VM.

Drag the pane divider (or use its arrow keys when focused) to resize the split.
The website scrolls independently in the top pane. Hiding the terminal restores
the website's scroll position and keeps Linux and its files running in the same
tab. Reloading the page or clicking **Restart** starts a fresh VM and clears
temporary files, including any SSH keys or `known_hosts` entries created inside
it.

Unkernel runs the Linux kernel as WebAssembly and ARM64 programs through its
userland emulator. The VM has 1 GiB of RAM and a sparse 4 GiB ext4 data disk.
Its EROFS distro is read-only; the root overlay stores guest files on that disk.
The disk uses snapshot mode, so writes remain local to this tab and reset on
reload or Restart. Disk capacity is separate from guest RAM.

The kernel runs in a Web Worker, keeping the website responsive without
requiring cross-origin isolation. Its console carries input, output, and resize
events. Page volume shortcuts never receive keystrokes from the terminal iframe.
Light/dark theme changes update the terminal without restarting Linux.

Unkernel requires WebAssembly JSPI and the other features checked by its SDK. An
unsupported browser receives an explanatory startup error. There is no v86
fallback.

## Shell tools

Both `visitor` and root use Fish's native syntax highlighting, autosuggestions,
and history search. The initial orange prompt uses native Fish to keep boot
small. Run `posh` to enable the installed Oh My Posh prompt on demand. Fish's
configuration is `~/.config/fish/config.fish`; history stays inside the
temporary VM and resets on reload. Bash is also installed for scripts and
interactive use via `bash`.

Run `tmux` to start a multiplexer session. Oh My Tmux is already installed
through `~/.tmux.conf`; edit `~/.tmux.conf.local` to customize it. The
configuration uses ordinary monospace glyphs and orange terminal colors. No Nerd
Font is needed. Neofetch is skipped when opening additional tmux panes.

The prompt configuration is `~/.config/oh-my-posh/orange.omp.json`.

Zoxide is initialized for both accounts: use `z <directory>` to jump to a
previously visited directory. Its local database is also temporary. New tmux
panes use Fish as well.

## Networking

Unkernel's Linux network connects through its SDK's Wisp backend to the
[Orange Pi WISP relay](../terminal-relay/README.md) at
`wss://tsiry-sandratraina.com/terminal/relay/`. The relay permits public targets
on TCP ports 22, 80 and 443, supporting SSH, curl and Git over HTTPS. Private
networks and other ports are blocked. SSH authentication happens against the
destination server.

Public IPv4 `ping` uses a separate ICMP echo bridge through the same Orange Pi
relay URL. The browser preserves the original echo payload and returns a reply
only when the Orange Pi receives one from the target. The relay blocks private
and reserved addresses and bounds probe rates and payload sizes. RTT includes
the relay path. This supports echo requests, not all ICMP types or IPv6 ping.
Wisp's virtual DNS addresses are mapped back to the hostname for echo probes;
the helper resolves and validates its actual public IPv4 address. The
interactive `ping` alias invokes the real BusyBox ping through the guest's
existing passwordless sudo, since its raw socket requires root.

The frontend uses its own origin for the relay URL. Production Caddy supplies
this route. For local development, run the relay with
`RELAY_ORIGIN=http://localhost:8017` and proxy `/terminal/relay/` to it; local
commands work without a relay.

## Build

Requires Docker and Node.js 24+. From the repository root:

```sh
docker build --platform linux/arm64 \
  --output type=local,dest=static/terminal/linux services/browser-terminal/linux
npm ci --ignore-scripts --prefix services/browser-terminal
npm run profile:linux --prefix services/browser-terminal
npm run build --prefix services/browser-terminal
deno task build
```

The Docker build builds the ARM64 guest on the Mac. It does not run a Nix build.
Linux and frontend assets are committed under `static/terminal/`, so the Orange
Pi's normal Fresh build needs neither Docker nor a guest image rebuild. The
image's package versions and checksums are recorded in
`static/terminal/linux/packages.txt` and `SHA256SUMS`.

The build script pins unkernel and wterm through npm's lockfile, copies the SDK,
kernel bundle and licenses locally, and versions SDK and guest asset URLs. No
third-party runtime CDN is used. The Docker image builder labels the EROFS image
`kwroot` and uses Zstandard compression, as required by unkernel's flat memory
mapping (LZ4-compressed EROFS does not boot on this kernel). Upstream's pinned
EROFS layout patch and `mktree.py` put boot files first. `boot-files` lists the
files from a traced plain-image boot, and `boot-profile.json` records the
compressed blocks used before the prompt. The frontend build rejects a stale
profile, then hashes every image block. The image does not need rebuilding on
the Orange Pi.

To retrace the boot file layout after substantial package changes:

```sh
docker build --platform linux/arm64 --target trace-output \
  --output type=local,dest=/tmp/portfolio-trace services/browser-terminal/linux
node --experimental-wasm-jspi services/browser-terminal/profile-boot.mjs \
  /tmp/portfolio-trace/alpine.erofs
python3 services/browser-terminal/linux/erofs-trace.py \
  /tmp/portfolio-trace/alpine.erofs /tmp/me-boot-reads.txt \
  > services/browser-terminal/linux/boot-files
```

Then rebuild the normal image and run `profile:linux` and the frontend build.
The profiling SDK runs locally under Node; it does not need a preview server.

## Verification

```sh
npm run test:assets --prefix services/browser-terminal
npm run test:linux --prefix services/browser-terminal
npm run test:worker --prefix services/browser-terminal
```

The asset tests verify chunk concurrency, ordering, cache reuse, retries,
checksums, storage failure, and cancellation. The Linux smoke test boots the
committed distro in unkernel and verifies Fish as the default shell for both
accounts, Fish history, tmux with Oh My Tmux, Oh My Posh, zoxide directory
jumps, OpenSSH, curl, Git, automatic neofetch, passwordless root/sudo, a Unix
pipeline, terminal geometry, root filesystem capacity, a small initial download
and on-demand reads for other tools, an SSH key exchange with GitHub, an HTTPS
download, and Git remote discovery through the production Orange Pi relay. It
does not authenticate to a remote account. Set `TERMINAL_TEST_RELAY` to test
against a different WISP relay. Node 24 runs the test with
`--experimental-wasm-jspi`. Website playback tests remain under
`deno test --allow-env=NODE_ENV lib/`.

## Upstream software and sources

- [wterm](https://github.com/vercel-labs/wterm), Apache-2.0; a copy of its
  license ships in `static/terminal/wterm-LICENSE.txt`.
- [unkernel](https://github.com/pithings/unkernel/tree/fd204d3), version
  `0.2.0-261126-fd204d3`: MIT SDK, GPL-2.0-or-later kernel and base system.
  Licenses and third-party notices ship under `static/terminal/unkernel-*`;
  corresponding sources and build instructions are in the pinned upstream tree.
- The EROFS layout patch, `mktree.py` and `erofs-trace.py` are vendored from
  [unkernel fd204d3 guest tools](https://github.com/pithings/unkernel/tree/fd204d3/guest/tools),
  retaining their upstream copyright and SPDX headers.
- Alpine Linux 3.22.8 (ARM64), Bash 5.2.37 and OpenSSH 10.0p2; corresponding
  package recipes and source references are available in
  [Alpine aports 3.22](https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.22-stable/main)
  and the
  [Alpine source archive](https://distfiles.alpinelinux.org/distfiles/v3.22/).

- [neofetch 7.1.0](https://github.com/dylanaraps/neofetch/tree/7.1.0), MIT;
  vendored unmodified in `linux/neofetch` with its license, checked against
  SHA-256 `3dc33493e54029fb1528251552093a9f9a2894fcf94f9c3a6f809136a42348c7`.
- [Oh My Tmux](https://github.com/gpakosz/.tmux/tree/58a3dcc0d718ec0fa1c0d5a2fddd640a1ad7a5b7),
  pinned at `58a3dcc0`; the upstream configuration and licenses are installed
  unmodified in `~/.tmux`.
- [Oh My Posh 33.4.1](https://github.com/JanDeDobbeleer/oh-my-posh/tree/v33.4.1),
  cross-compiled with Go for Linux/ARM64, with its license in
  `/usr/share/licenses/oh-my-posh` in the guest.
- Fish, tmux 3.5a, and zoxide 0.9.7 come from Alpine's ARM64 packages.

The Dockerfile and guest initialization scripts in `linux/` describe the image
customizations. No SSH daemon runs in the browser image.
