import { ABS_MAX, ABS_X, ABS_Y, ANSI, AttachOptions, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, BlockDevice, BlockStats, BootError, BootFailStage, BootProgress, BootStage, ByteDuplex, BytesSource, CMD_PORT, CommandError, CommandErrorCode, CommandsOption, ConnectOptions, ConsoleRouter, ConsoleRouterOptions, CowDisk, CowDiskOptions, CowDiskStats, CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, DataDiskSpec, Deframer, DeviceKind, DeviceSnapshots, DiskBase, DiskSnapshotState, DiskSpec, DiskState, DisplayFrame, DisplayHost, DisplayHostOptions, DisplayMode, DisplayOption, DisplaySize, DisplayStats, DistroDisk, DistroHeader, DistroIndex, DistroIndexEntry, DistroInfo, DistroSource, DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, Evdev, ExecOptions, ExecResult, ExitKind, ExitResult, FOURCC_XRGB8888, FS_DEFAULT_OWNER, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, FetchRoute, FetchRoutesBackend, FetchRoutesOptions, FileDiskSpec, FlushTracker, Fs, FsAttr, FsDirEntry, FsError, FsFile, FsFileType, FsOpenFlags, FsSetAttr, FsSource, FsStatFs, FsTree, FsTreeFile, GL_FORWARDER, GL_PORT, GlHost, GlOption, GlOptions, GlRendererStatus, GlStats, GuestConnect, GuestSocket, HOLD_CLOCK_LAG_MS, HTTP_MAX_HEADER_BYTES, HostCommand, HostCommandContext, HostCommandResult, HttpBase, HttpBaseOptions, HttpBaseStats, HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, InlineShmFile, InputHost, InputHostOptions, InputState, InputStats, InstanceStats, JitHost, JitHostOptions, JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, KernelConfig, KernelHandle, KernelInstance, KernelLineInfo, KernelSnapshot, KernelSource, KernelStats, KernelTransport, KwemuStats, KwsparseImage, LoadOptions, MUX, MaybePromise, MemoryFs, MemoryFsChange, MemoryStage, Mount, MountError, MountErrorCode, MountOptions, MountSpec, MountStats, MountsOption, NetBackend, NetBackendSpec, NetConnection, NetConnectionEvents, NetDevice, NetSpec, NetStack, NetStackOptions, NetStats, OverlayStore, PROFILE_ANON, PROFILE_UNKNOWN, PipeOptions, ProfileCpu, ProfileFile, ProfileFileReader, ProfileOptions, ProfilePage, ProfileProcPage, ProfileReport, ProfileRow, ProfileSite, ProfileSymbol, ProfileTier, Pty, PtyEnd, PtyError, PtyErrorCode, PtyOptions, PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SNAPSHOT_COMMIT_TIMEOUT_MS, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, SamplerHandle, SamplerInit, Shm, ShmBackend, ShmCall, ShmCallResult, ShmClient, ShmCloseReason, ShmDevice, ShmDeviceOptions, ShmDeviceStats, ShmError, ShmFile, ShmInPlace, ShmInfo, ShmLocal, ShmPlace, ShmShareServer, ShmStats, SkippedDisk, SnapshotCommitError, SnapshotHoldDecision, SnapshotOptions, SoundChunk, SoundEvent, SoundFormat, SoundHost, SoundHostOptions, SoundOption, SoundRingReader, SoundRingRecord, SoundRingWriter, SoundSink, SoundState, SoundStats, SparseBase, SpawnOptions, StoreIndex, StreamHost, StreamHostStats, Subprocess, SupportReport, TTY_DETACH_TIMEOUT, TTY_FEATURE_CONNECT, TTY_FEATURE_DETACH, TTY_FEATURE_PIPES, TTY_FEATURE_USER, TTY_PORT, TTY_SIGNALS, TTY_VERSION, TtyFrame, TtyFrameParser, TtySessionSnapshot, VA_PORT, VK_PORT, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, VaContextStats, VaHost, VaOption, VaOptions, VaStats, VaStatus, VirglTotals, VkExternalRef, VkGpuAdapter, VkGpuDevice, VkHost, VkOption, VkOptions, VkRendererStatus, VkStats, Vsock, VsockConnection, VsockDevice, VsockDeviceOptions, VsockDeviceStats, VsockError, VsockHeader, VsockHost, VsockHostOptions, VsockListener, VsockOption, VsockStats, VtestRenderer, WASI_EXEC_PORT, WasiExecOptions, WasiExecServer, WasiExecStats, WispBackend, WispBackendOptions, WorkerKernel, WorkerKernelOptions, WorkerOption, ZERO_BLOCK, ZeroBase, attachPty, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, createSoundRing, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyAttach, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, fetchRoutes, formatProfile, frame, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotCpuMismatch, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, symbolizeProfile, wavHeader, wispBackend, xrgbToRgba } from "./_chunks/index.mjs";
interface IdbStoreOptions {
  log?: ((msg: string) => void) | null;
  durability?: IDBTransactionDurability;
}
/** Overlay persistence in IndexedDB: database "kwdisk:<name>". */
export declare class IdbStore implements OverlayStore {
  #private;
  readonly name: string;
  log: (msg: string) => void;
  durability: IDBTransactionDurability;
  dbp: Promise<IDBDatabase> | null;
  constructor(name: string, { log, durability }?: IdbStoreOptions);
  /**
   * Read the index: the numbers of all stored blocks (not their data).
   * If the database belongs to another identity: onMismatch "clear" drops
   * the blocks (logged loudly), "refuse" leaves everything alone and
   * returns {mismatch: storedIdentity}. With write: false nothing is
   * written (a read-only transaction; a fresh database stays unmarked).
   */
  open(identity: string, { onMismatch, write }?: {
    onMismatch?: "clear" | "refuse";
    write?: boolean;
  }): Promise<StoreIndex>;
  /** Records for the given block numbers: Map block -> Uint8Array (missing blocks are absent). */
  getBlocks(blocks: number[]): Promise<Map<number, Uint8Array>>;
  /** One transaction: put [block, data] pairs, delete block numbers, and record the write generation if given. */
  save(puts: Array<[number, Uint8Array]>, dels?: number[], meta?: {
    gen: number;
  }): Promise<void>;
  /** One transaction: replace everything with these blocks and mark the store initialized (a new uid, generation 0). Returns the uid. */
  seed(entries: Iterable<[number, Uint8Array]>, identity: string): Promise<string>;
  /** All records, read in one transaction (a consistent snapshot). */
  readAll(): Promise<Map<number, Uint8Array>>;
  count(): Promise<number>;
  /**
   * Forget everything. Deleting a large disk's blocks takes a while, and a
   * page that reloads meanwhile aborts the transaction, so a marker is
   * committed first (a small transaction): open() treats a marked store
   * as empty and finishes the deletion.
   */
  clear(): Promise<void>;
  /** The stored identity, without reading the index (undefined: none, or a reset that was cut off). */
  identity(): Promise<string | undefined>;
  /** Replace the identity `from` with `to` (one transaction; false if the stored identity is not `from`). The blocks stay. */
  relabel(from: string, to: string): Promise<boolean>;
  close(): Promise<void>;
}
interface HttpDiskOptions {
  /** Name of the saved overlay (default: the URL). */
  name?: string;
  /** Save the overlay in IndexedDB on each flush (default true, if IndexedDB exists). */
  persist?: boolean;
  chunkSize?: number;
  log?: (msg: string) => void;
  /** A save failed (e.g. QuotaExceededError). */
  onError?: (err: unknown) => void;
}
/**
 * A disk image served over HTTP, read lazily with Range requests, written to
 * a copy-on-write overlay, optionally persisted in IndexedDB under `name`.
 * A saved overlay that belongs to another version of the image (size, ETag)
 * is dropped, loudly (it would corrupt the file system).
 */
export declare function openHttpDisk(url: string, { name, persist, chunkSize, log, onError }?: HttpDiskOptions): Promise<CowDisk>;
/** Drop the persisted overlay of a disk opened with openHttpDisk(…, {name}). */
export declare function resetHttpDisk(name: string): Promise<void>;
/**
 * A distro image served over HTTP (relative to the page) as the read-only
 * disk createKernel({ distro }) takes: read lazily with Range requests,
 * after the prefetch its distro header asks for (`prefetch` overrides it,
 * false turns it off; HttpBaseOptions.prefetch), which starts here;
 * nothing kept in IndexedDB, every range checked against the image first
 * seen (HttpBase strict). For a caller that needs the disk before
 * booting (snapshotDiskMismatch(); the distro is the snapshot's first disk);
 * createKernel({ distro: url }) opens it the same way. The disk's `stats`
 * say what was fetched.
 */
export declare function openDistroDisk(url: string, { chunkSize, prefetch, log }?: {
  chunkSize?: number;
  prefetch?: number | false;
  log?: (msg: string) => void;
}): Promise<DistroDisk>;
export declare const DATA_DISK_NAME = "kwdata";
export declare const DATA_DISK_VERSION = "v1";
interface DataDiskNameOptions {
  /** Default "kwdata". */
  name?: string;
  /** Format version, default DATA_DISK_VERSION. */
  version?: string;
  log?: (msg: string) => void;
}
/** The store of a data disk: database "kwdisk:<name>-<version>" and its identity. */
export declare function dataDiskStore(size: number, { name, version, log }?: DataDiskNameOptions): {
  store: IdbStore;
  identity: string;
};
interface OpenDataDiskOptions extends DataDiskNameOptions {
  /** The template: a kwsparse image (gzipped or not), or a decoded one. */
  template: Uint8Array | ArrayBuffer | KwsparseImage;
  /**
   * "persistent" (default): the IndexedDB store, seeded from the template
   * on first use. "snapshot": memory only, starting from a consistent copy
   * of the saved disk if it is at most snapshotLimit bytes, else from the
   * template (e.g. another tab owns the disk).
   */
  mode?: "persistent" | "snapshot";
  /** Default 64 MiB. */
  snapshotLimit?: number;
  /**
   * The disk's size in bytes (rounded down to 4 KiB, at least the
   * template's): a new disk is made this large, a saved disk smaller than
   * this grows to it, a larger one keeps its size (a disk never shrinks).
   * The guest's /init grows the file system to the device. Default: the
   * saved disk's size, or the template's for a new one. Snapshot mode never
   * grows a saved disk.
   */
  size?: number;
  onError?: (err: unknown) => void;
}
/**
 * Open the data disk. The result has .persistent, and .notice when it is
 * not the persistent disk. Throws a DataDiskFormatError if the saved disk
 * has another identity (format); nothing is cleared, the caller decides (the
 * page runs a snapshot of the template and says why).
 */
export declare function openDataDisk({ name, version, template, mode, snapshotLimit, size, log, onError }: OpenDataDiskOptions): Promise<CowDisk>;
/**
 * Replace the persisted data disk with a kwsparse image (gzipped or not).
 * The disk must not be attached (or be detached, followed by a reload).
 */
export declare function importDataDisk(bytes: Uint8Array | ArrayBuffer, { name, version, size, log }?: DataDiskNameOptions & {
  size?: number;
}): Promise<{
  size: number;
  blocks: number;
}>;
/** Forget the persisted data disk; the next boot starts again from the template. */
export declare function resetDataDisk({ name, version }?: DataDiskNameOptions): Promise<void>;
/**
 * Sizes createKernel() tries, in order, when the requested memory cannot be
 * allocated (phones often lack the address space for the larger ones).
 */
export declare const DEFAULT_MEMORY_FALLBACK_MIB: readonly number[];
/** A phone or tablet: a coarse pointer (touch) or a mobile user agent (the old page's rule). */
export declare function isMobile(): boolean;
/**
 * A memory size for this device: from navigator.deviceMemory (secure
 * contexts only) when known, else 512 MiB on phones and 2 GiB otherwise
 * (at most 512 MiB on a phone whatever it reports). Memory the guest never
 * touches costs the host nothing.
 */
export declare function autoMemoryMiB(opts?: {
  mobile?: boolean;
}): {
  mib: number;
  why: string;
};
/**
 * What an AudioOut does:
 * - "idle": nothing to hear so far, or nothing plays while the browser has
 *   the output suspended;
 * - "waiting": the guest plays, or played something that is held, and it
 *   starts at the user's next click, tap or key press on the page;
 * - "running": the output is on, and the guest has played something;
 * - "unavailable": this browser gives no Web Audio;
 * - "closed": after close().
 */
type AudioOutState = "idle" | "waiting" | "running" | "unavailable" | "closed";
interface AudioOutOptions {
  log?: (msg: string) => void;
  /**
   * How much of what the guest plays before the output first runs is kept,
   * in seconds (the latest; default 10, 0 for none).
   */
  holdSeconds?: number;
  /** Start muted. Default false. */
  muted?: boolean;
  /** `state` changed (called from a microtask; not for the first state, "idle"). */
  onChange?: (state: AudioOutState) => void;
}
interface AudioOutStats {
  /** "worklet", "buffers" (the fallback), or null before there is an AudioContext. */
  mode: "worklet" | "buffers" | null;
  /** The AudioContext's state, or null before there is one. */
  state: string | null;
  sampleRate: number;
  /** Chunks dropped because too much was held or queued. */
  dropped: number;
  /** Times the output ran dry while a stream played. */
  underruns: number;
  /** Seconds queued in the output, as last reported. */
  queuedS: number;
  /** Seconds held until the output runs. */
  heldS: number;
}
/**
 * The sink of one kernel at a time. Nothing closes it when the kernel ends:
 * pass it to the next one, or close() it.
 */
interface AudioOut extends SoundSink {
  readonly state: AudioOutState;
  /** Silences the output; the guest's stream goes on. */
  muted: boolean;
  /**
   * Start or resume the output: call it from a click or key handler (a
   * play button). Not needed for gestures that reach the document, which
   * start it by themselves while something plays. Without a gesture so far
   * it does nothing but wait for one.
   */
  resume(): void;
  stats(): AudioOutStats;
  /** Stop for good: releases the AudioContext, the listeners and what is held. */
  close(): Promise<void>;
}
/** A SoundSink that plays the guest's PCM through Web Audio (see the top of this file). */
export declare function createAudioOut(opts?: AudioOutOptions): AudioOut;
/**
 * Why this thread cannot run CPU threads, or undefined if it can: shared
 * memory (a cross-origin isolated page), Web Workers here (nested ones in
 * a worker), Atomics.waitAsync (CPU 0's idle wait for another CPU's IPI)
 * and a thread that may block (not a browser's main thread). With
 * `worker: true`, for a kernel in a worker that this thread starts
 * (createKernel({ worker: true })): the page's view, without the
 * main-thread check; the worker checks again before it starts CPUs.
 */
export declare function webCpuBlocker(opts?: {
  worker?: boolean;
}): string | undefined;
/** Run the guest's WASI programs (kwwasi, vsock port 1021) on this host, each in a Web Worker. */
export declare function serveWasiPrograms(vsock: Vsock, opts?: WasiExecOptions): WasiExecServer;
/**
 * The bundled kernel: vmlinux32.wasm with the base initramfs, its command
 * line, the data disk template and the patch to the SMP kernel in custom
 * sections, next to this module (bundlers that understand
 * `new URL(..., import.meta.url)` emit it as an asset).
 */
export declare const bundledKernelUrl: URL;
/**
 * The guest GL renderer (createKernel({ gl: true })): virglrenderer compiled
 * to wasm, an emscripten module with virgl.wasm next to it, both next to
 * this module. Imported only when `gl` asks for it.
 */
export declare const bundledGlUrl: URL;
/**
 * The guest Vulkan renderer's SPIR-V to WGSL translator
 * (createKernel({ vk: true })), next to this module. Fetched only at the
 * guest's first Vulkan instance.
 */
export declare const bundledVkShaderUrl: URL;
/**
 * Load, compile and boot a kernel (default: the bundled one, which boots
 * `distro`, or without one the base shell) and return the running
 * instance. Rejects with a BootError if it cannot start.
 * Memory defaults to autoMemoryMiB() with DEFAULT_MEMORY_FALLBACK_MIB. With
 * `worker: true` the kernel is loaded, compiled and run in a Web Worker and
 * the result is a WorkerKernel (experimental; disks and the network as
 * specs, see WorkerOption).
 */
export declare function createKernel(opts: CreateKernelOptions & {
  worker: true;
}): Promise<WorkerKernel>;
export declare function createKernel(opts?: CreateKernelOptions & {
  worker?: false;
}): Promise<KernelInstance>;
export declare function createKernel(opts?: CreateKernelOptions & WorkerOption): Promise<KernelHandle>;
export { ABS_MAX, ABS_X, ABS_Y, ANSI, type AttachOptions, type AudioOut, type AudioOutOptions, type AudioOutState, type AudioOutStats, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, type BlockDevice, type BlockStats, BootError, type BootFailStage, type BootProgress, type BootStage, type ByteDuplex, type BytesSource, CMD_PORT, CommandError, type CommandErrorCode, type CommandsOption, type ConnectOptions, ConsoleRouter, type ConsoleRouterOptions, CowDisk, type CowDiskOptions, type CowDiskStats, type CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, type DataDiskNameOptions, type DataDiskSpec, Deframer, type DeviceKind, type DeviceSnapshots, type DiskBase, type DiskSnapshotState, type DiskSpec, type DiskState, type DisplayFrame, DisplayHost, type DisplayHostOptions, type DisplayMode, type DisplayOption, type DisplaySize, type DisplayStats, DistroDisk, type DistroHeader, type DistroIndex, type DistroIndexEntry, type DistroInfo, type DistroSource, type DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, type Evdev, type ExecOptions, type ExecResult, type ExitKind, type ExitResult, FOURCC_XRGB8888, FS_DEFAULT_OWNER, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, type FetchRoute, type FetchRoutesBackend, type FetchRoutesOptions, type FileDiskSpec, FlushTracker, type Fs, type FsAttr, type FsDirEntry, FsError, type FsFile, type FsFileType, type FsOpenFlags, type FsSetAttr, type FsSource, type FsStatFs, type FsTree, type FsTreeFile, GL_FORWARDER, GL_PORT, GlHost, type GlOption, type GlOptions, type GlRendererStatus, type GlStats, type GuestConnect, type GuestSocket, HOLD_CLOCK_LAG_MS, HTTP_MAX_HEADER_BYTES, type HostCommand, type HostCommandContext, type HostCommandResult, HttpBase, type HttpBaseOptions, type HttpBaseStats, type HttpDiskOptions, type HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, type IdbStoreOptions, type InlineShmFile, InputHost, type InputHostOptions, type InputState, type InputStats, type InstanceStats, JitHost, type JitHostOptions, type JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, type KernelConfig, type KernelHandle, KernelInstance, type KernelLineInfo, type KernelSnapshot, type KernelSource, type KernelStats, type KernelTransport, type KwemuStats, type KwsparseImage, type LoadOptions, MUX, type MaybePromise, MemoryFs, type MemoryFsChange, type MemoryStage, type Mount, MountError, type MountErrorCode, type MountOptions, type MountSpec, type MountStats, type MountsOption, type NetBackend, type NetBackendSpec, type NetConnection, type NetConnectionEvents, type NetDevice, type NetSpec, NetStack, type NetStackOptions, type NetStats, type OpenDataDiskOptions, type OverlayStore, PROFILE_ANON, PROFILE_UNKNOWN, type PipeOptions, type ProfileCpu, type ProfileFile, type ProfileFileReader, type ProfileOptions, type ProfilePage, type ProfileProcPage, type ProfileReport, type ProfileRow, type ProfileSite, type ProfileSymbol, type ProfileTier, type Pty, type PtyEnd, PtyError, type PtyErrorCode, type PtyOptions, type PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SNAPSHOT_COMMIT_TIMEOUT_MS, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, type SamplerHandle, type SamplerInit, type Shm, type ShmBackend, type ShmCall, type ShmCallResult, ShmClient, type ShmCloseReason, ShmDevice, type ShmDeviceOptions, type ShmDeviceStats, ShmError, type ShmFile, ShmInPlace, type ShmInfo, type ShmLocal, type ShmPlace, ShmShareServer, type ShmStats, type SkippedDisk, SnapshotCommitError, type SnapshotHoldDecision, type SnapshotOptions, type SoundChunk, type SoundEvent, type SoundFormat, SoundHost, type SoundHostOptions, type SoundOption, SoundRingReader, type SoundRingRecord, SoundRingWriter, type SoundSink, type SoundState, type SoundStats, SparseBase, type SpawnOptions, type StoreIndex, StreamHost, type StreamHostStats, type Subprocess, type SupportReport, TTY_DETACH_TIMEOUT, TTY_FEATURE_CONNECT, TTY_FEATURE_DETACH, TTY_FEATURE_PIPES, TTY_FEATURE_USER, TTY_PORT, TTY_SIGNALS, TTY_VERSION, type TtyFrame, TtyFrameParser, type TtySessionSnapshot, VA_PORT, VK_PORT, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, type VaContextStats, VaHost, type VaOption, type VaOptions, type VaStats, type VaStatus, type VirglTotals, type VkExternalRef, type VkGpuAdapter, type VkGpuDevice, VkHost, type VkOption, type VkOptions, type VkRendererStatus, type VkStats, type Vsock, type VsockConnection, VsockDevice, type VsockDeviceOptions, type VsockDeviceStats, VsockError, type VsockHeader, VsockHost, type VsockHostOptions, type VsockListener, type VsockOption, type VsockStats, type VtestRenderer, WASI_EXEC_PORT, type WasiExecOptions, type WasiExecServer, type WasiExecStats, type WispBackend, type WispBackendOptions, WorkerKernel, type WorkerKernelOptions, type WorkerOption, ZERO_BLOCK, ZeroBase, attachPty, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, createSoundRing, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyAttach, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, fetchRoutes, formatProfile, frame, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotCpuMismatch, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, symbolizeProfile, wavHeader, wispBackend, xrgbToRgba };