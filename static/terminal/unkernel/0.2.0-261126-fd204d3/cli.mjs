#!/usr/bin/env node
import * as nodeModule from "node:module";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
nodeModule.enableCompileCache?.();
const { BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, KernelInstance, NetStack, bundledBoot, cliSound, createImageFromKwsparse, createKernelOn, decodeSnapshot, directBackend, distroFetcher, domCodeToLinux, encodeSnapshot, formatProfile, frameToPpm, isCheckout, moduleIsMemory64, nodeFs, nodePlatform, openDisk, serveWasiPrograms, smpKernelFromBundle, symbolizeProfile, wispBackend } = await import("./_chunks/cli-imports.mjs");
const bundledKernelUrl = new URL("./unkernel.wasm", import.meta.url);
const fetchDistro = distroFetcher(new URL("..", import.meta.url));
const USAGE = `Usage: unkernel [kernel.wasm | --kernel kernel.wasm] [--distro alpine|debian|none|FILE|URL]
       [--initrd none|NAME|file.cpio[.gz]] [--append "cmdline"] [--user NAME]
       [--mem MiB] [--timeout seconds] [--input "text"] [--input-delay seconds]
       [--size COLSxROWS] [--stats] [--profile FILE [--profile-hz N] [--profile-insns N] [--profile-root DIR]]
       [--disk image.ext4[:ro]|URL[:ro]]... [--snapshot]
       [--data FILE [--data-template FILE.kwsparse.gz]]
       [--no-net | --net-wisp URL] [--net-mtu N] [--no-jit] [--display[=WxH[@DPI]]] [--gpu]
       [--sound | --sound-wav FILE] [--no-vsock] [--shm] [--worker[=shared|messages]] [--cpus N]
       [--mount HOSTDIR:GUESTPATH[:ro]]... [--forward HOSTPORT:GUESTPORT]... [--wasi]
       [--restore FILE]

With no arguments it boots Alpine on the bundled kernel, interactive on this
terminal; Ctrl-] quits. The bundled kernel (unkernel.wasm: vmlinux32.wasm with
a small base initramfs, its command line, the data disk template and the patch
to the SMP kernel in custom sections) mounts a distro image read-only under an
overlay root and runs its /sbin/init; the root's changes go to the data disk's
/data/distros/NAME/ with --data, else to memory. Without a distro it starts the
base shell (busybox and the kw tools).

--distro picks the distro image: alpine (the default) or debian, none (the
base shell), an image FILE, or an http(s) URL served with Range support. An
image is an erofs or ext4 file system labelled kwroot, attached read-only as
/dev/wda, before any --disk and --data, and never written. A NAME is, in a
source checkout, vendor/build/distro/NAME.erofs (or NAME.ext4 when there is no
.erofs or the kernel has no erofs; kernel/build.sh distro NAME builds them);
in an installed package it is downloaded on first use from the GitHub release
of the package's version (checked against its distros.json) and kept in
~/.cache/unkernel ($XDG_CACHE_HOME/unkernel; UNKERNEL_CACHE_DIR overrides it,
UNKERNEL_RELEASE_URL the release). With --initrd, --append or --disk there is
no default distro (add --distro to have one), and --restore uses the image the
snapshot names.

The distro images' console and the SDK's sessions run as the user "user" (uid
1000, home /home/user), who has sudo without a password; --user NAME makes the
console NAME's (root: --user root), appending kw.user=NAME to the command line.
The base shell is root's.

--kernel (or a positional path) replaces the kernel: a bundle, or a plain build
(vendor/build/kernel/vmlinux32.wasm, or the wasm64 reference build
vendor/build/kernel/vmlinux), which boots the base initramfs from
vendor/build/initramfs/base.cpio of a source checkout unless --initrd is given;
the memory type is detected from the module. --initrd replaces the initramfs:
a file, none, or a NAME from vendor/build/initramfs/ (base, base-test); the
bundle's command line is then not used ("console=hvc0 rdinit=/init" unless
--append is given). The kernel tests (kwtest, abitest, kwbench) are in a source
checkout's bundle, and always in base-test.cpio:
--initrd base-test --append "console=hvc0 rdinit=/usr/bin/kwtest" (exit 0, or 1
on a failure).

--disk attaches a kwblk disk (/dev/wda, then wdb, ...; repeatable): a disk image
file (read and written in place), or an http(s) URL served with Range support
(writes kept in memory). A :ro suffix attaches it read-only (the guest's writes
fail). With a disk and no --distro, --initrd or --append, it boots
"root=/dev/wda rw" without an initramfs (an ext4 root file system of your own).
--snapshot keeps writes to file images in memory (discarded at exit).

--data FILE attaches the persistent data disk (the ext4 file system labelled
kwdata that the page keeps in IndexedDB; the base mounts it at /data) after the
--distro and --disk disks: wda without them. If FILE does not exist it is
created (sparse, 4 GiB) from the data disk template: --data-template, else the kernel's bundled
one (custom section unkernel.datadisk), else vendor/build/disk/kwdata.kwsparse.gz
(kernel/build.sh datadisk). An existing FILE is used in place, like --disk
(--snapshot applies too).

Networking (a user-mode NAT over host sockets) is on by default: --no-net
disables it, --net-mtu N sets the MTU handed out by DHCP. The guest is
10.0.2.15, gateway 10.0.2.2 (= host 127.0.0.1), DNS 10.0.2.3. --net-wisp URL
sends the guest's TCP through a Wisp server instead (handshake with
Origin: http://localhost, which wss://wisp.pi0.io:6680/ requires).

kwemu's JIT tier (hot guest code compiled to WebAssembly) is offered by default;
--no-jit runs the interpreter only (a kernel built without the JIT never
asks, and --stats then says "not in this kernel"). --stats prints the JIT counters at exit, and kwemu's own (exits, compiled share) from a
kernel built by kernel/build.sh stats.

--profile FILE samples where guest user time goes and writes a JSON histogram
to FILE at exit (time samples, instruction samples, the block that ran before
a time sample and the kwemu tier that saw it; by file and file offset over
all processes, per 4 KiB page of a file time against instructions, and per
command, process and user pc), with a short table on stderr. Time samples
(--profile-hz N per CPU, default 1000) need the SMP kernel's shared memory,
so --cpus 2 or more; without it there are instruction samples only (one
every --profile-insns N user instructions of a CPU, default 1000000; 0 turns
either off). --profile-root DIR names the code with ELF symbols, reading
the guest's files from a host copy of its root (for example
vendor/build/distro/debian-root).

--worker runs the kernel in a worker thread (createKernel({ worker: true })),
with the disks and the network built there from specs; the display, the input
tokens and the sound work with it too. Console and evdev input and frames go
through shared memory (read by the worker while the kernel runs);
--worker=messages sends them as messages instead (handled when the kernel
yields, up to 20 ms while the guest is busy), --worker=shared insists on
shared memory. PCM goes through shared memory too unless --worker=messages;
everything else is messages either way.

--cpus N gives an SMP kernel (one built with CONFIG_SMP: kw_smp.config)
N CPUs, each another instance of the kernel in its own thread on a shared
memory, each with its own JIT; it implies --worker, and --stats prints the
JIT counters per CPU. A UP kernel runs on one CPU (a log line says so). An SMP kernel has every device
(their host side and their I/O stay with CPU 0) and snapshots.

--display gives the guest a display: /dev/fb0 (kwfb, 32 bpp XRGB8888), whose
memory exists while a program has it open; 640x480, or --display=WxH (the
kernel caps it at 1M pixels by dividing both sides by an integer; a program
may set its own size). --display=WxH@DPI also tells the guest the pixel
density, which it sees as the picture's physical size. Without it there is no
/dev/fb0. {fb=FILE} in --input saves the current frame. It also gives the guest
a keyboard, a mouse and an absolute pointer (a tablet; evdev: /dev/input/event0,
event1, event2), fed by these --input tokens, which reach the guest only while a
program has the device open:
{key=K} = press and release key K, {key=K:1} = press, {key=K:0} = release
(K: a Linux key code, or a DOM KeyboardEvent.code such as KeyA or ArrowUp),
{rel=DX,DY} = mouse motion, {btn=B:1} / {btn=B:0} = press / release button B
(left, right, middle, or a code), {wheel=N} = wheel clicks (positive = up);
for the tablet {abs=X,Y} = move to pixel X,Y of the current mode (or X%,Y% of
the picture), {abtn=B:1|0} and {awheel=N} as above.

--gpu gives the guest a virtio-gpu device (kwvirtio): /dev/dri/card0, driver
virtio_gpu, KMS with dumb buffers (2D, no 3D). While a KMS client has a
framebuffer on its scanout the display shows that instead of /dev/fb0's
pixels; its size is --display's (implied, 640x480 by default).

--sound-wav FILE gives the guest a sound card (kwsnd: ALSA hw:0,0, i.e.
/dev/snd/pcmC0D0p, and OSS /dev/dsp; playback only) and writes what it plays
to FILE as a WAV, in the format of the first stream (later ones are
converted; gaps are not recorded). --sound gives the card and drops the
output. Without either there is no sound card. Try glimmer --test (with
--display: a 3 s test signal) or the game, glimmer, in the guest.

The guest has a vsock device (kwvsock: AF_VSOCK, guest CID 3, host CID 2)
with nothing listening on the host, so guest connections to CID 2 are
refused; the SDK's vm.vsock listens and connects. --no-vsock leaves it out:
the guest has no vsock transport (connect() fails with ENODEV).

--mount HOSTDIR:GUESTPATH mounts a host directory in the guest (repeatable):
the SDK serves it over 9p on vsock and the guest's kw9p mounts it once kwtty
answers (it needs vsock). :ro makes it read-only. Each guest write(2) reaches
the host as it happens; host changes show in the guest within 1 s. Files show
as uid and gid 1000's (the distro images' user); symlinks stay symlinks and are
never followed on the host.

--forward HOSTPORT:GUESTPORT listens on the host's 127.0.0.1:HOSTPORT and
connects each connection to the guest's 127.0.0.1:GUESTPORT (repeatable), e.g.
--forward 8000:80 for a web server in the guest: through kwtty over vsock (the
SDK's vm.connect()), not the network, so it works with --no-net too, and it
needs vsock. Half-closes pass through; a refused guest port resets the host
connection.

--wasi (prototype) runs the guest's WASI programs (wasm32-wasi .wasm files,
preview 1 or 0, executable, run by path) on this host's wasm engine, each in
a worker thread of its own: the guest's binfmt_misc hands them to kwwasi
(/usr/lib/kw/kwwasi, a link to kwbox), which talks to the host over vsock
port 1021 and does the program's file I/O in the guest, as that process;
killing kwwasi ends the program. It needs vsock, and kwwasi registered in
the guest (the kw layer's /usr/lib/kw/rc does it at boot, also in the base
shell).

--shm gives the guest kwshm (/dev/kwshm: guest programs export shmem files to
the host, which reads and writes their pages in place; the SDK's vm.shm). The
CLI itself opens nothing; it is there for kwtest's checks. Without it there is
no /dev/kwshm.

Interactive when stdin is a TTY (raw mode; Ctrl-] quits). With --input, the text
is typed into the console after boot (\\n = Enter, ^C = Ctrl-C, {N} = pause N
seconds, {sync} = ask the guest to sync, as the page does before the tab goes
away: it writes back all file systems and flushes its disks, and the time to
the next block flush is logged; {fb=FILE} = write the display's frame to FILE
as a PPM, with --display); handy for tests. Otherwise a piped stdin is
the console input.

Snapshots: {save=FILE} in --input saves the running machine to FILE and lets
it run on, {suspend=FILE} saves it and stops it (exit 0, no clean shutdown),
and --restore FILE resumes one instead of booting, with the same kernel (the
snapshot carries the memory size; --mem, --initrd and --append do not apply)
and the same devices (--no-net, --no-vsock, --display, --sound and --shm as
when it was saved), with or without --worker, and on as many CPUs (--cpus
defaults to the snapshot's; another count is refused). --mount directories survive
(without --worker), with the guest's open files on them: pass the same
--mount options again (a file deleted meanwhile gives "Stale file handle").
Other vsock sessions (--forward connections) and the guest's TCP connections
do not survive a restore: the guest's ends are reset. Disks are not copied: pass the
same --disk and --data images, unchanged; the distro image is the one the
snapshot names unless --distro is given (it is identified by its content, and a
file also by its size and mtime). A restore
refuses a disk that was written after the snapshot (by the guest running on after {save}, a
later boot, or another program), and the first write after a restore makes the
snapshot unrestorable. A writable image FILE gets a FILE.kwsnap with its write
generation when a snapshot first includes it.

The guest console (hvc0) gets the window size of stdout when it is a TTY, and
follows its resizes; --size COLSxROWS sets a fixed size instead.

Exit codes: 0 power off, 1 halt (kwtest on failure) or boot failure, 2 restart,
124 --timeout, 253 kernel panic, 254 wasm trap, 255 host runtime error.`;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
	process.stdout.write(`${USAGE}\n`);
	process.exit(0);
}
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const positional = args[0] && !args[0].startsWith("--") ? args[0] : void 0;
const diskSpecs = args.flatMap((a, i) => a === "--disk" ? [args[i + 1]] : []);
const initrdArg = opt("initrd");
const appendArg = opt("append");
const restorePath = opt("restore");
let restore;
if (restorePath) try {
	restore = decodeSnapshot(new Uint8Array(readFileSync(restorePath)));
} catch (e) {
	process.stderr.write(`[host] cannot load the snapshot ${path.relative(process.cwd(), restorePath) || restorePath}: ${e.message}\n`);
	process.exit(1);
}
const distroArg = opt("distro");
const snapDistro = restore?.disks[0]?.identity.startsWith("distro ") ? restore.disks[0].name : void 0;
const distroOpt = distroArg === "none" ? void 0 : distroArg ?? (restore ? snapDistro : initrdArg !== void 0 || appendArg !== void 0 || diskSpecs.length ? void 0 : "alpine");
const diskBoot = diskSpecs.length > 0 && !distroOpt;
const initrdOpt = initrdArg ?? (diskBoot ? "none" : "bundled");
const kernelOpt = positional ?? opt("kernel");
const kernelPath = kernelOpt ?? fileURLToPath(bundledKernelUrl);
const memoryMiB = Number(opt("mem", "2048"));
const timeout = Number(opt("timeout", "0"));
const scripted = opt("input");
const rel = (p) => path.relative(process.cwd(), p) || p;
const workerArg = args.find((a) => a === "--worker" || a.startsWith("--worker="));
const profileFile = opt("profile");
const profileRoot = opt("profile-root");
const profile = profileFile === void 0 ? void 0 : {
	hz: Number(opt("profile-hz", "1000")),
	insns: Number(opt("profile-insns", "1000000"))
};
if (profile && (!profileFile || profileFile.startsWith("--") || !(profile.hz >= 0) || !(profile.insns >= 0) || profileRoot?.startsWith("--") || args.includes("--profile-root") && !profileRoot)) {
	process.stderr.write("[host] --profile FILE [--profile-hz N] [--profile-insns N] [--profile-root DIR]\n");
	process.exit(1);
}
const smpCpus = Number(opt("cpus", String(restore?.cpus ?? 1)));
if (!Number.isInteger(smpCpus) || smpCpus < 1 || smpCpus > 32) {
	process.stderr.write("[host] --cpus N: 1 to 32 CPUs\n");
	process.exit(1);
}
const worker = !!workerArg || smpCpus > 1;
const workerTransport = workerArg?.slice(9);
if (workerTransport && workerTransport !== "shared" && workerTransport !== "messages") {
	process.stderr.write("[host] --worker=shared|messages\n");
	process.exit(1);
}
const t0 = performance.now();
let module;
let kernelHasErofs = false;
try {
	let bytes = readFileSync(kernelPath);
	if (smpCpus > 1) {
		const tp = performance.now();
		const smp = await smpKernelFromBundle(bytes);
		if (smp) {
			bytes = smp;
			process.stderr.write(`[host] SMP kernel from the bundle's patch (${(performance.now() - tp).toFixed(0)} ms)\n`);
		}
	}
	module = await WebAssembly.compile(bytes);
	kernelHasErofs = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes("cannot find valid erofs superblock");
} catch (e) {
	const err = e;
	const hint = err.code === "ENOENT" && !kernelOpt ? " (build it with kernel/build.sh base, or pass --kernel)" : "";
	process.stderr.write(`[host] cannot load the kernel ${rel(kernelPath)}: ${err.message}${hint}\n`);
	process.exit(1);
}
const tCompile = performance.now() - t0;
const bundled = bundledBoot(module);
const useBundle = initrdOpt === "bundled" && !!bundled.initrd;
if (initrdOpt === "bundled" && !useBundle && !existsSync(path.join(root, "vendor/build/initramfs/base.cpio"))) {
	process.stderr.write(`[host] the kernel ${rel(kernelPath)} has no bundled initramfs: pass --initrd FILE (or none)\n`);
	process.exit(1);
}
const initrdName = initrdOpt === "bundled" ? "base" : initrdOpt;
const initrdPath = useBundle ? "bundled" : initrdName === "none" || /[/.]/.test(initrdName) ? initrdName : path.join(root, "vendor/build/initramfs", `${initrdName}.cpio`);
const userArg = opt("user");
const cmdline = (appendArg ?? (useBundle && bundled.cmdline ? bundled.cmdline : (diskSpecs.length || distroOpt) && initrdPath === "none" ? `console=hvc0 root=/dev/wda ${distroOpt ? "ro" : "rw"}` : "console=hvc0 rdinit=/init")) + (userArg ? ` kw.user=${userArg}` : "");
let initrd;
try {
	initrd = useBundle ? void 0 : initrdPath === "none" ? null : new Uint8Array(readFileSync(initrdPath));
} catch (e) {
	const hint = /[/.]/.test(initrdName) ? "" : isCheckout(root) ? ` (kernel/build.sh base builds base.cpio and base-test.cpio)` : ` (a NAME is a file of a source checkout's vendor/build/initramfs/; pass a path)`;
	process.stderr.write(`[host] cannot load the initrd ${rel(initrdPath)}: ${e.message}${hint}\n`);
	process.exit(1);
}
let progressOpen = false;
let distro;
if (distroOpt) {
	const how = distroArg === void 0 ? "the default distro, alpine" : `--distro ${distroOpt}`;
	if (/^https?:\/\//.test(distroOpt)) distro = distroOpt;
	else if (/^[a-z0-9]+$/.test(distroOpt) && !existsSync(distroOpt)) {
		const at = (ext) => path.join(root, "vendor/build/distro", `${distroOpt}.${ext}`);
		const found = (kernelHasErofs ? ["erofs", "ext4"] : ["ext4", "erofs"]).map(at).filter((f) => existsSync(f));
		const none = `; --distro FILE boots an image file${distroArg === void 0 ? ", --distro none the base shell without a distro" : ""}`;
		if (found.length) {
			distro = found[0];
			if (!kernelHasErofs && distro.endsWith(".erofs")) process.stderr.write(`[host] ${how}: the kernel ${rel(kernelPath)} seems to have no erofs, and there is no ${rel(at("ext4"))}\n`);
		} else if (isCheckout(root)) {
			process.stderr.write(`[host] ${how}: no image ${rel(at("erofs"))}: build it with kernel/build.sh distro ${distroOpt}, or pass an image file or URL${none}\n`);
			process.exit(1);
		} else try {
			distro = await fetchDistro(distroOpt, { onProgress: downloadProgress() });
		} catch (e) {
			process.stderr.write(`${progressOpen ? "\n" : ""}[host] ${how}: ${e.message}${none}\n`);
			process.exit(1);
		}
	} else if (!existsSync(distroOpt)) {
		process.stderr.write(`[host] --distro: no file ${distroOpt}\n`);
		process.exit(1);
	} else distro = distroOpt;
}
function downloadProgress() {
	const tty = process.stderr.isTTY;
	let shown = -1, started = false;
	return (p) => {
		if (p.stage === "download" && p.total) {
			const pct = Math.floor(100 * (p.loaded ?? 0) / p.total);
			if (!started) {
				started = true;
				process.stderr.write(`[host] downloading ${p.file} (${(p.total / 1048576).toFixed(1)} MiB) from ${p.url} to ${p.path}\n`);
			}
			if (tty && pct !== shown) {
				shown = pct;
				progressOpen = true;
				process.stderr.write(`\r\x1b[K[host] ${p.file}: ${pct}%`);
			}
		} else if (p.stage === "done" && started) {
			process.stderr.write(`${tty ? "\r\x1B[K" : ""}[host] ${p.file}: downloaded and verified\n`);
			progressOpen = false;
		}
	};
}
process.stderr.write(`[host] kernel ${rel(kernelPath)}, initrd ${useBundle ? "bundled" : initrdPath === "none" ? "none" : rel(initrdPath)}${distro ? `, distro ${/^https?:/.test(distro) ? distro : rel(distro)}` : ""}\n`);
const disks = [];
const diskSpecsOut = [];
const addDisk = async (arg) => {
	const ro = arg.endsWith(":ro") && !existsSync(arg);
	const spec = ro ? arg.slice(0, -3) : arg;
	if (!worker) disks.push(await openDisk(spec, {
		snapshot: flag("snapshot"),
		readOnly: ro
	}));
	else diskSpecsOut.push(/^https?:\/\//.test(spec) ? {
		kind: "http",
		url: spec,
		readOnly: ro
	} : {
		kind: "file",
		path: spec,
		snapshot: flag("snapshot"),
		readOnly: ro
	});
};
const diskCount = () => (distro ? 1 : 0) + disks.length + diskSpecsOut.length;
for (const spec of diskSpecs) await addDisk(spec);
const dataPath = opt("data");
if (dataPath) {
	if (!existsSync(dataPath)) {
		const tplPath = opt("data-template") ?? (bundled.datadisk ? void 0 : path.join(root, "vendor/build/disk/kwdata.kwsparse.gz"));
		if (tplPath && !existsSync(tplPath)) {
			process.stderr.write(`[host] --data: no ${dataPath} and no template ${rel(tplPath)} (kernel/build.sh datadisk)\n`);
			process.exit(1);
		}
		const r = await createImageFromKwsparse(dataPath, tplPath ? readFileSync(tplPath) : bundled.datadisk);
		process.stderr.write(`[host] data disk: created ${dataPath} (${r.size / 1048576} MiB) from ${tplPath ? rel(tplPath) : "the bundled template"}\n`);
	}
	await addDisk(dataPath);
	process.stderr.write(`[host] data disk: ${dataPath} is /dev/wd${String.fromCharCode(96 + diskCount())}\n`);
}
const log = (m) => process.stderr.write(m + "\n");
const wisp = opt("net-wisp");
const mtu = opt("net-mtu");
const useNet = !flag("no-net");
const netSpec = useNet && worker ? {
	kind: "net",
	backend: wisp ? {
		kind: "wisp",
		servers: wisp
	} : { kind: "direct" },
	hostLoopback: !wisp,
	mtu: mtu ? Number(mtu) : void 0
} : void 0;
const net = !useNet || worker ? void 0 : new NetStack({
	backend: wisp ? wispBackend(wisp, { log }) : directBackend(),
	hostLoopback: !wisp,
	mtu: mtu ? Number(mtu) : void 0,
	log
});
if (restorePath && restore) process.stderr.write(`[host] restoring ${rel(restorePath)} (${restore.memory.byteLength / 1048576} MiB${(restore.cpus ?? 1) > 1 ? `, ${restore.cpus} CPUs` : ""})\n`);
const sizeOpt = opt("size")?.match(/^(\d+)x(\d+)$/);
const consoleSize = sizeOpt ? {
	cols: Number(sizeOpt[1]),
	rows: Number(sizeOpt[2])
} : process.stdout.isTTY ? {
	cols: process.stdout.columns,
	rows: process.stdout.rows
} : void 0;
const displayArg = args.find((a) => a.startsWith("--display="))?.slice(10).match(/^(\d+)x(\d+)(?:@(\d+))?$/);
if (args.some((a) => a.startsWith("--display=")) && !displayArg) {
	process.stderr.write("[host] --display=WxH[@DPI]: expected a size such as 1280x720 or 1280x720@96\n");
	process.exit(1);
}
const displaySize = displayArg ? {
	width: Number(displayArg[1]),
	height: Number(displayArg[2]),
	dpi: displayArg[3] ? Number(displayArg[3]) : void 0
} : void 0;
const sound = cliSound(opt("sound-wav"), flag("sound"), log);
const mounts = {};
for (const [i, a] of args.entries()) {
	if (a !== "--mount") continue;
	const m = /^(.+?):(\/[^:]*)(?::(ro|rw))?$/.exec(args[i + 1] ?? "");
	if (!m) {
		process.stderr.write(`[host] --mount HOSTDIR:GUESTPATH[:ro], not ${JSON.stringify(args[i + 1] ?? "")}\n`);
		process.exit(1);
	}
	const dir = path.resolve(m[1]);
	if (!existsSync(dir) || !statSync(dir).isDirectory()) {
		process.stderr.write(`[host] --mount: ${rel(dir)} is not a directory\n`);
		process.exit(1);
	}
	mounts[m[2]] = {
		fs: nodeFs(dir),
		readOnly: m[3] === "ro"
	};
}
if (Object.keys(mounts).length && flag("no-vsock")) {
	process.stderr.write("[host] --mount needs vsock (the 9p server and kwtty run over it); drop --no-vsock\n");
	process.exit(1);
}
const forwards = [];
for (const [i, a] of args.entries()) {
	if (a !== "--forward") continue;
	const m = /^(\d+):(\d+)$/.exec(args[i + 1] ?? "");
	const host = Number(m?.[1]), guest = Number(m?.[2]);
	if (!m || host < 1 || host > 65535 || guest < 1 || guest > 65535) {
		process.stderr.write(`[host] --forward HOSTPORT:GUESTPORT (ports 1 to 65535), not ${JSON.stringify(args[i + 1] ?? "")}\n`);
		process.exit(1);
	}
	forwards.push({
		host,
		guest
	});
}
if (flag("wasi") && flag("no-vsock")) {
	process.stderr.write("[host] --wasi needs vsock (kwwasi connects over it); drop --no-vsock\n");
	process.exit(1);
}
if (forwards.length && flag("no-vsock")) {
	process.stderr.write("[host] --forward needs vsock (kwtty connects in the guest); drop --no-vsock\n");
	process.exit(1);
}
const interactive = process.stdin.isTTY && !scripted;
let vm;
let vmReady;
const booted = new Promise((r) => vmReady = r);
const servers = [];
for (const f of forwards) {
	const server = createServer({
		allowHalfOpen: true,
		pauseOnConnect: true
	}, (sock) => void forward(sock, f.guest));
	try {
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(f.host, "127.0.0.1", () => resolve());
		});
	} catch (e) {
		process.stderr.write(`[host] --forward ${f.host}:${f.guest}: ${e.message}\n`);
		process.exit(1);
	}
	server.on("error", (e) => log(`[host] forward ${f.host}: ${e.message}`));
	server.unref();
	servers.push(server);
	log(`[host] forwarding 127.0.0.1:${f.host} to the guest's 127.0.0.1:${f.guest}`);
}
async function forward(sock, guestPort) {
	sock.on("error", () => {});
	let gs;
	try {
		gs = await (await booted).connect(guestPort);
	} catch (e) {
		log(`[host] forward to guest port ${guestPort}: ${e.message}`);
		sock.resetAndDestroy();
		return;
	}
	const writer = gs.writable.getWriter();
	const reader = gs.readable.getReader();
	sock.on("close", (hadError) => {
		if (hadError) writer.abort().catch(() => {});
		else gs.close().catch(() => {});
	});
	sock.on("data", (chunk) => {
		sock.pause();
		writer.write(new Uint8Array(chunk)).then(() => sock.resume(), () => sock.destroy());
	});
	sock.on("end", () => void writer.close().catch(() => {}));
	sock.resume();
	try {
		for (;;) {
			const r = await reader.read();
			if (r.done) break;
			if (!sock.write(r.value)) await new Promise((resolve) => sock.once("drain", resolve).once("close", resolve));
		}
		sock.end();
	} catch {
		sock.resetAndDestroy();
	}
}
try {
	const common = {
		kernel: module,
		initrd,
		cmdline,
		memoryMiB,
		consoleSize,
		log,
		jit: !flag("no-jit"),
		cpus: smpCpus,
		onOutput: (bytes) => process.stdout.write(bytes),
		display: displaySize ?? (flag("display") || flag("gpu")),
		gpu: flag("gpu"),
		onDisplay: (m) => log(m ? `[host] display: ${m.width}x${m.height}, stride ${m.stride}` : "[host] display: closed"),
		onInput: (s) => log(`[host] evdev: keyboard ${s.keyboard ? "open" : "closed"}, mouse ${s.mouse ? "open" : "closed"}, tablet ${s.tablet ? "open" : "closed"}`),
		sound: sound.option,
		vsock: !flag("no-vsock"),
		shm: flag("shm"),
		mounts,
		restore,
		distro,
		profile
	};
	vm = worker ? await createKernelOn(nodePlatform(bundledKernelUrl), {
		...common,
		worker: true,
		disks: diskSpecsOut,
		net: netSpec,
		shared: workerTransport === "messages" ? false : workerTransport === "shared" ? true : void 0,
		transferRestore: true
	}) : await createKernelOn(nodePlatform(bundledKernelUrl), {
		...common,
		disks,
		net
	});
	if (worker) log(`[host] kernel worker: input and frames by ${vm.transport === "shared" ? "shared memory" : "messages"}`);
	if (vm.distro) log(`[host] distro: ${/^https?:/.test(vm.distro.name) ? vm.distro.name : rel(vm.distro.name)} is /dev/wda (${vm.distro.fs}, label ${vm.distro.label}, ${(vm.distro.size / 1048576).toFixed(1)} MiB, read-only)`);
	if (flag("wasi")) serveWasiPrograms(vm.vsock, { log });
	vmReady(vm);
} catch (e) {
	process.stderr.write(`[host] boot failed: ${e.stack ?? e}\n`);
	process.exit(1);
}
const local = vm instanceof KernelInstance ? vm : void 0;
if (!sizeOpt && process.stdout.isTTY) process.stdout.on("resize", () => vm.resize(process.stdout.columns, process.stdout.rows));
if (interactive) {
	process.stdin.setRawMode(true);
	process.stdin.on("data", (d) => {
		if (d.includes(29)) {
			process.stderr.write("\n[host] Ctrl-] pressed, exiting\n");
			finish({
				code: 0,
				reason: "user quit",
				kind: "stopped"
			});
		}
		vm.write(new Uint8Array(d));
	});
} else if (scripted) {
	const parts = scripted.replace(/\\n/g, "\n").replace(/\^C/g, "").split(/\{([\d.]+|sync|(?:fb|save|suspend|key|rel|btn|wheel|abs|abtn|awheel)=[^}]+)\}/);
	let at = Number(opt("input-delay", "0")) * 1e3;
	parts.forEach((p, i) => {
		if (i % 2 && p === "sync") setTimeout(requestSync, at);
		else if (i % 2 && p.startsWith("fb=")) setTimeout(() => void dumpFrame(p.slice(3)), at);
		else if (i % 2 && p.startsWith("save=")) setTimeout(() => void saveSnapshot(p.slice(5), false), at);
		else if (i % 2 && p.startsWith("suspend=")) setTimeout(() => void saveSnapshot(p.slice(8), true), at);
		else if (i % 2 && /^(key|rel|btn|wheel|abs|abtn|awheel)=/.test(p)) setTimeout(() => injectInput(p), at);
		else if (i % 2) at += Number(p) * 1e3;
		else if (p) setTimeout(() => vm.write(p), at);
	});
} else if (!process.stdin.isTTY) process.stdin.on("data", (d) => vm.write(new Uint8Array(d)));
let snapshotWrite = null;
function saveSnapshot(file, stop) {
	const p = (snapshotWrite ?? Promise.resolve()).then(() => writeSnapshot(file, stop));
	snapshotWrite = p;
	return p;
}
async function writeSnapshot(file, stop) {
	const t = performance.now();
	try {
		const snap = await vm.snapshot({ stop });
		const tSnap = performance.now() - t;
		const bytes = encodeSnapshot(snap);
		writeFileSync(file, bytes);
		process.stderr.write(`\n[host] snapshot: ${file}, ${(bytes.length / 1048576).toFixed(1)} MiB of ${snap.memory.byteLength / 1048576} MiB (${((snap.freeBytes ?? 0) / 1048576).toFixed(0)} MiB free left out, parked and copied in ${tSnap.toFixed(0)} ms, written in ${(performance.now() - t - tSnap).toFixed(0)} ms)\n`);
	} catch (e) {
		process.stderr.write(`\n[host] snapshot failed: ${e.message}\n`);
	}
}
function requestSync() {
	const t = performance.now();
	process.stderr.write("\n[host] sync requested\n");
	vm.sync({ timeout: 1e4 }).then((ok) => process.stderr.write(ok ? `[host] sync: block flush after ${(performance.now() - t).toFixed(0)} ms\n` : "[host] sync: no block flush within 10 s\n"));
}
function injectInput(token) {
	const ev = vm.evdev;
	const [what, arg = ""] = token.split("=", 2);
	const note = (msg, ok) => void process.stderr.write(`[host] evdev: ${msg}${ok ? "" : " (dropped: not open)"}\n`);
	if (!ev) return note(`${token} without --display`, false);
	const [a, state] = arg.split(":");
	if (what === "key") {
		const code = /^\d+$/.test(a) ? Number(a) : domCodeToLinux(a);
		if (code === void 0) return void process.stderr.write(`[host] evdev: unknown key ${a}\n`);
		const downs = state === void 0 ? [true, false] : [state === "1"];
		for (const d of downs) note(`key ${code} ${d ? "down" : "up"}`, ev.key(code, d));
	} else if (what === "btn" || what === "abtn") {
		const code = a === "left" ? BTN_LEFT : a === "right" ? BTN_RIGHT : a === "middle" ? BTN_MIDDLE : Number(a);
		const downs = state === void 0 ? [true, false] : [state === "1"];
		const tablet = what === "abtn";
		for (const d of downs) note(`${tablet ? "tablet " : ""}button ${code} ${d ? "down" : "up"}`, tablet ? ev.tabletButton(code, d) : ev.button(code, d));
	} else if (what === "abs") {
		const m = vm.display?.mode ?? displaySize ?? {
			width: 640,
			height: 480
		};
		const [x, y] = arg.split(",").map((v, i) => v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : (Number(v) + .5) / ((i ? m?.height : m?.width) ?? 1));
		note(`tablet to ${arg} (${x.toFixed(5)}, ${y.toFixed(5)})`, ev.moveTo(x, y));
	} else if (what === "awheel") note(`tablet wheel ${Number(arg)}`, ev.tabletWheel(Number(arg)));
	else if (what === "rel") {
		const [dx = 0, dy = 0] = arg.split(",").map(Number);
		note(`motion ${dx},${dy}`, ev.move(dx, dy));
	} else if (what === "wheel") note(`wheel ${Number(arg)}`, ev.wheel(Number(arg)));
}
async function dumpFrame(file) {
	const f = local ? local.frame() : await vm.readFrame();
	if (!f) {
		process.stderr.write(`\n[host] fb: no frame for ${file} (${vm.display ? "no program has /dev/fb0 open" : "no --display"})\n`);
		return;
	}
	writeFileSync(file, frameToPpm(f));
	process.stderr.write(`\n[host] fb: wrote ${file} (${f.width}x${f.height})\n`);
}
function printKwemuStats(k) {
	const base = 437, ic = Math.max(k.icount, 1);
	const w = (i) => k.words[i] ?? 0, jx = (i) => w(base + i);
	process.stderr.write(`[kwemu] instret=${k.icount} compiled insns=${(w(203) * 100 / ic).toFixed(2)}% handbacks=${w(204)}\n`);
	process.stderr.write(`[kwemu-exits] entries=${jx(0)} handbacks=${jx(1)} side=${jx(2)} (region ${jx(25)}) direct=${jx(3)} jalr=${jx(4)} stop=${jx(24)}\n`);
	process.stderr.write(`[kwemu-jx] ${k.words.slice(base, 501).join(" ")}\n`);
	process.stderr.write(`[kwemu-free] grow=${jx(59)} exit_grow=${jx(60)} clock=${jx(61)} ring=${jx(62)} other=${jx(63)}\n`);
	process.stderr.write(`[kwemu-stats] lookups_slow=${w(0)} revalidated=${w(1)} decoded=${w(2)} resets=${w(3)} blocks=${w(4)} insns/block=${(w(5) / Math.max(w(4), 1)).toFixed(2)} single_steps=${w(6)} walks r/w/x=${w(7)}/${w(8)}/${w(9)} generic=${w(10)}\n`);
}
let finishing = false;
function finish(res) {
	if (!profileFile) return finishNow(res);
	if (finishing) return;
	finishing = true;
	Promise.race([vm.profile(), new Promise((r) => setTimeout(r, 5e3))]).then(async (report) => {
		if (report && profileRoot) {
			const top = path.resolve(profileRoot);
			await symbolizeProfile(report, (p) => {
				const f = path.resolve(top, `.${p}`);
				return f.startsWith(top + path.sep) && existsSync(f) && statSync(f).isFile() ? readFileSync(f) : void 0;
			});
		}
		if (!report) process.stderr.write("[host] profile: no report\n");
		else {
			writeFileSync(profileFile, `${JSON.stringify(report, null, 1)}\n`);
			process.stderr.write(`${formatProfile(report)}\n[host] profile: ${profileFile} (${report.rows.length} rows)\n`);
		}
		finishNow(res);
	}, (e) => {
		process.stderr.write(`[host] profile: ${e?.message ?? e}\n`);
		finishNow(res);
	});
}
function finishNow(res) {
	if (interactive) process.stdin.setRawMode(false);
	sound.close(flag("stats") ? vm.stats().sound : void 0);
	if (flag("stats")) {
		const s = vm.stats();
		process.stderr.write(`[host] ${path.basename(kernelPath)} (${moduleIsMemory64(module) ? "memory64" : "32-bit memory"}), compile ${tCompile.toFixed(0)} ms, ran ${(s.uptimeMs / 1e3).toFixed(2)} s, switches ${s.switches}, idles ${s.idles}, yields ${s.yields}\n`);
		if (s.display) process.stderr.write(`[host] display: ${s.display.attaches} attaches (opens and mode changes), ${s.display.detaches} closes\n`);
		if (s.gpu) process.stderr.write(`[host] gpu: ${s.gpu.commands} commands (${s.gpu.errors} errors), ${s.gpu.transfers} transfers (${(s.gpu.transferBytes / 1048576).toFixed(1)} MiB copied), ${s.gpu.flushes} flushes, ${s.gpu.cursor} cursor\n`);
		if (s.evdev) process.stderr.write(`[host] evdev: ${s.evdev.delivered} events delivered, ${s.evdev.dropped} dropped\n`);
		const jitLine = (who, j) => process.stderr.write(!j.requested ? `[host] ${who}: not in this kernel\n` : !j.enabled ? `[host] ${who}: off\n` : `[host] ${who}: ${j.compiled} compiled, ${j.live} live (max ${j.maxLive}), ${j.freed} freed, ${j.failed} failed, ${j.compileMs.toFixed(0)} ms compiling ${(j.bytes / 1024).toFixed(0)} KiB (longest ${j.maxCompileMs.toFixed(2)} ms); ` + (j.collected < 0 ? "collection not tracked\n" : `${j.collected} collected, ${j.retained} freed but uncollected (max ${j.maxRetained}), ${j.gcNudges} GC nudges, ${j.refused} refused\n`));
		jitLine("jit", s.jit);
		s.jitCpus?.forEach((j, i) => jitLine(`jit cpu${i}`, j));
		if (s.kwemuCpus) s.kwemuCpus.forEach((k, i) => {
			if (!k) return;
			process.stderr.write(`[kwemu] cpu${i}:\n`);
			printKwemuStats(k);
		});
		else if (s.kwemu) printKwemuStats(s.kwemu);
		if (diskCount()) {
			const b = s.block;
			process.stderr.write(`[host] block: ${b.reads} reads (${(b.bytesRead / 1048576).toFixed(1)} MiB), ${b.writes} writes (${(b.bytesWritten / 1048576).toFixed(1)} MiB), ${b.flushes} flushes, ${b.discards} discards, ${b.async} async\n`);
		}
	}
	process.stderr.write(`[host] kernel exited: ${res.reason} (code ${res.code})\n`);
	process.exit(res.code);
}
if (timeout > 0) setTimeout(() => finish({
	code: 124,
	reason: `timeout after ${timeout}s`,
	kind: "stopped"
}), timeout * 1e3);
vm.exited.then(async (res) => {
	await snapshotWrite;
	finish(res);
});
export {};
