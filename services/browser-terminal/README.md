# Browser Linux terminal

The portfolio's floating keyboard button opens shortcut help. **Ctrl +
backtick** toggles a resizable bottom pane; **Ctrl + Shift + backtick** expands
it to fill the page or restores the split. **?** shows shortcuts outside text
fields. The existing **− / +** volume shortcuts stay on the page and do not
intercept terminal input.

Opening the terminal creates an iframe and loads wterm, v86 and a small Alpine
Linux image. No Linux assets are requested during the initial page load. The
guest has GNU Bash, BusyBox's Unix commands, curl, Git, sudo, neofetch, OpenSSH
(`ssh`, `scp`, `sftp`), `ssh-keygen`, tmux with Oh My Tmux, Oh My Posh, ble.sh,
Atuin, and zoxide. Neofetch runs on interactive Bash startup. The `visitor`
account has passwordless sudo, and the guest's root account has an empty
password and Bash as its shell (`sudo -i` or `su -`). Commands run in the
visitor's browser. No host files, login tokens or SSH keys are mounted into the
VM.

Drag the pane divider (or use its arrow keys when focused) to resize the split.
The website scrolls independently in the top pane. Hiding the terminal restores
the website's scroll position and keeps Linux and its files running in the same
tab. Reloading the page or clicking **Restart** starts a fresh VM and clears
temporary files, including any SSH keys or `known_hosts` entries created inside
it.

The VM has 512 MiB of RAM and a 384 MiB tmpfs root filesystem. Boot moves out of
the initial ramfs into this writable mount, so `df -h /` reports its capacity.
`/dev` is a separate devtmpfs for device entries, not the main storage volume.

The virtio console carries terminal input, output, and resize events. Page
volume shortcuts never receive keystrokes from the terminal iframe. Light/dark
theme changes update the terminal without restarting Linux.

## Shell tools

Both `visitor` and root load ble.sh for syntax highlighting and line editing, Oh
My Posh for an orange prompt, and Atuin for searchable local command history.
**Ctrl + R** opens Atuin; the up arrow keeps normal shell history navigation.
Atuin's sync and update checks are disabled and no account is required. Its
history database is inside the temporary VM filesystem and resets on reload.

Run `tmux` to start a multiplexer session. Oh My Tmux is already installed
through `~/.tmux.conf`; edit `~/.tmux.conf.local` to customize it. The
configuration uses ordinary monospace glyphs and orange terminal colors. No Nerd
Font is needed. Neofetch is skipped when opening additional tmux panes.

The prompt configuration is `~/.config/oh-my-posh/orange.omp.json`; Atuin's
configuration is `~/.config/atuin/config.toml`.

Zoxide is initialized for both accounts: use `z <directory>` to jump to a
previously visited directory. Its local database is also temporary. The default
ble.sh keymap is cached during the image build to avoid compiling it on the
visitor's first keypress.

## Networking

The guest uses v86's isolated virtual network (`192.168.86.100`, gateway/DNS
`192.168.86.1`). v86 resolves DNS over HTTPS. SSH connections use the
[Orange Pi WISP relay](../terminal-relay/README.md) at
`wss://tsiry-sandratraina.com/terminal/relay/`. The relay permits public targets
on TCP ports 22, 80 and 443, supporting SSH, curl and Git over HTTPS. Private
networks and other ports are blocked. SSH authentication happens against the
destination server.

The frontend uses its own origin for the relay URL. Production Caddy supplies
this route. For local development, run the relay with
`RELAY_ORIGIN=http://localhost:8017` and proxy `/terminal/relay/` to it; local
commands work without a relay.

## Build

Requires Docker and Node.js 24+. From the repository root:

```sh
docker build --platform linux/386 \
  --output type=local,dest=static/terminal/linux services/browser-terminal/linux
npm ci --ignore-scripts --prefix services/browser-terminal
npm run build --prefix services/browser-terminal
deno task build
```

The Docker build cross-builds the x86 guest on the Mac. It does not run a Nix
build. Linux and frontend assets are committed under `static/terminal/`, so the
Orange Pi's normal Fresh build needs neither Docker nor a guest image rebuild.
The image's package versions and checksums are recorded in
`static/terminal/linux/packages.txt` and `SHA256SUMS`.

The build script pins v86/wterm through npm's lockfile, fetches BIOS files from
v86 commit `9457e7a`, verifies their SHA-256 checksums, and versions frontend
asset URLs. It includes v86's WebAssembly fallback for older browser engines.

## Verification

```sh
npm run test:linux --prefix services/browser-terminal
```

This boots the actual committed kernel/initramfs in v86, verifies Bash, tmux
with Oh My Tmux, Oh My Posh, ble.sh, Atuin history recording, zoxide directory
jumps, OpenSSH, curl, Git, automatic neofetch, passwordless root/sudo, a Unix
pipeline, terminal geometry, root filesystem capacity, an SSH key exchange with
GitHub, an HTTPS download, and Git remote discovery through the production
Orange Pi relay. It does not authenticate to a remote account. Set
`TERMINAL_TEST_RELAY` to test against a different WISP relay. Set `DEBUG_BOOT=1`
for serial boot logs. Website playback tests remain under
`deno test --allow-env=NODE_ENV lib/`.

## Upstream software and sources

- [wterm](https://github.com/vercel-labs/wterm), Apache-2.0; a copy of its
  license ships in `static/terminal/wterm-LICENSE.txt`.
- [v86](https://github.com/copy/v86/tree/9457e7a), BSD-2-Clause; license in
  `static/terminal/v86-LICENSE.txt`.
- [SeaBIOS](https://www.seabios.org/) and
  [VGABIOS](https://www.nongnu.org/vgabios/), GPL/LGPL firmware distributed by
  v86 in its [BIOS directory](https://github.com/copy/v86/tree/9457e7a/bios).
- Alpine Linux 3.22.8 (x86), kernel 6.12.119, Bash 5.2.37 and OpenSSH 10.0p2;
  corresponding package recipes and source references are available in
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
  cross-compiled with Go for Linux/386, with its license in
  `/usr/share/licenses/oh-my-posh` in the guest.
- [ble.sh](https://github.com/akinomyoga/ble.sh/tree/152942758f567e51fd17bdc7b3783d27b3c476aa),
  pinned at `15294275` with contrib `d2109203`; built and installed in
  `/usr/local/share/blesh`, including licenses.
- tmux 3.5a, Atuin 15.0.0, and zoxide 0.9.7 come from Alpine's x86 packages.
  Atuin is the local history package rather than the optional sync variant.

The Dockerfile and guest initialization scripts in `linux/` describe the image
customizations. No SSH daemon runs in the browser image.
