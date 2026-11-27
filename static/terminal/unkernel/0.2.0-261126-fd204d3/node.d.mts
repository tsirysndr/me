import { ABS_MAX, ABS_X, ABS_Y, ANSI, AttachOptions, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, BlockDevice, BlockStats, BootError, BootFailStage, BootProgress, BootStage, ByteDuplex, BytesSource, CMD_PORT, CommandError, CommandErrorCode, CommandsOption, ConnectOptions, ConsoleRouter, ConsoleRouterOptions, CowDisk, CowDiskOptions, CowDiskStats, CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, DataDiskSpec, Deframer, DeviceKind, DeviceSnapshots, DiskBase, DiskSnapshotState, DiskSpec, DiskState, DisplayFrame, DisplayHost, DisplayHostOptions, DisplayMode, DisplayOption, DisplaySize, DisplayStats, DistroDisk, DistroHeader, DistroIndex, DistroIndexEntry, DistroInfo, DistroSource, DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, Evdev, ExecOptions, ExecResult, ExitKind, ExitResult, FOURCC_XRGB8888, FS_DEFAULT_OWNER, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, FetchRoute, FetchRoutesBackend, FetchRoutesOptions, FileDiskSpec, FlushTracker, Fs, FsAttr, FsDirEntry, FsError, FsFile, FsFileType, FsOpenFlags, FsSetAttr, FsSource, FsStatFs, FsTree, FsTreeFile, GL_FORWARDER, GL_PORT, GlHost, GlOption, GlOptions, GlRendererStatus, GlStats, GuestConnect, GuestSocket, HOLD_CLOCK_LAG_MS, HTTP_MAX_HEADER_BYTES, HostCommand, HostCommandContext, HostCommandResult, HttpBase, HttpBaseOptions, HttpBaseStats, HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, InlineShmFile, InputHost, InputHostOptions, InputState, InputStats, InstanceStats, JitHost, JitHostOptions, JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, KernelConfig, KernelHandle, KernelInstance, KernelLineInfo, KernelSnapshot, KernelSource, KernelStats, KernelTransport, KwemuStats, KwsparseImage, LoadOptions, MUX, MaybePromise, MemoryFs, MemoryFsChange, MemoryStage, Mount, MountError, MountErrorCode, MountOptions, MountSpec, MountStats, MountsOption, NetBackend, NetBackendSpec, NetConnection, NetConnectionEvents, NetDevice, NetSpec, NetStack, NetStackOptions, NetStats, OverlayStore, PROFILE_ANON, PROFILE_UNKNOWN, PipeOptions, ProfileCpu, ProfileFile, ProfileFileReader, ProfileOptions, ProfilePage, ProfileProcPage, ProfileReport, ProfileRow, ProfileSite, ProfileSymbol, ProfileTier, Pty, PtyEnd, PtyError, PtyErrorCode, PtyOptions, PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SNAPSHOT_COMMIT_TIMEOUT_MS, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, SamplerHandle, SamplerInit, Shm, ShmBackend, ShmCall, ShmCallResult, ShmClient, ShmCloseReason, ShmDevice, ShmDeviceOptions, ShmDeviceStats, ShmError, ShmFile, ShmInPlace, ShmInfo, ShmLocal, ShmPlace, ShmShareServer, ShmStats, SkippedDisk, SnapshotCommitError, SnapshotHoldDecision, SnapshotOptions, SoundChunk, SoundEvent, SoundFormat, SoundHost, SoundHostOptions, SoundOption, SoundRingReader, SoundRingRecord, SoundRingWriter, SoundSink, SoundState, SoundStats, SparseBase, SpawnOptions, StoreIndex, StreamHost, StreamHostStats, Subprocess, SupportReport, TTY_DETACH_TIMEOUT, TTY_FEATURE_CONNECT, TTY_FEATURE_DETACH, TTY_FEATURE_PIPES, TTY_FEATURE_USER, TTY_PORT, TTY_SIGNALS, TTY_VERSION, TtyFrame, TtyFrameParser, TtySessionSnapshot, VA_PORT, VK_PORT, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, VaContextStats, VaHost, VaOption, VaOptions, VaStats, VaStatus, VirglTotals, VkExternalRef, VkGpuAdapter, VkGpuDevice, VkHost, VkOption, VkOptions, VkRendererStatus, VkStats, Vsock, VsockConnection, VsockDevice, VsockDeviceOptions, VsockDeviceStats, VsockError, VsockHeader, VsockHost, VsockHostOptions, VsockListener, VsockOption, VsockStats, VtestRenderer, WASI_EXEC_PORT, WasiExecOptions, WasiExecServer, WasiExecStats, WispBackend, WispBackendOptions, WorkerKernel, WorkerKernelOptions, WorkerOption, ZERO_BLOCK, ZeroBase, attachPty, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, createSoundRing, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyAttach, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, fetchRoutes, formatProfile, frame, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotCpuMismatch, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, symbolizeProfile, wavHeader, xrgbToRgba } from "./_chunks/index.mjs";
/** The GitHub repository whose releases carry the distro images. */
export declare const RELEASE_REPO = "pithings/unkernel";
/** What fetchDistro() is doing, for a progress display. */
interface FetchDistroProgress {
  /** "index": reading distros.json; "download": bytes arriving (loaded of total); "verify": checking a cached file; "done". */
  stage: "index" | "download" | "verify" | "done";
  name: string;
  /** The image's file name (once the index is read). */
  file?: string;
  /** Where it comes from (the release directory URL). */
  url?: string;
  /** Where it goes (the local file). */
  path?: string;
  loaded?: number;
  total?: number;
  /** "done": whether it came from the cache (true) or was downloaded now. */
  cached?: boolean;
}
interface FetchDistroOptions {
  /**
   * The release directory holding distros.json and the images, as a URL
   * (ending in "/" or not). Default: $UNKERNEL_RELEASE_URL, else
   * https://github.com/pithings/unkernel/releases/download/v<version>/ for
   * the package's version.
   */
  releaseUrl?: string;
  /**
   * Where downloads are kept: a directory per release under it. Default:
   * $UNKERNEL_CACHE_DIR, else $XDG_CACHE_HOME/unkernel, else
   * ~/.cache/unkernel, else <os.tmpdir()>/unkernel-cache.
   */
  cacheDir?: string;
  /**
   * In a source checkout, use its build (vendor/build/distro/) and never
   * download (default true). false: download even there.
   */
  local?: boolean;
  onProgress?: (p: FetchDistroProgress) => void;
  signal?: AbortSignal;
}
/** fetchDistro() could not produce the image: `offline` when the network failed and nothing usable was cached. */
export declare class DistroFetchError extends Error {
  readonly offline: boolean;
  constructor(message: string, { offline, cause }?: {
    offline?: boolean;
    cause?: unknown;
  });
}
/** The default cache directory (see FetchDistroOptions.cacheDir). */
export declare function defaultCacheDir(): string;
/**
 * A disk image file, read and written in place (synchronous pread/pwrite).
 *
 * Snapshots: a writable image's write generation lives in a sidecar file,
 * `<image>.kwsnap` ({"uid", "gen"}), created by the first snapshot that
 * includes the image. Once it exists, the first write after opening the
 * image or after a snapshot stores the next generation there (synced)
 * before the data is written, in every process that opens the image. The
 * image's size and mtime (the stamp) catch writes by other programs.
 */
export declare class FileDisk implements BlockDevice {
  #private;
  path: string;
  readOnly: boolean;
  fd: number;
  size: number;
  flags: number;
  /** Writable: flushes reach the file (Kernel.requestSync waits for them). */
  readonly persistent: boolean;
  flushes: FlushTracker;
  /** Write generation (snapshotState), and the sidecar's id once a snapshot created it. */
  gen: number;
  uid?: string;
  constructor(path: string, { readOnly }?: {
    readOnly?: boolean;
  });
  /** The sidecar file with the write generation. */
  get sidecar(): string;
  snapshotState(): DiskSnapshotState;
  /** Sync the image, store the generation in the sidecar (created now if needed). */
  snapshotSeal(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
  get flushSeq(): number;
  whenFlushed(after: number): Promise<void>;
  read(off: number, views: Uint8Array[]): void;
  write(off: number, views: Uint8Array[]): void;
  flush(): void;
  close(): void;
}
/** Read-only file as the base of a CowDisk (`--snapshot`). */
export declare class FileBase implements DiskBase {
  fd: number;
  size: number;
  /** The path, size and mtime: a snapshot of an unwritten CowDisk over it checks them. */
  identity: string;
  constructor(path: string);
  read(off: number, len: number): Uint8Array;
  close(): void;
}
interface OpenDiskOptions {
  /** Writes go to an in-memory overlay and are lost at exit. */
  snapshot?: boolean;
  /** The guest's writes fail (EROFS); takes precedence over snapshot. */
  readOnly?: boolean;
}
/**
 * Open a disk: a file path, or an http(s) URL served with Range support
 * (lazily fetched, overlay in memory; read-only: no overlay).
 */
export declare function openDisk(spec: string, { snapshot, readOnly }?: OpenDiskOptions): Promise<BlockDevice>;
/**
 * A distro image (a path, or an http(s) URL served with Range support,
 * prefetched as its distro header or `prefetch` says; a file ignores it) as
 * the read-only disk createKernel({ distro }) takes, for a caller that
 * needs the disk before booting (snapshotDiskMismatch(); the distro is the
 * snapshot's first disk). createKernel({ distro: path }) opens it the same way.
 */
export declare function openDistroDisk(src: string, { prefetch, log }?: {
  prefetch?: number | false;
  log?: (msg: string) => void;
}): Promise<DistroDisk>;
/**
 * Create a disk image file from a kwsparse image (gzipped or not), sparse:
 * only the stored blocks are written. Fails if `path` exists, so it never
 * replaces a data disk.
 */
export declare function createImageFromKwsparse(path: string, bytes: Uint8Array | ArrayBuffer): Promise<{
  size: number;
  blocks: number;
}>;
/** A host directory as an Fs (see the top of this file). Mount it with { readOnly: true } to refuse changes. */
export declare function nodeFs(dir: string): Fs;
/** Run the guest's WASI programs (kwwasi, vsock port 1021) on this host, each in a worker thread. */
export declare function serveWasiPrograms(vsock: Vsock, opts?: WasiExecOptions): WasiExecServer;
/**
 * Handshake headers the Node entry's wispBackend() sends unless `headers`
 * is given. Node's WebSocket sends no Origin, and the project's server
 * (DEFAULT_WISP_SERVERS) accepts only pages from localhost or 127.0.0.1.
 */
export declare const NODE_WISP_HEADERS: Readonly<Record<string, string>>;
/** wispBackend() with `headers` defaulting to NODE_WISP_HEADERS. */
export declare function wispBackend(url: string | readonly string[], opts?: WispBackendOptions): WispBackend;
export declare function directBackend(): NetBackend;
/**
 * The bundled kernel: vmlinux32.wasm with the base initramfs, its command
 * line, the data disk template and the patch to the SMP kernel in custom
 * sections. In a source checkout this resolves (through a symlink) to
 * vendor/build/bundle/unkernel.wasm.
 */
export declare const bundledKernelUrl: URL;
/**
 * The distro `name` ("alpine", "debian": the names in the release's
 * distros.json) as a local image file for createKernel({ distro }). In a
 * source checkout: its build, vendor/build/distro/<name>.erofs (never a
 * download). In an installed package: downloaded once from the GitHub
 * release of this package's version (UNKERNEL_RELEASE_URL overrides it)
 * into a cache directory (defaultCacheDir(); UNKERNEL_CACHE_DIR), checked
 * against the release's size and SHA-256, and reused while it matches.
 * Rejects with a DistroFetchError (`offline` when the network failed and
 * nothing usable was cached). The SDK never downloads anything else.
 */
export declare const fetchDistro: (name: string, opts?: FetchDistroOptions) => Promise<string>;
/**
 * Load, compile and boot a kernel (default: the bundled one, which boots
 * `distro`, or without one the base shell) and return the running
 * instance. Rejects with a BootError if it cannot start. With
 * `worker: true` the kernel is loaded, compiled and run in a worker thread
 * and the result is a WorkerKernel (no low-level `kernel`; see
 * WorkerOption for what it does not support yet).
 */
export declare function createKernel(opts: CreateKernelOptions & {
  worker: true;
}): Promise<WorkerKernel>;
export declare function createKernel(opts?: CreateKernelOptions & {
  worker?: false;
}): Promise<KernelInstance>;
export declare function createKernel(opts?: CreateKernelOptions & WorkerOption): Promise<KernelHandle>;
export { ABS_MAX, ABS_X, ABS_Y, ANSI, type AttachOptions, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, type BlockDevice, type BlockStats, BootError, type BootFailStage, type BootProgress, type BootStage, type ByteDuplex, type BytesSource, CMD_PORT, CommandError, type CommandErrorCode, type CommandsOption, type ConnectOptions, ConsoleRouter, type ConsoleRouterOptions, CowDisk, type CowDiskOptions, type CowDiskStats, type CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, type DataDiskSpec, Deframer, type DeviceKind, type DeviceSnapshots, type DiskBase, type DiskSnapshotState, type DiskSpec, type DiskState, type DisplayFrame, DisplayHost, type DisplayHostOptions, type DisplayMode, type DisplayOption, type DisplaySize, type DisplayStats, DistroDisk, type DistroHeader, type DistroIndex, type DistroIndexEntry, type DistroInfo, type DistroSource, type DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, type Evdev, type ExecOptions, type ExecResult, type ExitKind, type ExitResult, FOURCC_XRGB8888, FS_DEFAULT_OWNER, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, type FetchDistroOptions, type FetchDistroProgress, type FetchRoute, type FetchRoutesBackend, type FetchRoutesOptions, type FileDiskSpec, FlushTracker, type Fs, type FsAttr, type FsDirEntry, FsError, type FsFile, type FsFileType, type FsOpenFlags, type FsSetAttr, type FsSource, type FsStatFs, type FsTree, type FsTreeFile, GL_FORWARDER, GL_PORT, GlHost, type GlOption, type GlOptions, type GlRendererStatus, type GlStats, type GuestConnect, type GuestSocket, HOLD_CLOCK_LAG_MS, HTTP_MAX_HEADER_BYTES, type HostCommand, type HostCommandContext, type HostCommandResult, HttpBase, type HttpBaseOptions, type HttpBaseStats, type HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, type InlineShmFile, InputHost, type InputHostOptions, type InputState, type InputStats, type InstanceStats, JitHost, type JitHostOptions, type JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, type KernelConfig, type KernelHandle, KernelInstance, type KernelLineInfo, type KernelSnapshot, type KernelSource, type KernelStats, type KernelTransport, type KwemuStats, type KwsparseImage, type LoadOptions, MUX, type MaybePromise, MemoryFs, type MemoryFsChange, type MemoryStage, type Mount, MountError, type MountErrorCode, type MountOptions, type MountSpec, type MountStats, type MountsOption, type NetBackend, type NetBackendSpec, type NetConnection, type NetConnectionEvents, type NetDevice, type NetSpec, NetStack, type NetStackOptions, type NetStats, type OpenDiskOptions, type OverlayStore, PROFILE_ANON, PROFILE_UNKNOWN, type PipeOptions, type ProfileCpu, type ProfileFile, type ProfileFileReader, type ProfileOptions, type ProfilePage, type ProfileProcPage, type ProfileReport, type ProfileRow, type ProfileSite, type ProfileSymbol, type ProfileTier, type Pty, type PtyEnd, PtyError, type PtyErrorCode, type PtyOptions, type PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SNAPSHOT_COMMIT_TIMEOUT_MS, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, type SamplerHandle, type SamplerInit, type Shm, type ShmBackend, type ShmCall, type ShmCallResult, ShmClient, type ShmCloseReason, ShmDevice, type ShmDeviceOptions, type ShmDeviceStats, ShmError, type ShmFile, ShmInPlace, type ShmInfo, type ShmLocal, type ShmPlace, ShmShareServer, type ShmStats, type SkippedDisk, SnapshotCommitError, type SnapshotHoldDecision, type SnapshotOptions, type SoundChunk, type SoundEvent, type SoundFormat, SoundHost, type SoundHostOptions, type SoundOption, SoundRingReader, type SoundRingRecord, SoundRingWriter, type SoundSink, type SoundState, type SoundStats, SparseBase, type SpawnOptions, type StoreIndex, StreamHost, type StreamHostStats, type Subprocess, type SupportReport, TTY_DETACH_TIMEOUT, TTY_FEATURE_CONNECT, TTY_FEATURE_DETACH, TTY_FEATURE_PIPES, TTY_FEATURE_USER, TTY_PORT, TTY_SIGNALS, TTY_VERSION, type TtyFrame, TtyFrameParser, type TtySessionSnapshot, VA_PORT, VK_PORT, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, type VaContextStats, VaHost, type VaOption, type VaOptions, type VaStats, type VaStatus, type VirglTotals, type VkExternalRef, type VkGpuAdapter, type VkGpuDevice, VkHost, type VkOption, type VkOptions, type VkRendererStatus, type VkStats, type Vsock, type VsockConnection, VsockDevice, type VsockDeviceOptions, type VsockDeviceStats, VsockError, type VsockHeader, VsockHost, type VsockHostOptions, type VsockListener, type VsockOption, type VsockStats, type VtestRenderer, WASI_EXEC_PORT, type WasiExecOptions, type WasiExecServer, type WasiExecStats, type WispBackend, type WispBackendOptions, WorkerKernel, type WorkerKernelOptions, type WorkerOption, ZERO_BLOCK, ZeroBase, attachPty, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, createSoundRing, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyAttach, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, fetchRoutes, formatProfile, frame, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotCpuMismatch, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, symbolizeProfile, wavHeader, xrgbToRgba };