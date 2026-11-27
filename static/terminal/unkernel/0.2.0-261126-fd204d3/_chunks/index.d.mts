/**
 * What a full ring makes a writer do: wait for the reader, take the records
 * out and post them to the reader, or (the reader's own thread) take them out
 * and hand them on.
 */
type ConsoleFull = "wait" | "post" | "take";
/** One batch of console output taken out of the ring. */
interface ConsoleBatch {
  /** Batch number (BATCH, wraps as an int32): ConsoleOrder's order. */
  seq: number;
  bytes: Uint8Array;
}
/** Any thread's view of the ring: write records, take them out. */
declare class ConsoleRing {
  #private;
  readonly buffer: SharedArrayBuffer;
  readonly ctl: Int32Array;
  constructor(buffer: SharedArrayBuffer);
  get closed(): boolean;
  /** Bytes dropped so far (DROPPED). */
  get dropped(): number;
  /** Bytes in the ring (committed or not). Racy, for heuristics. */
  get used(): number;
  /** Nothing reserved and no batch on its way to the reader. */
  get quiet(): boolean;
  /** Anything reserved since the reader last took (a plain read: at worst stale, as the poll it serves). */
  get pending(): boolean;
  /**
   * Put src[p, p + len) in as one record (at most a quarter of the ring). False if it
   * does not fit (nothing written).
   */
  tryWrite(src: Uint8Array, p: number, len: number): boolean;
  /** Whether the record at TAIL is committed. */
  committedAtTail(): boolean;
  /** Wake a waiting reader (WAITING `w`, or whatever it is). */
  kick(w?: number): void;
  /**
   * Write src[p, p + len), splitting what is longer than a record; a full
   * ring does as `full` says (top of this file). `sink` gets the batches
   * taken out ("post", "take"). Returns the bytes dropped.
   */
  write(src: Uint8Array, p: number, len: number, full: ConsoleFull, sink?: (b: ConsoleBatch) => void): number;
  /** CPU 0's host took a posted batch. */
  batchTaken(): void;
  /**
   * Take every committed record, in order, as one chunk with a batch
   * number; null if there is none or another thread is taking (`spin`:
   * wait for it instead, briefly).
   */
  take(spin?: boolean): ConsoleBatch | null;
  /** The session ended: drop later writes, release waiting writers. */
  close(): void;
}
/**
 * The reader's loop (one thread): take what is committed, then wait on
 * WAITING with Atomics.waitAsync, eagerly (any commit wakes it) after an
 * empty take, lazily (a fuller ring, or LAZY_MS) after one that found
 * output. take() may also be called directly (CPU 0's host: its clock, its
 * own writes, idle and exit); the loop is on this thread too, so the two
 * never overlap.
 */
declare class ConsoleRingReader {
  #private;
  readonly ring: ConsoleRing;
  constructor(ring: ConsoleRing, deliver: (b: ConsoleBatch) => void);
  /** Take what is there now; true if there was something. */
  take(): boolean;
  /** Start the loop. */
  start(): void;
  /** Stop the loop (after a last take()). */
  stop(): void;
}
/** What CPU 0's host sends to start a CPU (structured-cloneable). */
interface CpuInit {
  /** The CPU number (1..). */
  cpu: number;
  /** The idle task (kw_secondary_entry's argument). */
  idle: bigint;
  /**
   * The kernel is a restored snapshot: enter kw_secondary_resume, which
   * runs the CPU's saved idle task on, instead of kw_secondary_entry
   * (bring-up). CPU 0's host knows (KernelConfig.restore); the kernel
   * starts CPUs after a restore only to resume them.
   */
  resume?: boolean;
  module: WebAssembly.Module;
  /** The kernel's shared memory. */
  memory: WebAssembly.Memory;
  /** How many CPUs the kernel was offered (wasm_cpu_count). */
  cpus: number;
  /** Address of __wasm_init_memory_flag: it must read 2 (the data is initialised) before the start function runs. */
  initFlag: number;
  /**
   * Address of CPU 0's word of pending interrupts (wasm_host_irqs). When
   * this CPU ends the session (exit, trap), it raises the stop IPI there:
   * CPU 0 may be spinning for this one, and its host takes the exit only
   * once CPU 0 suspends.
   */
  irqWord0: number;
  /**
   * The guest's monotonic clock reads `performance.timeOrigin +
   * performance.now() - epochMs` (ms) on every thread: CPU 0's clock.
   */
  epochMs: number;
  /**
   * epochMs on a SharedArrayBuffer ([0]), read instead of it where given:
   * Kernel.advanceClock() moves it while the kernel waits at a snapshot
   * point (every CPU held, none reading it).
   */
  clock?: Float64Array;
  /** Offer kwemu's JIT tier on this CPU (KernelConfig.jit). */
  jit: boolean;
  /** The memory is a memory64 one (the JIT's modules import it as such). */
  memory64: boolean;
  /** Where this CPU's JIT host mirrors its counters (JIT_MIRROR_WORDS on a SharedArrayBuffer), for CPU 0's stats(). */
  jitMirror?: Float64Array;
  /** The console ring every CPU writes its console output into (console-ring.ts). */
  console: SharedArrayBuffer;
  /** What a full ring makes this CPU do: wait for the reader, or post the records to CPU 0's host. */
  consoleFull: ConsoleFull;
}
/** Messages from a CPU to CPU 0's host. */
type CpuMessage = {
  t: "running";
} |
/** Console output taken out of a full ring ("post"), with its batch number (ConsoleOrder). */
{
  t: "out";
  seq: number;
  bytes: Uint8Array;
} | {
  t: "err";
  bytes: Uint8Array;
} |
/** A host log line (the JIT's warnings). */
{
  t: "log";
  msg: string;
} | {
  t: "exit";
  code: number;
} | {
  t: "fatal";
  msg: string;
} | {
  t: "trap";
  error: string;
};
/** CPU 0's handle on a started CPU (Platform.spawnCpu). */
interface CpuEndpoint {
  listen(h: {
    message: (msg: CpuMessage) => void;
    error: (e: unknown) => void;
  }): void;
  terminate(): void;
}
/**
 * Console batches by number, for CPU 0's host where it reads the console
 * ring itself (inline and the messages transport; console-ring.ts). It takes
 * batches out of the ring on its own thread, and another CPU that finds the
 * ring full takes one out and posts it, which CPU 0's host gets only once
 * CPU 0 suspends. Every take numbers its batch under the ring's lock, so
 * batches are written by number: one that comes early waits here for those
 * before it. At exit, what waits goes out in order without the numbers that
 * never came. Panic text (fd 2) is one CPU's (panic_cpu) and is not
 * ordered.
 */
declare class ConsoleOrder {
  /** The next number to write (wraps as an int32, as the ring's counter does). */
  private next;
  private held;
  private emit;
  constructor(emit: (bytes: Uint8Array) => void);
  /** Nothing waits for an earlier batch. */
  get empty(): boolean;
  /** Write batch `seq` once every earlier one is written. */
  put(seq: number, bytes: Uint8Array): void;
  /** At exit: write everything held, in order, skipping the numbers still on the way. */
  flush(): void;
}
/** DRM fourcc of XRGB8888 ("XR24"): 32-bit pixels, little endian B, G, R, X. */
export declare const FOURCC_XRGB8888 = 875713112;
export interface DisplayMode {
  width: number;
  height: number;
  /** Bytes per row. */
  stride: number;
  /** DRM fourcc; only FOURCC_XRGB8888 so far. */
  format: number;
}
/** A picture that takes the display over from kwfb (DisplayHost.setScanout). */
interface DisplaySource {
  mode: DisplayMode;
  /**
   * `mode.height` rows of `mode.stride` bytes (the last may be just
   * `width * 4`), XRGB8888; read at once. Null for a picture that is not
   * in this thread's memory: a virtio-gpu 3D resource, a GL texture where
   * the renderer runs (GlHost presents it; KernelHandle.frame() reads it
   * back there).
   */
  pixels(): Uint8Array | null;
}
/** A copy of the frame, RGBA (the layout of canvas ImageData). */
export interface DisplayFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
/** A display size in pixels. */
export interface DisplaySize {
  width: number;
  height: number;
  /**
   * Pixels per inch of this size on the host's screen (a browser's CSS
   * pixels: 96). With it the guest learns the physical size of its picture
   * (fb_var_screeninfo width and height, in mm), scaled to fit this area
   * when the mode differs from it. Default: unknown.
   */
  dpi?: number;
}
/**
 * The display option: false (none), true (640x480), a size, or a function
 * that returns the size wanted each time a program first opens /dev/fb0.
 */
export type DisplayOption = boolean | DisplaySize | (() => DisplaySize);
export declare const DEFAULT_DISPLAY_SIZE: DisplaySize;
export interface DisplayHostOptions {
  /** Offer a display to the kernel, and the size wanted. Default false: no /dev/fb0. */
  enabled?: DisplayOption;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** A program opened the display (mode), or the last one closed it (null). */
  onChange?: (mode: DisplayMode | null) => void;
  log?: (msg: string) => void;
}
/** What a machine snapshot keeps of the display (DisplayHost.saveState()). */
interface DisplaySnapshot {
  /** Address of the pixels in kernel memory, 0 while detached. */
  addr: number;
  mode: DisplayMode | null;
  /** The size last offered to the kernel (for the physical size). */
  offered: DisplaySize | null;
}
export interface DisplayStats {
  /** wasm_driver_fb_attach() calls with pixels. */
  attaches: number;
  /** ... and without (the last close). */
  detaches: number;
}
export declare class DisplayHost {
  #private;
  readonly enabled: boolean;
  /** Address of kwfb's pixels in kernel memory; 0 while nothing has /dev/fb0 open. */
  addr: number;
  /** Did the kernel ask (wasm_driver_fb_init)? False for a kernel without kwfb. */
  probed: boolean;
  stats: DisplayStats;
  constructor(opts: DisplayHostOptions);
  /** The mode of what the display shows (the scanout's, else kwfb's while attached), else null. */
  get mode(): DisplayMode | null;
  /** The size the host wants now (the option, or its function's answer; default 640x480). */
  wantedSize(): DisplaySize;
  /** Replace the size wanted (the option's size or function) from now on; ignored without a display. */
  setSize(size: DisplaySize | (() => DisplaySize)): void;
  /**
   * Let another source have the display (virtio-gpu's scanout), or give
   * it back to kwfb (null). onChange hears the mode that is shown now.
   */
  setScanout(src: DisplaySource | null): void;
  imports(): Record<string, unknown>;
  /** The state a snapshot keeps (the pixels are in the kernel's memory). */
  saveState(): DisplaySnapshot;
  /**
   * A restored snapshot: the kernel does not ask init or attach again, so
   * take the saved attachment and tell onChange, as an attach would.
   */
  restoreState(s: DisplaySnapshot): void;
  /**
   * The pixels shown, in place (no copy): `mode.height` rows of
   * `mode.stride` bytes, XRGB8888 (kwfb's in the guest's memory, or the
   * scanout's host copy). Null while nothing is shown. Valid only until
   * the kernel runs again (the program may close the device and the
   * kernel reuse the memory), so read it at once and do not keep it.
   */
  pixels(): Uint8Array | null;
  /**
   * Copy the current frame as RGBA (alpha 255), e.g. for
   * `new ImageData(frame.data, frame.width)`. `out` is reused when it has
   * the right size. Null while detached.
   */
  readRGBA(out?: Uint8ClampedArray): DisplayFrame | null;
}
/**
 * Convert packed XRGB8888 rows (`width * 4` bytes each, as worker mode
 * sends frames) to RGBA with alpha 255. `out` is reused when it has the
 * right size.
 */
export declare function xrgbToRgba(src: Uint8Array, width: number, height: number, out?: Uint8ClampedArray): Uint8ClampedArray;
/** A frame as a binary PPM (P6) image. */
export declare function frameToPpm(frame: DisplayFrame): Uint8Array;
export declare const EV_SYN = 0;
export declare const EV_KEY = 1;
export declare const EV_REL = 2;
export declare const EV_ABS = 3;
export declare const REL_X = 0;
export declare const REL_Y = 1;
export declare const REL_WHEEL = 8;
export declare const ABS_X = 0;
export declare const ABS_Y = 1;
/** The tablet's ABS_X/ABS_Y range is 0..ABS_MAX. */
export declare const ABS_MAX = 32767;
export declare const BTN_LEFT = 272;
export declare const BTN_RIGHT = 273;
export declare const BTN_MIDDLE = 274;
/** kwinput device numbers (the bits of the open mask). */
export declare const INPUT_KEYBOARD = 0;
export declare const INPUT_MOUSE = 1;
export declare const INPUT_TABLET = 2;
/** Which kwinput devices some guest program has open. */
export interface InputState {
  keyboard: boolean;
  /** The relative mouse. */
  mouse: boolean;
  /** The absolute pointer (tablet). A kernel without it never sets this. */
  tablet: boolean;
}
/**
 * The evdev injection surface: InputHost inline, and in worker mode a
 * mirror on the owner's thread that forwards each call to the worker's
 * InputHost (worker-devices.ts). Return values say whether the guest gets
 * the event (in worker mode: as far as this thread knows the open state).
 */
export interface Evdev {
  /** Open mask: bit INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET. */
  readonly mask: number;
  readonly keyboardOpen: boolean;
  readonly mouseOpen: boolean;
  readonly tabletOpen: boolean;
  readonly state: InputState;
  key(code: number, down: boolean): boolean;
  button(code: number, down: boolean): boolean;
  move(dx: number, dy: number): boolean;
  wheel(clicks: number): boolean;
  moveTo(x: number, y: number): boolean;
  tabletButton(code: number, down: boolean): boolean;
  tabletWheel(clicks: number): boolean;
  releaseAll(): void;
}
export interface InputHostOptions {
  /** Offer the devices (the kernel registers them only then). Default false. */
  enabled?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_INPUT and wake the kernel. */
  raise: () => void;
  /** The open state changed. */
  onChange?: (state: InputState) => void;
}
/** What a machine snapshot keeps of kwinput (InputHost.saveState()). */
interface InputSnapshot {
  /** Open mask. */
  mask: number;
  /** Keys and buttons the guest saw pressed. */
  keys: number[];
  buttons: number[];
  tabletButtons: number[];
  /** Events the guest had not read yet, flat: device, type, code, value. */
  queue: number[];
}
export interface InputStats {
  /** Events the kernel took. */
  delivered: number;
  /** Presses and motion dropped because no program had the device open, or the queue was full. */
  dropped: number;
}
export declare class InputHost implements Evdev {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_input_init)? False for a kernel without kwinput. */
  probed: boolean;
  /** Open mask from the kernel: bit INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET. */
  mask: number;
  stats: InputStats;
  constructor(opts: InputHostOptions);
  /** Some program has the keyboard open. */
  get keyboardOpen(): boolean;
  /** Some program has the mouse open. */
  get mouseOpen(): boolean;
  /** Some program has the absolute pointer (tablet) open. */
  get tabletOpen(): boolean;
  get state(): InputState;
  /**
   * Press (down = true) or release a key, by Linux key code (see
   * domCodeToLinux()). Returns whether the guest gets it: a press only
   * while the keyboard is open, a release only of a key it saw pressed.
   * Repeats of a held key are ignored (the device has no EV_REP).
   */
  key(code: number, down: boolean): boolean;
  /** Press or release a mouse button (BTN_LEFT, BTN_RIGHT, BTN_MIDDLE); like key(). */
  button(code: number, down: boolean): boolean;
  /** Relative pointer motion in pixels (rounded); dropped while the mouse is closed. */
  move(dx: number, dy: number): boolean;
  /** Wheel clicks: positive = away from the user (up), as REL_WHEEL. */
  wheel(clicks: number): boolean;
  /**
   * Move the absolute pointer to (x, y), normalised: 0..1 from the left
   * and top edges of the picture (clamped). For a pixel px of a mode
   * `width` wide, x = (px + 0.5) / width lands on it. Dropped while the
   * tablet is closed.
   */
  moveTo(x: number, y: number): boolean;
  /** Press or release a button of the absolute pointer; like button(). */
  tabletButton(code: number, down: boolean): boolean;
  /** Wheel clicks on the absolute pointer; like wheel(). */
  tabletWheel(clicks: number): boolean;
  /** Release every key and button the guest saw pressed (e.g. when the page loses focus). */
  releaseAll(): void;
  /** The state a snapshot keeps. */
  saveState(): InputSnapshot;
  /**
   * A restored snapshot: the kernel does not call init or report the open
   * state again, so take them from the snapshot. The guest still gets the
   * events it had not read, then a release of every key and button it saw
   * pressed (the host's keys are not held in the new session).
   */
  restoreState(s: InputSnapshot): void;
  imports(): Record<string, unknown>;
}
/**
 * Linux key codes by DOM KeyboardEvent.code (the physical key, independent
 * of the layout), for a US-layout PC keyboard and the usual extra keys.
 */
export declare const DOM_CODE_TO_LINUX: Readonly<Record<string, number>>;
/** The Linux key code of a DOM KeyboardEvent.code, or undefined. */
export declare function domCodeToLinux(code: string): number | undefined;
/** The evdev button of a DOM MouseEvent.button (0 left, 1 middle, 2 right), or undefined. */
export declare function domButtonToLinux(button: number): number | undefined;
/** CreateKernelOptions.profile. */
export interface ProfileOptions {
  /** Time samples per second and CPU (needs a shared memory: the SMP kernel). Default 1000; 0: none. */
  hz?: number;
  /** An instruction sample every this many user instructions of a CPU. Default 1000000; 0: none. */
  insns?: number;
}
/** One (command, process, pc) of the report. */
export interface ProfileRow {
  comm: string;
  /** The process (thread group) id. */
  pid: number;
  /** The user pc, hex: where a time sample stopped, or the next instruction of an instruction sample. */
  pc: string;
  /** Time samples in user code that stopped at `pc`. */
  timeSamples: number;
  /** Time samples in the kernel while the task's user pc was `pc` (a system call or fault from there). */
  kernelSamples: number;
  /** Instruction samples at `pc`. */
  insnSamples: number;
  /** The block that ran before most of the time samples here (hex), and their share. */
  prevBlockPc?: string;
  prevBlockShare?: number;
  /** The tier that saw most of the time samples here (ProfileTier), and the count per tier. */
  tier?: ProfileTier;
  tiers?: Partial<Record<ProfileTier, number>>;
}
/**
 * How kwemu saw a time sample's bit: pending when kw_run began (after a
 * stop for an instruction sample), after a single step or in the reference
 * loop, after decoded ops, after compiled code, or at the end of a slice.
 */
export type ProfileTier = "none" | "entry" | "reference" | "decoded" | "compiled" | "budget";
/** Where a sample's code is: a file the guest names, or neither (FILE_ANON, FILE_UNKNOWN). */
export declare const PROFILE_ANON = "[anon]";
export declare const PROFILE_UNKNOWN = "[unknown]";
/**
 * Time and instruction samples of a 4 KiB page of user code in a file,
 * over every process (time at the block that ran: prevBlockPc). Anonymous
 * memory and samples whose file is unknown stay per process, by virtual
 * page (`pid` set).
 */
export interface ProfilePage {
  /** The file as the guest named it, or PROFILE_ANON / PROFILE_UNKNOWN. */
  path: string;
  /** The page's first file offset, hex (with `pid`: its first virtual address). */
  page: string;
  pid?: number;
  /** Processes with samples here, and the command with the most. */
  processes: number;
  comm: string;
  timeSamples: number;
  insnSamples: number;
  /** symbolizeProfile(): the symbol of the page's busiest site. */
  symbol?: string;
}
/** A 4 KiB virtual page of one process (the per-process view of `pages`). */
export interface ProfileProcPage {
  comm: string;
  pid: number;
  /** The page's first address, hex. */
  page: string;
  path: string;
  timeSamples: number;
  insnSamples: number;
}
/**
 * One (file, offset) over every process: for time samples the start of the
 * block that ran (prevBlockPc, or the stop pc without one), for instruction
 * samples the next pc. Anonymous memory and unknown files: per process, by
 * virtual address (`pid` set).
 */
export interface ProfileSite {
  path: string;
  /** File offset, hex (with `pid`: the virtual address). */
  off: string;
  pid?: number;
  processes: number;
  comm: string;
  timeSamples: number;
  insnSamples: number;
  /** The tier that saw most of the time samples here, and the count per tier. */
  tier?: ProfileTier;
  tiers?: Partial<Record<ProfileTier, number>>;
  /** symbolizeProfile(): the nearest ELF symbol at or below `off`, as name+0xdelta. */
  symbol?: string;
}
/** Samples per file (PROFILE_ANON and PROFILE_UNKNOWN over every process). */
export interface ProfileFile {
  path: string;
  processes: number;
  timeSamples: number;
  insnSamples: number;
}
/** symbolizeProfile(): samples per (file, symbol). */
export interface ProfileSymbol {
  path: string;
  symbol: string;
  timeSamples: number;
  insnSamples: number;
}
export interface ProfileCpu {
  cpu: number;
  /** Sampler ticks for this CPU, and those that found its last bit not taken (idle, or in the kernel all along). */
  ticks: number;
  missed: number;
  user: number;
  kernel: number;
  idle: number;
  insns: number;
  /** Samples the kernel dropped (its ring was full). */
  dropped: number;
}
export interface ProfileReport {
  version: 2;
  /** Time samples asked per second and CPU (0: none), and whether a sampler ran (a shared memory and a platform that starts one). */
  hz: number;
  timeSampling: boolean;
  /** The instruction period (0: none). */
  insnPeriod: number;
  /** Milliseconds from the start of sampling to this report. */
  durationMs: number;
  cpus: number;
  totals: {
    user: number;
    kernel: number;
    idle: number;
    insns: number;
    dropped: number;
    ticks: number;
    missed: number;
  };
  /**
   * User time and instruction samples by what backs their address: a file
   * (`file`), anonymous memory (`anon`), a file without a name slot
   * (`noName`: the kernel's table of `maxFiles` names is full) or unknown
   * (`unknown`: no VMA, or the task's mmap_lock was busy). `named`: files
   * the kernel has named.
   */
  where: {
    file: number;
    anon: number;
    noName: number;
    unknown: number;
    named: number;
    maxFiles: number;
  };
  perCpu: ProfileCpu[];
  /** Per command: time samples in user code, in the kernel and idle, and instruction samples. */
  comms: {
    comm: string;
    user: number;
    kernel: number;
    idle: number;
    insns: number;
  }[];
  /** Most time first, then most instructions (also below). */
  files: ProfileFile[];
  pages: ProfilePage[];
  sites: ProfileSite[];
  /** After symbolizeProfile(). */
  symbols?: ProfileSymbol[];
  /** Per process: stop pcs, and virtual pages. */
  rows: ProfileRow[];
  procPages: ProfileProcPage[];
}
/** What a sampler thread gets (Platform.spawnSampler). */
export interface SamplerInit {
  /** The kernel's shared memory. */
  buffer: SharedArrayBuffer;
  /** Address of CPU 0's word (wasm_host_irqs), and of kw_prof.irq_word[] (the others' words, 0 until the kernel fills them). */
  irq0: number;
  words: number;
  cpus: number;
  bit: number;
  periodMs: number;
  /** Int32: [0] stop (set and notified to end it), [1 + cpu] ticks, [1 + cpus + cpu] missed. */
  ctl: SharedArrayBuffer;
}
export interface SamplerHandle {
  stop(): void;
}
/** What Profiler needs of the Kernel (kernel.ts). */
interface ProfiledKernel {
  memory: WebAssembly.Memory;
  sharedMemory: boolean;
  exports: WebAssembly.Exports | undefined;
  irqAddr: number | undefined;
  cpus: number;
  log: (msg: string) => void;
}
interface Row {
  comm: string;
  pid: number;
  pc: bigint;
  time: number;
  kernel: number;
  insns: number;
  tiers: number[];
  blocks: Map<bigint, number>;
}
/** Samples of a site, page or file over processes. */
interface Agg {
  path: string;
  at: bigint;
  pid?: number;
  time: number;
  insns: number;
  tiers: number[];
  comms: Map<string, number>;
  pids: Set<number>;
}
declare class Profiler {
  hz: number;
  insns: number;
  k: ProfiledKernel | undefined;
  addr: number;
  nr: number;
  ringSize: number;
  rec: number;
  stride: number;
  rings: number;
  /** Each ring's dropped count when this host attached (a restored kernel's are older). */
  dropBase: number[];
  sampler: SamplerHandle | null;
  ctl: Int32Array | null;
  timer: ReturnType<typeof setInterval> | undefined;
  t0: number;
  tEnd: number;
  rowMap: Map<string, Row>;
  procPageMap: Map<string, ProfileProcPage>;
  siteMap: Map<string, Agg>;
  pageMap: Map<string, Agg>;
  fileMap: Map<string, Agg>;
  where: {
    file: number;
    anon: number;
    noName: number;
    unknown: number;
  };
  /** File id n's path is paths[n - 1] (read as samples name new ids). */
  paths: string[];
  maxFiles: number;
  pathSize: number;
  commMap: Map<string, {
    comm: string;
    user: number;
    kernel: number;
    idle: number;
    insns: number;
  }>;
  perCpu: ProfileCpu[];
  constructor(opts: ProfileOptions);
  /**
   * After instantiation (and after a snapshot's memory is in): find
   * kw_prof, start from what the rings hold now, and set what to sample.
   * False if the kernel has no profiler.
   */
  attach(k: ProfiledKernel, spawnSampler?: (init: SamplerInit) => SamplerHandle): boolean;
  /** The kernel has ended: take the rest and stop the sampler. */
  stop(): void;
  /** Take every sample the rings hold. */
  drain(): void;
  /** The path of file id `id` (1-based), reading the names the kernel wrote since the last call. */
  pathOf(dv: DataView, u8: Uint8Array, id: number): string;
  add(dv: DataView, u8: Uint8Array, s: number): void;
  /** The histogram so far (drains first while the kernel runs). */
  report(): ProfileReport;
}
/**
 * A short text summary of a report: the split, the commands, the files,
 * then the top `top` pages of files (over every process) by time share,
 * with their instruction share and the ratio of the two (>1: slower per
 * instruction than the average), the top symbols (if symbolized) the same
 * way, and the top sites by time with the tier that saw them.
 */
export declare function formatProfile(r: ProfileReport, top?: number): string;
/** Reads a guest file by the path a report names (undefined: not available). */
export type ProfileFileReader = (path: string) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
/**
 * Name the code of a report: read the files of its top `top` sites and
 * pages (by time, then instructions) through `read`, and set `symbol` on
 * every site and page of a file that is an ELF file with symbols (the
 * nearest function symbol at or below the offset: .symtab, else the
 * exported ones in .dynsym; "?" after it when the offset is beyond that
 * symbol's size, which in a stripped file means a local function, and
 * none when it is more than 64 KiB beyond), and
 * `symbols`, the samples per (file, symbol; those past a symbol's end add
 * up as "name?"). Returns the report.
 */
export declare function symbolizeProfile(r: ProfileReport, read: ProfileFileReader, top?: number): Promise<ProfileReport>;
/** JIT counters of one kernel (Kernel.jit.stats). */
export interface JitStats {
  /** The host offers the JIT (KernelConfig.jit, and the engine can compile synchronously). */
  enabled: boolean;
  /** The kernel's kwemu asked for it (kw_host_jit_caps was called): false for a kernel without the tier. */
  requested: boolean;
  /** Blocks compiled and installed. */
  compiled: number;
  /** Compiled blocks currently installed (compiled - freed). */
  live: number;
  /** Most blocks installed at once (kwemu's pool has 1024 slots). */
  maxLive: number;
  /** Slots kwemu released (block overwritten, evicted or cache reset). */
  freed: number;
  /** Compiles that failed (kwemu interprets those blocks), plus rejected calls. */
  failed: number;
  /** Total time spent compiling and instantiating (with V8, also the first call's compile), in ms. */
  compileMs: number;
  /** Longest single compile, instantiation and first call, in ms (the longest the CPU could not answer an interrupt for one). */
  maxCompileMs: number;
  /** Total size of the compiled modules, in bytes. */
  bytes: number;
  /** Compiled modules the engine has garbage-collected (-1: no FinalizationRegistry, unknown). */
  collected: number;
  /** Freed modules not collected yet (freed - collected; -1 when unknown). */
  retained: number;
  /** Most freed modules uncollected at once (-1 when unknown). */
  maxRetained: number;
  /** ArrayBuffers allocated to prompt a collection (retained above RETAINED_NUDGE). */
  gcNudges: number;
  /** Compiles refused because retained reached RETAINED_LIMIT (kwemu interprets those blocks). */
  refused: number;
}
/**
 * kwemu's own counters, from a kernel built with -Dkwemu-stats
 * (`kernel/build.sh stats`) that has compiled at least one block.
 */
export interface KwemuStats {
  /** Guest instructions retired (struct kw_cpu icount). */
  icount: number;
  /**
   * kwemu.Stats as 64-bit words, in the layout of src/emu/kwemu.zig: 11
   * counters, op_hist[192], JIT insns, hand-backs, hb[192], hb_gen[40],
   * jx[64] (indices in src/emu/jitcore.zig Jx), gen_words[3 * 256] (A64:
   * `generic` ops by word, kwemu.zig countGenWord).
   */
  words: number[];
}
export interface JitHostOptions {
  /** Offer the JIT (default true); false: kw_host_jit_caps() returns 0. */
  enabled?: boolean;
  /** The kernel's memory, read at call time (boot may switch memory types). */
  memory: () => WebAssembly.Memory;
  /** Whether that memory is a memory64 one, read at call time. */
  memory64: () => boolean;
  log?: (msg: string) => void;
  /** Uncollected freed modules from which the host prompts a collection (default RETAINED_NUDGE; Infinity: never). */
  retainedNudge?: number;
  /** Uncollected freed modules at which compiles are refused (default RETAINED_LIMIT; Infinity: never). */
  retainedLimit?: number;
  /**
   * A secondary CPU's host (cpu.ts): copy the counters here after every
   * compile and free (JIT_MIRROR_WORDS, on a SharedArrayBuffer), where
   * CPU 0's host reads them (jitStatsFromMirror).
   */
  mirror?: Float64Array;
}
/** Whether this engine compiles fixed-width SIMD (cap bit 5). */
export declare function jitSimd(): boolean;
export declare class JitHost {
  #private;
  readonly stats: JitStats;
  constructor(opts: JitHostOptions);
  /** Bind to the kernel instance's function table; call after instantiation, before _start. */
  attach(exports: WebAssembly.Exports): void;
  /**
   * kwemu's counters, if the kernel exports them (-Dkwemu-stats) and has
   * compiled a block (that is how the cpu is found). It writes the emit
   * buffer, which is free outside kw_host_jit_compile, so any call from
   * JavaScript is safe.
   */
  kwemuStats(of?: number | undefined): KwemuStats | undefined;
  /** The three `unkernel` imports. */
  imports(): Record<string, unknown>;
  caps(): number;
  compile(ptr: bigint | number, len: bigint | number, slot: number, flags?: number): number;
  free(slot: number): void;
}
/** ALSA formats the kernel offers (SNDRV_PCM_FORMAT_*). */
export declare const SOUND_FORMAT_U8 = 1;
export declare const SOUND_FORMAT_S16_LE = 2;
/** The format of a playback stream. */
export interface SoundFormat {
  /** Frames per second. */
  rate: number;
  /** 1 or 2 (interleaved: left, right). */
  channels: number;
  /** SOUND_FORMAT_U8 (unsigned 8 bit) or SOUND_FORMAT_S16_LE (signed 16 bit). */
  format: number;
  /** Bytes per frame (channels * sample size). */
  frameBytes: number;
}
/** What a guest program is doing with the sound device. */
export interface SoundState {
  /** Some program has the PCM open. */
  open: boolean;
  /** The stream is running: chunks are coming. */
  playing: boolean;
  /** The format once the program set it (prepare), else null. */
  format: SoundFormat | null;
}
/** PCM the guest played, in the stream's format. */
export interface SoundChunk {
  format: SoundFormat;
  /** A copy, owned by the receiver. */
  data: Uint8Array;
  /** data.length / format.frameBytes. */
  frames: number;
}
export interface SoundSink {
  /**
   * The host's preferred rate (e.g. an AudioContext's), shown in the card's
   * long name; programs still choose any rate from 8000 to 48000 Hz.
   */
  rate?: number;
  /**
   * PCM played by the guest, in order. Return the frames (at the chunk's
   * rate) still queued for output after it, if known: programs see it as
   * part of their delay (snd_pcm_delay).
   */
  onChunk?: (chunk: SoundChunk) => number | void;
  /**
   * Worker mode with shared memory: receives the shared PCM ring buffer once the
   * kernel starts (sound-ring.ts). When set and shared memory is active, PCM
   * chunks remain in the ring for the consumer's SoundRingReader (exactly
   * one) rather than being drained into onChunk; otherwise (inline or
   * shared: false) onChunk receives chunks as usual, and a sink without it
   * gets no PCM. The ring also holds a record per state change, in order
   * with the PCM (a reader that was not reading meets the old stream's
   * records first), and the reader reports the frames it has queued with
   * setQueuedFrames(), which the guest sees as the stream's delay.
   */
  onRing?: (ring: SharedArrayBuffer) => void;
  /** The state changed (open, format, start, stop, close). */
  onState?: (state: SoundState, event: SoundEvent) => void;
}
/** A state change, as wasm_driver_sound_event() reports it. */
export type SoundEvent = "open" | "prepare" | "start" | "stop" | "drain" | "close";
/** The sound option: false (no device), true (a device whose output is dropped), or a sink. */
export type SoundOption = boolean | SoundSink;
export interface SoundStats {
  /** Opens of the PCM. */
  opens: number;
  /** Stream starts (one per start after prepare, including restarts after an underrun). */
  starts: number;
  /** Stops that were not the end of a drain: underruns, drops (snd_pcm_drop, close while running). */
  stops: number;
  chunks: number;
  frames: number;
  /**
   * The longest a player that started with the first chunk of a stream
   * would have waited for data, in ms: the largest shortfall of frames
   * received against frames due by the host clock since the stream
   * started. A sink needs at least this much queued to play without gaps.
   */
  maxLagMs: number;
}
/** What a machine snapshot keeps of kwsnd (SoundHost.saveState()). */
interface SoundSnapshot {
  state: SoundState;
}
export interface SoundHostOptions {
  /** Offer a sound device, and where its output goes. Default false: no sound card. */
  enabled?: SoundOption;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  log?: (msg: string) => void;
}
export declare class SoundHost {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_sound_init)? False for a kernel without kwsnd. */
  probed: boolean;
  state: SoundState;
  stats: SoundStats;
  constructor(opts: SoundHostOptions);
  /** A program is playing (the stream runs). */
  get playing(): boolean;
  /** The state a snapshot keeps. */
  saveState(): SoundSnapshot;
  /**
   * A restored snapshot: the kernel does not call init again and the
   * stream goes on where it was, so take the saved state and replay it to
   * the sink (open, prepare, start) as the guest's calls did. The kernel's
   * timer keeps handing over frames on the guest's clock, which a restore
   * continues.
   */
  restoreState(s: SoundSnapshot): void;
  imports(): Record<string, unknown>;
}
/** Samples of a chunk as floats in [-1, 1), interleaved like the input. */
export declare function pcmToFloat32(data: Uint8Array, format: SoundFormat, out?: Float32Array): Float32Array;
/**
 * A canonical 44-byte WAV (RIFF, PCM) header for `dataBytes` bytes of
 * samples in `format`.
 */
export declare function wavHeader(format: SoundFormat, dataBytes: number): Uint8Array;
/**
 * Convert PCM to another format: channels (mono to stereo duplicates,
 * stereo to mono averages), sample type, and rate (linear interpolation;
 * fine for checking and for occasional format changes, not for music).
 */
export declare function convertPcm(data: Uint8Array, from: SoundFormat, to: SoundFormat): Uint8Array;
/** kwshm's page size. */
export declare const SHM_PAGE_SIZE = 4096;
/** Why a shm operation failed: `code` is the errno name (ENOENT, EINVAL, ...). */
export declare class ShmError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
/** An export, as the kernel last described it. */
export interface ShmInfo {
  id: number;
  /** Bytes exported. */
  size: number;
  /** Pages held (size rounded up to whole pages). */
  pages: number;
  /** Whether the host may write (the guest's fd was writable and not sealed against writes, or a file the host opened read-write). */
  writable: boolean;
  /** Made by the guest (KWSHM_IOC_EXPORT) rather than opened or created by the host. */
  guest: boolean;
  /** Counts the page lists the kernel announced for this export (1 at first; refresh() adds one when it changes). */
  generation: number;
}
/** What a machine snapshot keeps of kwshm (ShmDevice.saveState()): the exports and their pages. */
interface ShmSnapshot {
  exports: {
    info: ShmInfo;
    runOff: number[];
    runAddr: number[];
    runLen: number[];
  }[];
  nextTag: number;
}
/** One request the API runs: inline on ShmDevice, in worker mode in the worker. */
export type ShmCall = {
  op: "open";
  name: string;
  timeout?: number;
} | {
  op: "create";
  name: string;
  size: number;
  mode?: number;
  timeout?: number;
} | {
  op: "openId";
  id: number;
} | {
  op: "refresh";
  id: number;
  force?: boolean;
  timeout?: number;
} | {
  op: "check";
  id: number;
  timeout?: number;
} | {
  op: "close";
  id: number;
  timeout?: number;
} | {
  op: "read";
  id: number;
  offset: number;
  length: number;
} | {
  op: "write";
  id: number;
  offset: number;
  data: Uint8Array;
};
/** What a ShmCall gives: an export's info (open, create, openId, refresh), a flag (check), bytes (read) or nothing. */
export type ShmCallResult = ShmInfo | boolean | Uint8Array | undefined;
/** Runs of consecutive pages: start offset in the export, linear address, length (bytes). */
interface Runs {
  runOff: Float64Array;
  runAddr: Uint32Array;
  runLen: Float64Array;
}
/**
 * An export's page runs for the owner's thread (worker mode with a shared
 * memory): its slot in ShmShareServer's table and the token the slot holds
 * while these runs are current, and the bytes they cover.
 */
export interface ShmPlace extends Runs {
  slot: number;
  token: number;
  size: number;
  writable: boolean;
}
export interface ShmDeviceOptions {
  /** Offer the device (the kernel registers kwshm only then). Default false. */
  enabled?: boolean;
  /** False when the kernel has no kwshm (no wasm_driver_shm_init import): requests fail with ENODEV at once. */
  driver?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_SHM and wake the kernel. */
  raise: () => void;
}
export interface ShmDeviceStats {
  /** Requests sent to the kernel, and how many it refused. */
  requests: number;
  failed: number;
  /** Page lists announced (exports and refreshes) and exports withdrawn. */
  attaches: number;
  detaches: number;
  /** Exports alive now. */
  exports: number;
  /** Bytes copied out of and into exported pages. */
  bytesRead: number;
  bytesWritten: number;
}
/**
 * The kernel's end of kwshm, on the kernel's thread: the imports, the
 * request queue and the page lists of every live export.
 */
export declare class ShmDevice {
  #private;
  readonly enabled: boolean;
  readonly driver: boolean;
  /** Did the kernel ask (wasm_driver_shm_init)? */
  probed: boolean;
  /** An export's page list arrived or changed (inside the import: do not call into the kernel). */
  onAttach: ((info: ShmInfo) => void) | undefined;
  /** An export is gone (inside the import). */
  onDetach: ((id: number) => void) | undefined;
  /**
   * Export `id`'s current page list stops being current: inside its detach
   * import, or the attach of a refreshed list, before the kernel may free
   * the old pages (they are still held while this runs); also for every
   * export at close(). ShmShareServer hooks it.
   */
  onRetire: ((id: number) => void) | undefined;
  stats: ShmDeviceStats;
  constructor(opts: ShmDeviceOptions);
  imports(): Record<string, unknown>;
  /** Is there an export `id`? */
  has(id: number): boolean;
  /** Export `id`'s page runs and size (ShmShareServer), or undefined if there is no such export. */
  runs(id: number): (Runs & {
    size: number;
    writable: boolean;
  }) | undefined;
  /** Requests queued or waiting for the kernel's answer (a snapshot refuses then). */
  get busy(): number;
  /** The state a snapshot keeps (the pages stay held by the kernel). */
  saveState(): ShmSnapshot;
  /**
   * A restored snapshot: the kernel does not announce its exports again,
   * so take their page lists from the snapshot. Guest exports can be
   * opened by id again (openId()); exports the old host opened stay held
   * in the kernel until closed by id.
   */
  restoreState(s: ShmSnapshot): void;
  /** The export's current description, or undefined if there is no such export. */
  info(id: number): ShmInfo | undefined;
  /** Send a request to the kernel; resolves with its answer (>= 0) or rejects with a ShmError. */
  request(op: number, what: string, f: {
    id?: number;
    flags?: number;
    size?: number;
    name?: string;
    timeout?: number;
  }): Promise<number>;
  /** Copy bytes out of export `id` (into `out` at 0 if given). Synchronous: call it on the kernel's thread. */
  read(id: number, offset: number, length: number, out?: Uint8Array): Uint8Array;
  /** Copy `data` into export `id` at `offset`. Synchronous: call it on the kernel's thread. */
  write(id: number, offset: number, data: Uint8Array): void;
  /**
   * Views of the kernel's memory covering [offset, offset + length) of
   * export `id`, one per run of consecutive pages, in order. No copy. They
   * are valid only until the kernel runs again (the guest may release or
   * refresh the export then): use them synchronously and ask again later.
   */
  views(id: number, offset: number, length: number): Uint8Array[];
  /** Run one API call (the inline backend, and the worker's side of worker mode). */
  run(call: ShmCall): Promise<ShmCallResult>;
  /** The kernel exited: fail what is pending and forget every export (the memory stays readable, but nothing in it is held any more). */
  close(): void;
}
/** The worker's side: the slot table, and the waits in the imports (ShmDevice.onRetire). */
export declare class ShmShareServer {
  #private;
  /** TOKEN[SHARE_SLOTS], then PIN[SHARE_SLOTS] (Int32), for the owner. */
  readonly table: SharedArrayBuffer;
  /** Retires that found the owner's pin and waited, and those that gave up waiting. */
  readonly stats: {
    waits: number;
    timeouts: number;
  };
  constructor(dev: ShmDevice, log: (msg: string) => void);
  /** Export `id`'s runs for the owner, with a slot holding a token while they are current; undefined: no such export, or no slot free. */
  place(id: number): ShmPlace | undefined;
}
/**
 * The owner's side: the kernel's memory and the slot table from the worker,
 * and the places of the exports it opened. read() and views() pin the slot
 * and check its token (see the top); EAGAIN when the export has no current
 * place here (never opened by id, refreshed or withdrawn since): the message
 * path then answers.
 */
export declare class ShmInPlace {
  #private;
  constructor(memory: SharedArrayBuffer, table: SharedArrayBuffer);
  /** An info reply's place for export `id`. */
  set(id: number, place: ShmPlace): void;
  /** The export is gone. */
  drop(id: number): void;
  /** Whether export `id` has a current place here (a later call may still find it gone). */
  ready(id: number): boolean;
  read(id: number, offset: number, length: number, out?: Uint8Array): Uint8Array;
  write(id: number, offset: number, data: Uint8Array): void;
  views(id: number, offset: number, length: number): Uint8Array[];
  /** The kernel exited: forget every place (the memory stays readable, but nothing in it is held). */
  close(): void;
}
/** Why a ShmFile handle ended: close() on it, the export went away (the guest released it, or another handle closed it), or the kernel exited. */
export type ShmCloseReason = "closed" | "released" | "exit";
export interface ShmStats {
  /** Handles open now. */
  open: number;
  /** read() and write() calls, and their bytes. */
  reads: number;
  bytesRead: number;
  /** Reads (read(), readSync()) that copied on this thread: inline, or in place in worker mode. */
  inPlaceReads: number;
  writes: number;
  bytesWritten: number;
}
/** One export, seen from the host. Calls on a closed handle reject with ShmError EBADF. */
export interface ShmFile {
  /** The export's id: the kernel's (for a guest export, the one KWSHM_IOC_EXPORT returned). */
  readonly id: number;
  /** The name in /dev/shm, for files the host opened or created. */
  readonly name: string | undefined;
  /** "host" (open(), create()) or "guest" (openId()). */
  readonly origin: "host" | "guest";
  /** Bytes exported, as of the latest page list (refresh() updates it). */
  readonly size: number;
  readonly pages: number;
  readonly writable: boolean;
  /** Counts the page lists; refresh() bumps it when the kernel took the file's pages again. */
  readonly generation: number;
  /**
   * Copy `length` bytes from `offset` (default: everything from offset).
   * In place (see inPlace) the copy happens at once. Otherwise the worker
   * copies and transfers the bytes here: with the shared transport at the
   * kernel's next clock read (about every 0.6 ms while the guest runs, at
   * once when it idles), else when the kernel next yields or idles (up to
   * 20 ms while the guest is busy).
   */
  read(offset?: number, length?: number): Promise<Uint8Array>;
  /**
   * Whether readSync() and views() work now: inline always; in worker mode
   * where the kernel's memory is shared with this thread (an SMP kernel,
   * the shared transport) while this thread has the export's current page
   * list (after a refresh, until its answer: no). False once the handle
   * ended. A true answer can still be followed by an EAGAIN from those two
   * if the guest withdraws the export meanwhile.
   */
  readonly inPlace: boolean;
  /**
   * read(), synchronously, into `out` (at 0) if given: the copy happens on
   * this thread. Throws a ShmError: EOPNOTSUPP where this thread cannot see
   * the kernel's memory, EAGAIN when inPlace is false for now (read()
   * answers then), EBADF on an ended handle, EINVAL outside the export.
   */
  readSync(offset?: number, length?: number, out?: Uint8Array): Uint8Array;
  /**
   * Views of the kernel's memory for [offset, offset + length), one per run
   * of consecutive pages (a shmem file's pages are scattered), no copy; the
   * same errors as readSync(). Use them synchronously: they are valid until
   * the calling code awaits or returns to the event loop (inline the kernel
   * cannot run before; in worker mode the export's pages stay held until
   * then: a guest release meanwhile waits for it). The guest may write the
   * pages meanwhile in worker mode (its other CPUs run), so a view can see a
   * frame being drawn, as inline between two yields. Over a shared memory
   * the views are shared: APIs that refuse those (TextDecoder, WebGL
   * uploads in some engines) need a copy.
   */
  views(offset?: number, length?: number): Uint8Array[];
  /** Copy `data` into the file at `offset` (it must fit within size; the export must be writable). */
  write(offset: number, data: Uint8Array): Promise<void>;
  /**
   * Take the file's current pages if the view is stale (another size, or a
   * held page no longer in the file); `force` takes them anyway. Resolves
   * true when a new page list came (size and generation updated).
   */
  refresh(opts?: {
    force?: boolean;
    timeout?: number;
  }): Promise<boolean>;
  /** Ask the kernel whether the view is stale: the file changed size, or a held page left the file (truncated or punched). */
  isStale(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * End this handle. For a file the host opened or created this releases
   * the export (other handles to it end with "released"); a guest export
   * stays until the guest releases it.
   */
  close(): Promise<void>;
  /** Settles once the handle has ended. */
  readonly closed: Promise<ShmCloseReason>;
}
/** @deprecated Every ShmFile has views() now (ShmFile.inPlace says where it works). */
export type InlineShmFile = ShmFile;
/** The surface both inline and worker mode give as `vm.shm`. */
export interface Shm<F extends ShmFile = ShmFile> {
  /**
   * Open /dev/shm/`name` in the guest (one path component; resolved in
   * the init mount namespace). The kernel refuses names with "/" or "..",
   * directories (EISDIR), anything that is not a regular file (EINVAL) and
   * files that are not shmem (EOPNOTSUPP), e.g. a bind mount. Holes are
   * allocated. Rejects with a ShmError (ENOENT, ...; ENODEV without kwshm,
   * ETIMEDOUT after `timeout` ms, default 10000).
   */
  open(name: string, opts?: {
    timeout?: number;
  }): Promise<F>;
  /**
   * Create /dev/shm/`name` with `size` bytes (zeros, all allocated) and
   * open it, for data from the host to the guest. Fails with EEXIST if it
   * exists. `mode` defaults to 0o600 (root's).
   */
  create(name: string, size: number, opts?: {
    mode?: number;
    timeout?: number;
  }): Promise<F>;
  /** A guest export, by the id KWSHM_IOC_EXPORT gave the guest. Rejects with ENOENT if there is none. */
  openId(id: number): Promise<F>;
  /**
   * Whether this thread can read exports in place (ShmFile.inPlace,
   * readSync(), views()): inline, and in worker mode once the worker
   * shared the kernel's memory (an SMP kernel with the shared transport).
   */
  readonly inPlace: boolean;
  readonly stats: ShmStats;
}
/** Synchronous access to the kernel's memory from this thread: ShmDevice inline, ShmInPlace in worker mode. */
export interface ShmLocal {
  /** Whether export `id` can be read in place now. */
  ready(id: number): boolean;
  read(id: number, offset: number, length: number, out?: Uint8Array): Uint8Array;
  write(id: number, offset: number, data: Uint8Array): void;
  views(id: number, offset: number, length: number): Uint8Array[];
}
/** How a ShmClient runs calls: on ShmDevice (inline) or across to the worker. */
export interface ShmBackend {
  run(call: ShmCall): Promise<ShmCallResult>;
  /** In-place access where there is some (read at call time: in worker mode it comes after the start). */
  readonly local?: ShmLocal;
}
declare class Handle implements ShmFile {
  #private;
  readonly id: number;
  readonly name: string | undefined;
  readonly origin: "host" | "guest";
  readonly closed: Promise<ShmCloseReason>;
  info: ShmInfo;
  done: ShmCloseReason | undefined;
  /** close() asked the kernel to release it: its detach ends this handle as "closed". */
  closing: boolean;
  constructor(client: ShmClient<ShmFile>, info: ShmInfo, name: string | undefined);
  get size(): number;
  get pages(): number;
  get writable(): boolean;
  get generation(): number;
  end(reason: ShmCloseReason): void;
  read(offset?: number, length?: number): Promise<Uint8Array>;
  get inPlace(): boolean;
  readSync(offset?: number, length?: number, out?: Uint8Array): Uint8Array;
  write(offset: number, data: Uint8Array): Promise<void>;
  refresh(opts?: {
    force?: boolean;
    timeout?: number;
  }): Promise<boolean>;
  isStale(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  close(): Promise<void>;
  views(offset?: number, length?: number): Uint8Array[];
}
/**
 * `vm.shm`: handles to exports, on a backend (ShmDevice inline, messages
 * in worker mode). Feed it the kernel's announcements with attached(),
 * detached() and shutdown().
 */
export declare class ShmClient<F extends ShmFile = ShmFile> implements Shm<F> {
  #private;
  readonly backend: ShmBackend;
  constructor(backend: ShmBackend);
  get stats(): ShmStats;
  get inPlace(): boolean;
  open(name: string, opts?: {
    timeout?: number;
  }): Promise<F>;
  create(name: string, size: number, opts?: {
    mode?: number;
    timeout?: number;
  }): Promise<F>;
  openId(id: number): Promise<F>;
  /** @internal */
  forget(h: Handle): void;
  /** @internal */
  count(read: boolean, bytes: number, inPlace?: boolean): void;
  /** An export's page list changed (or arrived): handles to it take the new size and generation. */
  update(info: ShmInfo): void;
  /** The export is gone: its handles end with "released". */
  detached(id: number): void;
  /** The kernel exited: every handle ends with "exit". */
  shutdown(): void;
}
/** The inline `vm.shm`: ShmClient straight on the kernel's ShmDevice. */
export declare function inlineShm(dev: ShmDevice): ShmClient;
/** Throw one from a handler to answer the guest with that errno: `code` is its name ("ENOENT"). */
export declare class FsError extends Error {
  readonly code: string;
  readonly errno: number;
  constructor(code: string, message?: string);
}
export type FsFileType = "file" | "dir" | "symlink";
export interface FsAttr {
  type: FsFileType;
  /** Permission bits (default 0o644 files, 0o755 directories, 0o777 links). */
  mode?: number;
  size?: number;
  /** The owner (default FS_DEFAULT_OWNER). */
  uid?: number;
  gid?: number;
  nlink?: number;
  atimeMs?: number;
  mtimeMs?: number;
  ctimeMs?: number;
  /** Inode number (with `dev`). Without it one is derived from the path. */
  ino?: number | bigint;
  /** Device number, combined with `ino` (only needed when one tree spans devices). */
  dev?: number | bigint;
  /**
   * A change counter: changes when the data changes. Default: derived
   * from mtimeMs and size. 0 means the guest never caches this file's
   * data, so each of its reads reaches the file (for computed files,
   * whose size may change).
   */
  version?: number;
}
/**
 * The uid and gid the guest sees for a file whose backend reports none
 * (nodeFs; MemoryFs's files until chowned): 1000, the distro images'
 * user, so that the guest's default user may write where the permission
 * bits let the owner. Root may anyway; the base shell shows the number.
 */
export declare const FS_DEFAULT_OWNER = 1000;
export interface FsDirEntry {
  name: string;
  type: FsFileType;
  /** The inode number and device, as getattr gives them (else one is derived from the path). */
  ino?: number | bigint;
  dev?: number | bigint;
}
export interface FsSetAttr {
  mode?: number;
  uid?: number;
  gid?: number;
  size?: number;
  atimeMs?: number;
  mtimeMs?: number;
}
export interface FsStatFs {
  /** Block size (default 4096). */
  bsize?: number;
  blocks?: number;
  bfree?: number;
  /** Default: bfree. */
  bavail?: number;
  files?: number;
  ffree?: number;
  /** Longest name (default 255). */
  namelen?: number;
}
/** How the guest opens a file. */
export interface FsOpenFlags {
  read: boolean;
  write: boolean;
  /** O_TRUNC: truncate to 0 first. */
  truncate: boolean;
  append: boolean;
}
/**
 * An open file (Fs.open/create), used for the guest's reads, writes,
 * getattr, truncation and fsync until it closes it. It must keep working
 * after the path is renamed or removed. Without `write` the file cannot be
 * opened for writing (EACCES).
 */
export interface FsFile {
  read(offset: number, length: number): MaybePromise<Uint8Array>;
  /** Returns the bytes written. */
  write?(offset: number, data: Uint8Array): MaybePromise<number>;
  getattr?(): MaybePromise<FsAttr>;
  setattr?(attr: FsSetAttr): MaybePromise<void>;
  fsync?(): MaybePromise<void>;
  close?(): MaybePromise<void>;
}
/**
 * A file system by path: every path absolute and normalised ("/" the
 * root, no "." or ".." parts, names never contain "/"). getattr, readdir
 * and open are required. A missing change method answers EROFS (symlink
 * EOPNOTSUPP); hard links are not supported (EPERM). Handlers may be async
 * and throw an FsError, or any Error with an errno `code` as Node's fs
 * errors have, to answer with that errno; anything else is EIO and logged.
 */
export interface Fs {
  getattr(path: string): MaybePromise<FsAttr>;
  readdir(path: string): MaybePromise<FsDirEntry[]>;
  /** Open a regular file. */
  open(path: string, flags: FsOpenFlags): MaybePromise<FsFile>;
  /** Create a regular file (EEXIST if the name exists) and return it open for reading and writing. */
  create?(path: string, mode: number): MaybePromise<FsFile>;
  mkdir?(path: string, mode: number): MaybePromise<void>;
  symlink?(path: string, target: string): MaybePromise<void>;
  readlink?(path: string): MaybePromise<string>;
  /** `dir`: rmdir (ENOTEMPTY unless empty), else unlink. */
  remove?(path: string, dir: boolean): MaybePromise<void>;
  /** Replaces `to` if it exists (an empty directory, or a non-directory over a non-directory). */
  rename?(from: string, to: string): MaybePromise<void>;
  /** Change a path that is not open (chmod, utimes, truncate by name). */
  setattr?(path: string, attr: FsSetAttr): MaybePromise<void>;
  statfs?(): MaybePromise<FsStatFs>;
  /** Called once the last mount of this file system is gone (unmounted, or the VM exited). */
  close?(): MaybePromise<void>;
}
/** @internal A fid as a snapshot keeps it (JSON: inode numbers are decimal strings). */
interface P9FidSnapshot {
  fid: number;
  path: string;
  type: FsFileType;
  /** An open regular file: how it was opened, and its qid.path then. */
  open?: {
    read: boolean;
    write: boolean;
    append: boolean;
    ino: string;
  };
  /** The guest unlinked or replaced it while open: ESTALE after a restore. */
  orphan?: true;
  /** A directory listing being read (readdir past offset 0). */
  dir?: Array<{
    name: string;
    type: FsFileType;
    ino?: string;
    dev?: string;
  }>;
}
/** @internal An export's session as a snapshot keeps it (P9Server.saveExport()). */
interface P9ExportSnapshot {
  name: string;
  /** The guest connection (vsock ports and credit counters). */
  conn: VsockConnSnapshot;
  msize: number;
  fids: P9FidSnapshot[];
}
/** A file's content in a tree: text (UTF-8), bytes, or a function evaluated once per open. */
export type FsTreeFile = string | Uint8Array | (() => string | Uint8Array);
/** A directory as a plain object: names to files or subdirectories. */
export interface FsTree {
  [name: string]: FsTreeFile | FsTree;
}
/** What the guest changed (MemoryFs.onChange). */
export interface MemoryFsChange {
  type: "create" | "write" | "truncate" | "setattr" | "mkdir" | "symlink" | "remove" | "rename";
  path: string;
  /** rename: the new path; symlink: the target. */
  to?: string;
}
/** An in-memory Fs: a tree the host fills and reads, and the guest reads and writes. */
export declare class MemoryFs implements Fs {
  #private;
  /** A file system with `tree`'s files (see FsTree), or empty. */
  constructor(tree?: FsTree);
  /** Call `listener` for every change the guest makes. Returns the unsubscribe function. */
  onChange(listener: (change: MemoryFsChange) => void): () => void;
  /** Create or replace a file (parent directories are created). A function is evaluated once per open (and by readFile). */
  writeFile(path: string, content: FsTreeFile, opts?: {
    mode?: number;
  }): void;
  /** A file's bytes (a copy). */
  readFile(path: string): Uint8Array;
  /** A file's text (UTF-8). */
  readText(path: string): string;
  /** Create a directory and its parents (no error if it exists). */
  mkdirp(path: string, opts?: {
    mode?: number;
  }): void;
  /** Create a symbolic link at `path` to `target` (parents are created). */
  writeLink(path: string, target: string): void;
  /** Remove a file, link or directory (a non-empty directory only with `recursive`; a missing path only with `force`). */
  rm(path: string, opts?: {
    recursive?: boolean;
    force?: boolean;
  }): void;
  /** Move (rename) a file or directory, replacing a file at `to`. */
  move(from: string, to: string): void;
  /** The names in a directory. */
  list(path?: string): string[];
  /** Attributes of a path (getattr), or undefined if it does not exist. */
  stat(path: string): FsAttr | undefined;
  exists(path: string): boolean;
  getattr(path: string): FsAttr;
  readdir(path: string): FsDirEntry[];
  readlink(path: string): string;
  open(path: string, flags: FsOpenFlags): FsFile;
  create(path: string, mode: number): FsFile;
  mkdir(path: string, mode: number): void;
  symlink(path: string, target: string): void;
  remove(path: string, dir: boolean): void;
  rename(from: string, to: string): void;
  setattr(path: string, attr: FsSetAttr): void;
  statfs(): FsStatFs;
}
/** A file system to mount: an Fs (MemoryFs, nodeFs(), your own) or a plain object tree (made a MemoryFs). */
export type FsSource = Fs | FsTree;
export interface MountOptions {
  /** The host answers every change with EROFS, and the guest mounts it read-only. Default false. */
  readOnly?: boolean;
  /** How long mounting (or unmounting) may take, in ms, kwtty's start included. Default 30000; 120000 for createKernel's mounts. */
  timeout?: number;
  /** How long a handler may take before the guest's request fails with ETIMEDOUT (and a log line), in ms; 0 for never. Default 30000. */
  requestTimeout?: number;
}
export interface MountSpec extends MountOptions {
  fs: FsSource;
}
/** createKernel's `mounts`: guest paths to a file system, or to { fs, ...MountOptions }. */
export type MountsOption = Record<string, FsSource | MountSpec>;
export type MountErrorCode =
/** The instance has no vsock device, or the guest's kernel has no 9p (CONFIG_9P_FS). */
"ENODEV" |
/** The guest has no kwbox (a base from before it). */
"ENOENT" |
/** The path is already a mount point (in the guest, or by this SDK), or busy at unmount. */
"EBUSY" |
/** The guest path exists and is not a directory. */
"ENOTDIR" |
/** A bad path or file system. */
"EINVAL" |
/** The guest did not finish within the timeout (no kwtty answered, or a handler hung). */
"ETIMEDOUT" |
/** The kernel exited. */
"ECONNABORTED" |
/** The guest failed otherwise (the message has its words). */
"EREMOTE";
export declare class MountError extends Error {
  readonly code: MountErrorCode;
  constructor(code: MountErrorCode, message: string, cause?: unknown);
}
/** What the guest asked of a mount (Mount.stats). */
export interface MountStats {
  requests: number;
  /** Requests answered with an error. */
  errors: number;
  /** Payload bytes the guest read and wrote. */
  bytesRead: number;
  bytesWritten: number;
}
/** A host file system mounted in the guest (vm.mount(), createKernel({ mounts })). */
export interface Mount {
  /** The guest path. */
  readonly path: string;
  /** True while the guest has it mounted (false once unmounted, by unmount() or in the guest, or at exit). */
  readonly mounted: boolean;
  /** Requests, errors, and payload bytes the guest read and wrote. */
  readonly stats: MountStats;
  /** Unmount it in the guest and stop serving it. Rejects with a MountError EBUSY while a guest process uses it. */
  unmount(opts?: {
    timeout?: number;
  }): Promise<void>;
}
/** @internal Host file systems as a snapshot keeps them (in VsockSnapshot.mounts). */
interface MountsSnapshot {
  /** The 9p server's next export number. */
  next: number;
  mounts: Array<{
    path: string;
    readOnly: boolean;
    export: P9ExportSnapshot;
  }>;
}
/** @internal */
type Parsed = {
  path: string;
  fs: FsSource;
  opts: MountOptions;
};
/** @internal createKernel's `mounts`, checked before boot. */
declare function parseMounts(mounts: MountsOption | undefined, vsock: boolean): Parsed[];
/** The host's CID (VMADDR_CID_HOST). */
export declare const VSOCK_HOST_CID = 2;
/** The guest's CID with kwvsock (KWVSOCK_GUEST_CID). */
export declare const VSOCK_GUEST_CID = 3;
/** Size of the packet header (struct virtio_vsock_hdr). */
export declare const VSOCK_HEADER_SIZE = 44;
/** A packet header, decoded. CIDs fit a double (they are 32-bit in practice). */
export interface VsockHeader {
  srcCid: number;
  dstCid: number;
  srcPort: number;
  dstPort: number;
  len: number;
  type: number;
  op: number;
  flags: number;
  bufAlloc: number;
  fwdCnt: number;
}
/** Decode the header at the start of a packet (at least VSOCK_HEADER_SIZE bytes). */
export declare function decodeVsockHeader(pkt: Uint8Array): VsockHeader;
/** A packet: the header (its len is the payload's) and the payload. */
export declare function encodeVsockPacket(h: Omit<VsockHeader, "len">, payload?: Uint8Array): Uint8Array;
export interface VsockDeviceOptions {
  /** Offer the device (the kernel registers its transport only then). Default false. */
  enabled?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_VSOCK and wake the kernel. */
  raise: () => void;
  /** A packet from the guest (a copy; header and payload). */
  onPacket?: (pkt: Uint8Array) => void;
  /** The kernel's driver started: the guest's CID and the largest packet it takes (header and payload). */
  onInit?: (guestCid: number, rxMax: number) => void;
}
/** What a machine snapshot keeps of kwvsock (VsockDevice.saveState()). */
interface VsockSnapshot {
  guestCid: number;
  rxMax: number;
  /**
   * Host file systems (inline mode): each mount's 9p session and the
   * vsock connection it runs on, which a restore takes over; the kernel
   * keeps exactly these connections and resets every other.
   */
  mounts?: MountsSnapshot;
}
/** @internal A connection a snapshot keeps: its ports and credit counters (Connection.saveState()). */
interface VsockConnSnapshot {
  localPort: number;
  remotePort: number;
  rxCnt: number;
  fwdCnt: number;
  sentFwd: number;
  peerBufAlloc: number;
  peerFwdCnt: number;
  txCnt: number;
}
export interface VsockDeviceStats {
  /** Packets and bytes (headers included) from the guest. */
  fromGuest: number;
  fromGuestBytes: number;
  /** Packets and bytes taken by the guest. */
  toGuest: number;
  toGuestBytes: number;
  /** Guest packets the host refused for now (the kernel sends them again). */
  refused: number;
}
/**
 * The host side of kwvsock's imports. The guest's packets go to
 * `onPacket`, packets for the guest are queued with deliver(). The queue
 * for the guest has no limit of its own: VsockHost keeps it to the guest's
 * credit for data, and control packets are small.
 */
export declare class VsockDevice {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_vsock_init)? False for a kernel without kwvsock. */
  probed: boolean;
  /** The guest's CID and largest packet it takes, from the kernel's init (0 before). */
  guestCid: number;
  rxMax: number;
  onPacket: ((pkt: Uint8Array) => void) | undefined;
  onInit: ((guestCid: number, rxMax: number) => void) | undefined;
  /**
   * Test hook: return true to refuse the guest's packet for now. The
   * kernel keeps it, with everything after it, and sends it again after
   * the next IRQ, which is raised from a timer.
   */
  refuse: (() => boolean) | undefined;
  /**
   * Connections (`guestPort:hostPort`) the kernel keeps after a restore;
   * it resets every other connected socket (wasm_driver_vsock_keep, asked
   * by kwvsock's park restore notifier). Set by the host's restore of
   * its mounts before the kernel runs; undefined resets them all.
   */
  keep: Set<string> | undefined;
  /** Saved with the device at the snapshot point: the host file systems (inline mode). */
  onSave: (() => MountsSnapshot | undefined) | undefined;
  /** Why the host's end cannot be saved at the snapshot point (a 9p request in flight), or "". */
  hostBusy: (() => string) | undefined;
  stats: VsockDeviceStats;
  constructor(opts: VsockDeviceOptions);
  /** Packets queued for the guest. */
  get queued(): number;
  /** At the snapshot point: what keeps it from being saved now ("vsock packets", a mount's request), or "". */
  blocker(): string;
  /** Queue a packet (header and payload, at most rxMax bytes once known) for the guest and raise the IRQ. */
  deliver(pkt: Uint8Array): void;
  imports(): Record<string, unknown>;
  /**
   * The state a snapshot keeps. Connections do not survive, except those
   * of host file systems (`mounts`, inline mode): after a restore the
   * kernel resets every connected socket that `keep` does not name.
   */
  saveState(): VsockSnapshot;
  /**
   * A restored snapshot: the kernel does not call init again, so take the
   * saved values and tell onInit, as init would. The kernel resets every
   * connected socket after the restore that `keep` does not name
   * (kwvsock's restore notifier), and any packet for an old connection
   * gets an RST from VsockHost.
   */
  restoreState(s: VsockSnapshot): void;
  /** Drop what is queued (the kernel exited). */
  close(): void;
}
/** Why a vsock operation failed: `code` is the errno name. */
export declare class VsockError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
export interface VsockStats {
  /** Connections open now (connecting, established or closing). */
  open: number;
  /** Connections established, in either direction. */
  accepted: number;
  connected: number;
  /** Connection requests refused (by the guest: connect(); by the host: no listener, or a full backlog). */
  refused: number;
  /** Connections reset (RST sent or received while established). */
  resets: number;
  /** Payload bytes received from and sent to the guest. */
  bytesIn: number;
  bytesOut: number;
  /** Packets the guest sent that broke the protocol (beyond the credit, unknown types). */
  violations: number;
}
/** The surface both inline and worker mode give as `vm.vsock`. */
export interface Vsock {
  /** The guest's CID (3). Connections from the host's side go to this CID. */
  readonly guestCid: number;
  /**
   * Accept guest connections to host port `port` (a guest program
   * connects to CID 2, `port`). Connections go to `onConnection` if given,
   * else they wait for accept() (or the listener's async iterator).
   * Throws a VsockError EADDRINUSE if the port is taken.
   */
  listen(port: number, onConnection?: (conn: VsockConnection) => void): VsockListener;
  /**
   * Connect to a guest program listening on `port` (bound to any CID or
   * to 3). Rejects with a VsockError: ECONNREFUSED (nothing listens),
   * ETIMEDOUT (no answer within `timeout` ms, default 10000) or
   * ECONNABORTED (the kernel exited).
   */
  connect(port: number, opts?: {
    timeout?: number;
  }): Promise<VsockConnection>;
  readonly stats: VsockStats;
}
export interface VsockListener extends AsyncIterable<VsockConnection> {
  readonly port: number;
  /** The next connection, or null once the listener is closed (or the kernel exited). */
  accept(): Promise<VsockConnection | null>;
  /** Stop listening: connections not accepted yet are reset, and new requests are refused. */
  close(): void;
}
/**
 * One stream connection. `readable` gives what the guest sends and ends
 * when the guest shuts down its sending side (or closes); `writable`
 * sends, and closing it shuts down the host's sending side (a half-close:
 * the guest reads EOF and may still send). Data is acknowledged to the
 * guest (credit) only as `readable` is read.
 */
export interface VsockConnection {
  /** The host side's port (the listener's, or the one connect() picked). */
  readonly localPort: number;
  /** The guest side's port. */
  readonly remotePort: number;
  readonly readable: ReadableStream<Uint8Array>;
  /** Strings are sent as UTF-8. A write resolves once its bytes are sent (the guest gave credit for them). */
  readonly writable: WritableStream<Uint8Array | string>;
  /**
   * Close both directions: what was written is still sent, then the
   * guest is told that the host neither sends nor receives (its reads
   * get EOF, its writes EPIPE). Data not read yet is dropped.
   */
  close(): void;
  /** Reset now (RST): pending data is dropped, the guest's writes fail with EPIPE and its reads end. */
  reset(): void;
  /** Settles once the connection is gone: "closed" (both sides shut down) or "reset" (by either side, or the kernel exited). */
  readonly closed: Promise<"closed" | "reset">;
}
export interface VsockHostOptions {
  /** Send a packet to the guest (VsockDevice.deliver, or across to the worker). */
  send: (pkt: Uint8Array) => void;
  /** The host's receive buffer per connection, the credit the guest gets (default 256 KiB). */
  bufferSize?: number;
  log?: (msg: string) => void;
}
type ConnState = "connecting" | "established" | "closing" | "closed";
declare class Connection implements VsockConnection {
  #private;
  readonly localPort: number;
  readonly remotePort: number;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array | string>;
  readonly closed: Promise<"closed" | "reset">;
  state: ConnState;
  /** connect(): settled by RESPONSE or RST. */
  onEstablished: ((err?: VsockError) => void) | undefined;
  constructor(host: VsockHost, localPort: number, remotePort: number, state: ConnState);
  get key(): string;
  /**
   * A snapshot keeps this connection: its credit counters, or why it
   * cannot be kept now (data or a shutdown on the way, which the guest's
   * memory and these counters would not agree on).
   */
  saveState(): VsockConnSnapshot | string;
  /** A restore: take the saved counters (the connection is established, nothing on the way). */
  loadState(s: VsockConnSnapshot): void;
  /** The fields every packet on this connection carries. */
  header(op: number, flags?: number): Omit<VsockHeader, "len">;
  /** A packet from the guest on this connection. */
  receive(h: VsockHeader, pkt: Uint8Array): void;
  close(): void;
  reset(): void;
  /** The kernel exited. */
  abort(): void;
}
declare class Listener implements VsockListener {
  #private;
  readonly port: number;
  closed: boolean;
  constructor(host: VsockHost, port: number, handler?: (conn: VsockConnection) => void);
  /** Room for one more connection? */
  get full(): boolean;
  offer(conn: Connection): void;
  accept(): Promise<VsockConnection | null>;
  [Symbol.asyncIterator](): AsyncIterator<VsockConnection>;
  close(): void;
}
/**
 * The host's end of the vsock protocol (CID 2): see the top of this file.
 * Give it the guest's packets with receive(); it sends through `send`.
 */
export declare class VsockHost implements Vsock {
  #private;
  /** The guest's CID (from the kernel's init; 3 until then). */
  guestCid: number;
  /** The credit each connection gives the guest. */
  readonly bufferSize: number;
  /** Payload per packet to the guest (the kernel's limit, once known, less the header). */
  maxPayload: number;
  stats: VsockStats;
  readonly log: (msg: string) => void;
  constructor(opts: VsockHostOptions);
  /** The kernel's driver started (VsockDevice onInit). */
  deviceReady(guestCid: number, rxMax: number): void;
  /** @internal */
  sendPacket(pkt: Uint8Array): void;
  /** @internal */
  forget(conn: Connection): void;
  /** @internal */
  unlisten(l: Listener): void;
  listen(port: number, onConnection?: (conn: VsockConnection) => void): VsockListener;
  connect(port: number, opts?: {
    timeout?: number;
  }): Promise<VsockConnection>;
  /**
   * @internal A restore (before the kernel runs): take over a connection
   * the snapshot kept, with its counters. The restored kernel keeps it
   * (VsockDevice.keep) and resets every other.
   */
  adopt(s: VsockConnSnapshot): VsockConnection;
  /** A packet from the guest. */
  receive(pkt: Uint8Array): void;
  /** The kernel exited: every connection ends (ECONNABORTED), listeners return null. */
  shutdown(reason?: string): void;
}
/** The guest server's vsock port (guest/src/kwtty.c KWTTY_PORT). Privileged, so no unprivileged guest program can take it. */
export declare const TTY_PORT = 1022;
/** The protocol version this client speaks (OPEN's max_version). */
export declare const TTY_VERSION = 1;
/** OPENED feature bit: the guest has PIPES, EOF and STDERR. */
export declare const TTY_FEATURE_PIPES = 1;
/** OPENED feature bit: the guest has CONNECT (connectGuest()). */
export declare const TTY_FEATURE_CONNECT = 2;
/** OPENED feature bit: the guest has USER (SpawnOptions.user). */
export declare const TTY_FEATURE_USER = 4;
/** OPENED feature bit: the guest has DETACH, ATTACH and REPLAY (PtyOptions.detachable, attachPty()). */
export declare const TTY_FEATURE_DETACH = 8;
/** How long a detached session waits for an attach unless PtyOptions.detachTimeout says otherwise (kwtty.c DETACH_MS). */
export declare const TTY_DETACH_TIMEOUT = 60000;
/** The signals kill() can send (kwtty.c has the same list). */
export declare const TTY_SIGNALS: readonly ["HUP", "INT", "QUIT", "ILL", "TRAP", "ABRT", "BUS", "FPE", "KILL", "USR1", "SEGV", "USR2", "PIPE", "ALRM", "TERM", "CHLD", "CONT", "STOP", "TSTP", "TTIN", "TTOU", "URG", "XCPU", "XFSZ", "VTALRM", "PROF", "WINCH", "IO", "PWR", "SYS"];
export type PtyErrorCode =
/** No guest server answered within the timeout (or no OPENED came). */
"ETIMEDOUT" |
/** A malformed frame, an unknown critical frame, or a version the client does not speak. */
"EPROTO" |
/** The guest sent ERROR; the message is the guest's (a failed exec or chdir; a guest without PIPES refuses `pty: false`, one without CONNECT refuses connectGuest()). */
"EREMOTE" |
/** connectGuest(): nothing listens on that TCP port on the guest's 127.0.0.1. */
"ECONNREFUSED" |
/** The signal was aborted while opening (or, for exec(), while the program ran: it is killed). */
"ABORTED" |
/** The connection ended before OPENED (or, for exec(), before EXIT). */
"ECONNRESET" |
/** The kernel exited. */
"ECONNABORTED" |
/** write() after the session ended, or the connection failed under it. */
"EPIPE" |
/** spawn(), exec() or connect() on an instance created with `vsock: false`. */
"ENODEV" |
/** attach(): no such detachable session (an unknown id, one that ended or was hung up after its timeout), or a guest whose kwtty cannot reattach (older than ATTACH). */
"ENOENT" |
/** exec(): stdout or stderr went over `maxBuffer` (the program is killed). */
"ENOBUFS";
/** Why a pty could not be spawned, or failed. */
export declare class PtyError extends Error {
  readonly code: PtyErrorCode;
  constructor(code: PtyErrorCode, message: string, cause?: unknown);
}
/** A window size; pixels are 0 when unknown. */
export interface PtySize {
  cols: number;
  rows: number;
  xpixel?: number;
  ypixel?: number;
}
/** What spawn() on a pty, spawn() on pipes and exec() take. */
export interface SpawnOptions {
  /** The program's working directory. Default the user's home. */
  cwd?: string;
  /**
   * The guest user to run as: a name, or a uid. Default the guest's default
   * user: `user` (uid 1000) on the distro images, root on the base shell.
   * "root" or 0 for root. The program gets that user's groups, HOME, USER,
   * LOGNAME, SHELL and PATH. A user the guest does not have is a PtyError
   * EREMOTE ("no user NAME"), and so is a user other than root on a guest
   * from before this option (its sessions are root's).
   */
  user?: string | number;
  /** Extra environment, applied after the defaults (HOME, USER, LOGNAME, SHELL, PATH, and TERM on a pty), so it may override them. */
  env?: Record<string, string>;
  /** The guest server's port. Default TTY_PORT (1022). */
  port?: number;
  /** How long to wait for the guest server, in ms: connect retries (it may not be up yet) and the handshake together. Default 30000. */
  timeout?: number;
  /** Aborts spawning (PtyError ABORTED). It has no effect once the program runs, except in exec(). */
  signal?: AbortSignal;
}
export interface PtyOptions extends SpawnOptions, Partial<PtySize> {
  /** On a pty (the default). */
  pty?: true;
  /** Default 80 columns by 24 rows. */
  cols?: number;
  rows?: number;
  /** TERM for the program (printable ASCII, at most 64 bytes). Default "xterm-256color". */
  term?: string;
  /**
   * A session that survives a snapshot restore (kwtty's DETACH): when the
   * connection is reset under it (a restored kernel resets every vsock
   * connection), the guest keeps the program and its pty, detached, for
   * `detachTimeout`, and attach() with `Pty.sessionId` takes it over in the
   * restored machine. close() and kill() still end it. A guest without
   * the feature opens an ordinary session (`sessionId` undefined).
   */
  detachable?: boolean;
  /** How long a detached session waits for attach() before it is hung up, in ms of the guest's monotonic time (which a restore continues). Default TTY_DETACH_TIMEOUT (60 s). */
  detachTimeout?: number;
}
/** A detachable session as a snapshot records it (KernelSnapshot.ttys): what attach() needs. */
export interface TtySessionSnapshot {
  /** Pty.sessionId. */
  id: string;
  pid: number;
  pts: number;
  /** The size last set. */
  cols: number;
  rows: number;
}
/** What attach() takes. */
export interface AttachOptions extends Partial<PtySize> {
  /** The window size now (default the saved size, else 80 by 24); the program gets SIGWINCH if it differs from the pty's. */
  cols?: number;
  rows?: number;
  /** Send the session's recent output first (the last 64 KiB, for a fresh terminal). Default true. */
  replay?: boolean;
  /** The guest server's port. Default TTY_PORT (1022). */
  port?: number;
  /** How long to wait for the guest server, in ms (connect retries and the handshake). Default 30000. */
  timeout?: number;
  /** Aborts attaching (PtyError ABORTED). */
  signal?: AbortSignal;
}
/** spawn() on pipes: stdin, stdout and stderr are pipes, with no pty (and no TERM unless `env` sets it). */
export interface PipeOptions extends SpawnOptions {
  pty: false;
}
export interface ExecOptions extends SpawnOptions {
  /** Bytes for stdin (strings are UTF-8), then EOF. Default: EOF at once. */
  input?: Uint8Array | string;
  /** "utf8" (the default): stdout and stderr as strings; "buffer": as bytes. */
  encoding?: "utf8" | "buffer";
  /** The most bytes stdout and stderr may hold, each; beyond it the program gets SIGKILL and exec() rejects with ENOBUFS. Default 64 MiB. */
  maxBuffer?: number;
  /** Also aborts the run: the program gets SIGKILL and exec() rejects with ABORTED. */
  signal?: AbortSignal;
}
/** How exec()'s program ended, and what it printed. */
export interface ExecResult<T extends string | Uint8Array = string> {
  stdout: T;
  stderr: T;
  /** The exit status, or null when a signal ended the program. */
  exitCode: number | null;
  /** The signal's number in the guest, or null when the program exited. */
  signal: number | null;
}
export type PtyEnd =
/** The program exited with `code`. */
{
  type: "exit";
  code: number;
} |
/** The program was killed by `signal` (its number in the guest). */
{
  type: "signal";
  signal: number;
  coreDumped: boolean;
} |
/** The host called close(). */
{
  type: "closed";
} |
/** EOF or a reset without EXIT, or the kernel exited (a detachable session lives on in a snapshot taken then), or another attach() took the session over. */
{
  type: "lost";
};
export interface Pty extends AsyncDisposable {
  /** The program's pid in the guest. */
  readonly pid: number;
  /** The pty's number: the program's terminal is /dev/pts/<pts>. */
  readonly pts: number;
  /** The size last set (spawn options, then resize()). */
  readonly cols: number;
  readonly rows: number;
  /** The exit status once `ended` settled with an exit, else null. */
  readonly exitCode: number | null;
  /** The protocol version both sides agreed on. */
  readonly version: number;
  /** The guest's feature bits (TTY_FEATURE_PIPES). */
  readonly features: number;
  /**
   * The id attach() takes after a snapshot restore: set for a session
   * spawned with `detachable` on a guest that has the feature, and for
   * one attach() gave, else undefined. After a snapshot with `stop` this
   * Pty ends "lost" with the kernel, while the session lives on in the
   * snapshot.
   */
  readonly sessionId: string | undefined;
  /**
   * What the pty prints. A pull stream: vsock credit follows what is read,
   * so keep reading, or the guest program blocks once the window is full.
   * It ends after EXIT, close() or a lost connection, and errors with the
   * PtyError that `ended` rejects with. Cancelling it discards the
   * rest, so `ended` still settles.
   */
  readonly output: ReadableStream<Uint8Array>;
  /** Type into the pty. Strings are UTF-8. Split into DATA frames of at most 4096 bytes; resolves once they are sent. */
  write(data: Uint8Array | string): Promise<void>;
  /** Set the window size (the foreground process gets SIGWINCH). Ordered with write(). */
  resize(cols: number, rows: number, xpixel?: number, ypixel?: number): void;
  /**
   * Send a signal to the program ("SIGTERM" or "TERM"; default SIGHUP).
   * `ended` then reports how it ended. Ordered with write(); a no-op once
   * the pty has ended. Throws a RangeError for an unknown name.
   */
  kill(signal?: string): void;
  /** Hang up (the session gets SIGHUP): closes the connection both ways. Resolves once the connection is gone. */
  close(): Promise<void>;
  /**
   * How the session ended. Settles once `output` has been read up to the
   * end (EXIT comes behind the shell's last output), or at close().
   * Rejects with a PtyError (EREMOTE, EPROTO) if the session failed.
   */
  readonly ended: Promise<PtyEnd>;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/** A program on pipes: spawn(file, args, { pty: false }). */
export interface Subprocess extends AsyncDisposable {
  /** The program's pid in the guest, the leader of its own session. */
  readonly pid: number;
  /** The exit status once `ended` settled with an exit, else null. */
  readonly exitCode: number | null;
  /** The protocol version both sides agreed on. */
  readonly version: number;
  /** The guest's feature bits (TTY_FEATURE_PIPES). */
  readonly features: number;
  /**
   * The program's stdin. Strings are UTF-8, sent in DATA frames of at most
   * 4096 bytes. close() sends EOF (the program reads end of file); a write
   * after the session ended rejects with EPIPE.
   */
  readonly stdin: WritableStream<Uint8Array | string>;
  /**
   * What the program writes to stdout and stderr, byte for byte. Pull
   * streams on one connection: the connection is read while either is
   * read, and output for the other is held until it is read, so read both,
   * or cancel the one you do not want (that discards it). They end after
   * EXIT, close() or a lost connection.
   */
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  /** Send a signal to the program ("SIGINT" or "INT"; default SIGTERM). As Pty.kill(). */
  kill(signal?: string): void;
  /** Hang up: the program's process group gets SIGHUP, and the connection closes both ways. */
  close(): Promise<void>;
  /** How the session ended. Settles once stdout and stderr have been read (or cancelled) up to EXIT, or at close(). */
  readonly ended: Promise<PtyEnd>;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/** One frame as received. */
export interface TtyFrame {
  type: number;
  flags: number;
  payload: Uint8Array;
}
/** A frame: header and payload (copied). */
export declare function encodeTtyFrame(type: number, payload?: Uint8Array, flags?: number): Uint8Array;
/** RESIZE's payload (on the wire rows come first, as in struct winsize). */
export declare function encodeTtyResize(s: PtySize): Uint8Array;
/**
 * OPEN's payload: max_version, the size, then TERM, one ENV option per
 * entry, ARG options (`file`, then `args`), CWD, PIPES, CONNECT, USER
 * (always but with `connect`: empty for the default user) and DETACH. With
 * `pipes` or `connect`, TERM goes only when `term` is given. Throws a
 * RangeError for values the guest would refuse.
 */
export declare function encodeTtyOpen(opts: PtySize & {
  term?: string;
  env?: Record<string, string>;
  cwd?: string;
  file?: string;
  args?: readonly string[];
  pipes?: boolean;
  connect?: number;
  user?: string | number;
  detach?: {
    id: string;
    timeout?: number;
  };
}): Uint8Array;
/** ATTACH's OPEN payload: max_version, the size, ATTACH (critical) and REPLAY. */
export declare function encodeTtyAttach(opts: PtySize & {
  id: string;
  replay?: boolean;
}): Uint8Array;
/**
 * Splits a byte stream into frames, however it is chunked. push() what
 * arrives, then take whole frames with next(). A payload within one chunk
 * is a view of it, else a copy.
 */
export declare class TtyFrameParser {
  #private;
  /** Bytes held that do not make a whole frame yet. */
  get buffered(): number;
  push(chunk: Uint8Array): void;
  /** The next whole frame, without taking it. */
  peek(): TtyFrame | undefined;
  /** Take the next whole frame. */
  next(): TtyFrame | undefined;
  /** Take every byte held, frames not taken yet included, as they arrived (for a switch to raw bytes). */
  rest(): Uint8Array;
}
/**
 * Run `file` with `args` on a new pty in the guest (no file: the user's login
 * shell; a file without "/" is looked up in PATH): connect to the guest's
 * kwtty server (retrying while it is not up yet), send OPEN, and wait for
 * OPENED. Rejects with a PtyError (ETIMEDOUT, EREMOTE with the guest's
 * message, e.g. a failed exec or chdir, EPROTO, ABORTED, ECONNRESET,
 * ECONNABORTED), or a RangeError for bad options.
 */
export declare function spawnPty(vsock: Vsock, file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
/**
 * Take over a detachable session (PtyOptions.detachable) by its id, or as
 * a snapshot recorded it (KernelSnapshot.ttys), typically in a machine
 * restored from a snapshot, where the restore detached it. Resolves with a
 * live Pty (the same pid and pts; with `replay`, the default, its output
 * starts with the session's recent output) once the guest took it over; a
 * connection that still had the session is closed (its Pty ends "lost").
 * Rejects with PtyError ENOENT when there is no such session (never
 * spawned in this machine, ended, or hung up after its timeout) or the
 * guest's kwtty cannot reattach (an image from before ATTACH), and
 * otherwise as spawnPty().
 */
export declare function attachPty(vsock: Vsock, session: string | TtySessionSnapshot, opts?: AttachOptions): Promise<Pty>;
/**
 * Run `file` with `args` in the guest on pipes (stdin, stdout and stderr;
 * no file: the user's login shell, reading stdin), as spawnPty() otherwise. A
 * guest without PIPES (a kernel from before them) refuses it: EREMOTE.
 */
export declare function spawnSubprocess(vsock: Vsock, file?: string, args?: readonly string[], opts?: SpawnOptions): Promise<Subprocess>;
/**
 * Run `file` with `args` on pipes, feed it `input`, and resolve with what
 * it printed on stdout and stderr and how it ended, once it ended. A
 * non-zero exit or a signal resolves too. Rejects with a PtyError as
 * spawnSubprocess(), or ENOBUFS (output over `maxBuffer`), ABORTED (the
 * signal; the program gets SIGKILL), ECONNRESET (the session was lost:
 * the kernel exited).
 */
export declare function execSubprocess(vsock: Vsock, file: string, args?: readonly string[], opts?: ExecOptions & {
  encoding?: "utf8";
}): Promise<ExecResult<string>>;
export declare function execSubprocess(vsock: Vsock, file: string, args: readonly string[] | undefined, opts: ExecOptions & {
  encoding: "buffer";
}): Promise<ExecResult<Uint8Array>>;
export declare function execSubprocess(vsock: Vsock, file: string, args?: readonly string[], opts?: ExecOptions): Promise<ExecResult<string | Uint8Array>>;
/** What connectGuest() takes. */
export interface ConnectOptions {
  /** How long to wait, in ms: for the guest server (connect retries), its TCP connect and the handshake together. Default 30000. */
  timeout?: number;
  /** Aborts connecting (PtyError ABORTED). It has no effect once connected: cancel `readable` or call close(). */
  signal?: AbortSignal;
  /** The guest server's (kwtty's) vsock port. Default TTY_PORT (1022). */
  ttyPort?: number;
}
/**
 * A raw byte stream to a TCP server in the guest (connectGuest()). It has
 * the shape of a ByteDuplex (http.ts), so fetchOver() can use it.
 */
export interface GuestSocket extends AsyncDisposable {
  /** The guest's TCP port. */
  readonly port: number;
  /**
   * What the server sends. A pull stream: vsock credit follows what is
   * read. It ends when the server shuts down its sending side (or
   * closes), and errors with a VsockError on a reset. Cancelling it tells
   * the guest the host no longer reads, which ends the connection.
   */
  readonly readable: ReadableStream<Uint8Array>;
  /**
   * Bytes for the server; a write resolves once its bytes are sent.
   * close() is a half-close: the server reads EOF and may still send.
   * abort() resets the connection.
   */
  readonly writable: WritableStream<Uint8Array>;
  /** Close both ways (what was written is still sent; what was not read is dropped). Resolves once the connection is gone. */
  close(): Promise<void>;
  /** Settles once the connection is gone: "closed" (both sides shut down) or "reset". */
  readonly closed: Promise<"closed" | "reset">;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/**
 * Connect to TCP `port` on the guest's 127.0.0.1 through the guest's kwtty
 * server (CONNECT; retrying while kwtty is not up yet). The guest connects
 * before it answers, so the promise resolves with a connected GuestSocket,
 * or rejects with a PtyError: ECONNREFUSED (nothing listens on the port),
 * EREMOTE (another connect error, with the guest's message, or a guest
 * without CONNECT), ETIMEDOUT, ABORTED, ECONNRESET, ECONNABORTED, EPROTO;
 * a RangeError for a port outside 1 to 65535.
 */
export declare function connectGuest(vsock: Vsock, port: number, opts?: ConnectOptions): Promise<GuestSocket>;
/** One buffer of a descriptor chain: kernel memory at `addr`, `len` bytes. */
interface VirtqBuffer {
  addr: number;
  len: number;
}
/** A descriptor chain the driver made available: what the device reads, then what it writes. */
interface VirtqChain {
  /** The head descriptor's index, which identifies the chain in the used ring. */
  head: number;
  readable: VirtqBuffer[];
  writable: VirtqBuffer[];
  /** Bytes the device may write. */
  writableLen: number;
}
/** What a snapshot keeps of a queue: where its rings are and how far the device got. */
interface VirtqSnapshot {
  num: number;
  desc: number;
  avail: number;
  used: number;
  lastAvail: number;
}
/** A device's transport state at a snapshot point. */
interface VirtioTransportSnapshot {
  status: number;
  features: string;
  isr: number;
  queues: Array<VirtqSnapshot | null>;
}
/**
 * A split virtqueue in kernel memory. The device pops chains and pushes
 * them back to the used ring; the transport raises the interrupt.
 */
declare class Virtqueue {
  #private;
  readonly index: number;
  readonly num: number;
  readonly desc: number;
  readonly avail: number;
  readonly used: number;
  /** The next available-ring slot the device has not taken. */
  lastAvail: number;
  /**
   * False once the driver reset the device or took the queue down: its
   * rings may be freed memory now, so pop() and push() do nothing (a
   * late asynchronous completion is dropped).
   */
  alive: boolean;
  constructor(index: number, num: number, desc: number, avail: number, used: number, mem: () => WebAssembly.Memory, onPush: (q: Virtqueue) => void);
  /** Chains made available and not popped yet. */
  pending(): number;
  /** The driver asked for no used-buffer interrupts (virtqueue_disable_cb). */
  noInterrupt(): boolean;
  /** Take the next available chain, or null. Throws on a malformed chain (the device is then broken). */
  pop(): VirtqChain | null;
  /** Copy of the chain's readable bytes (at most `max`). */
  read(chain: VirtqChain, max?: number): Uint8Array;
  /** Write `data` into the chain's writable buffers; returns the bytes written. */
  write(chain: VirtqChain, data: Uint8Array): number;
  /** Return the chain to the driver with `len` bytes written, and tell the transport. */
  push(chain: VirtqChain, len: number): void;
  saveState(): VirtqSnapshot;
}
/**
 * A device model behind the transport. The transport owns the status, the
 * features and the queues; the model answers the config space and serves
 * its queues.
 */
interface VirtioDeviceModel {
  /** Virtio device ID (16: GPU). */
  readonly deviceId: number;
  /** Device feature bits (VIRTIO_F_VERSION_1 is added by the transport). */
  features(): bigint;
  /** Largest size of each queue; the queue count is the length. */
  readonly queueSizes: readonly number[];
  /** The config space (read at call time; little endian). */
  config(): Uint8Array;
  /** The driver wrote `data` at `offset` of the config space. */
  configWrite?(offset: number, data: Uint8Array): void;
  /** The driver accepted these features (before FEATURES_OK). */
  setFeatures?(features: bigint): void;
  /** The driver set DRIVER_OK: the queues are live. */
  ready?(queues: ReadonlyArray<Virtqueue | null>): void;
  /** Reset (status 0) or the queues went away: forget everything the driver told. */
  reset(): void;
  /** Queue `q` has new available chains (the notify import; never suspend). */
  notify(q: Virtqueue): void;
  /** Why a snapshot cannot be taken now (resources the host would lose), or "". */
  blocker?(): string;
  /** The part of blocker() that lasts while a guest program runs (not commands in flight), or "". */
  held?(): string;
}
interface VirtioHostOptions {
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Raise WASM_IRQ_VIRTIO. */
  raise: () => void;
  log?: (msg: string) => void;
}
interface VirtioStats {
  notifies: number;
  pushes: number;
  interrupts: number;
}
/** The transport: the imports, each device's status, features, queues and interrupt status. */
declare class VirtioHost {
  #private;
  /** The kernel asked for device 0 (it has kwvirtio). */
  probed: boolean;
  stats: VirtioStats;
  constructor(opts: VirtioHostOptions);
  /** Add a device; its number is the order of addition. Only before the kernel probes. */
  add(model: VirtioDeviceModel): number;
  get enabled(): boolean;
  /** The model's configuration changed: tell the driver (config interrupt). */
  configChanged(model: VirtioDeviceModel): void;
  imports(): Record<string, unknown>;
  /** Why a snapshot cannot be taken now, or "". */
  blocker(): string;
  /** State only the host holds while a guest program runs (VirtioGpu.held()): a snapshot is refused before the guest parks. */
  held(): string;
  /** Each device's transport state (the models keep nothing a snapshot needs while blocker() is ""). */
  saveState(): VirtioTransportSnapshot[];
  /** A restored snapshot: the kernel does not set its queues up again. */
  restoreState(s: VirtioTransportSnapshot[]): void;
}
/**
 * The host side of each device the machine had. A key is present when the
 * device was configured; its value is null if the kernel had not started
 * its driver yet (it then starts it after the restore, as at boot).
 */
export interface DeviceSnapshots {
  display?: DisplaySnapshot | null;
  input?: InputSnapshot | null;
  sound?: SoundSnapshot | null;
  vsock?: VsockSnapshot | null;
  shm?: ShmSnapshot | null;
  /** The MAC the guest's kwnet got. */
  network?: {
    mac: number[];
  } | null;
  /**
   * virtio-gpu (kwvirtio): the transport's state. A snapshot is refused
   * while the device holds resources or commands (virtio-gpu.ts), so the
   * model itself has nothing to keep.
   */
  gpu?: {
    transport: VirtioTransportSnapshot[];
  } | null;
}
/** The devices of DeviceSnapshots that a restore must find configured, or not, as saved. */
export type DeviceKind = "display" | "sound" | "vsock" | "shm" | "network" | "gpu";
/** A saved machine (Kernel.snapshot()). */
export interface KernelSnapshot {
  version: 1;
  /** The kernel build it came from (Kernel.fingerprint); restore refuses another. */
  fingerprint: string;
  /**
   * CPUs the machine had (absent: 1, as in snapshots from before SMP
   * ones). A restore needs the same number: each task is held on its CPU.
   */
  cpus?: number;
  memory64: boolean;
  /**
   * All of the kernel's memory; the pages it reported free are zero. One of
   * 2 GiB or more is on a SharedArrayBuffer where there is one.
   */
  memory: Uint8Array;
  /** Bytes of free pages left out of `memory` (0 if the kernel reported none). */
  freeBytes?: number;
  /** The guest's monotonic clock at the snapshot, in ms; a restore continues from it. */
  monotonicMs: number;
  /** rows << 16 | cols, 0 = unknown. */
  consoleSize: number;
  /** Console input the guest had not read yet. */
  input: Uint8Array;
  /** The disks, in order (/dev/wda, wdb, ...); a restore needs the same ones, unchanged. */
  disks: DiskSnapshotState[];
  /** The other devices (empty in snapshots from before devices were saved). */
  devices: DeviceSnapshots;
  /**
   * The detachable terminal sessions (PtyOptions.detachable) the host had
   * open at the snapshot point; attach() each in the restored machine
   * within its detachTimeout. Absent when there were none (and in
   * snapshots from before them).
   */
  ttys?: TtySessionSnapshot[];
}
/**
 * Options of snapshot() (Kernel, KernelInstance, WorkerKernel).
 *
 * `commit` saves a machine without the risk of `stop: true`, whose stop
 * comes before the caller has stored the snapshot (a failed store then loses
 * the machine). The kernel waits at its consistent point (every task parked,
 * on SMP every other CPU held) while the host makes the disks durable and
 * then runs `commit(snapshot, signal)`, which stores the snapshot. Resolved:
 * the kernel stops there (exit kind "stopped", as with `stop`), and
 * snapshot() resolves. Rejected, or still pending after `commitTimeoutMs` of
 * awake time (awakeTimeout(): a frozen page does not count), or a disk that
 * did not become durable: the kernel goes on as after a snapshot without
 * `stop`, and snapshot() rejects with a SnapshotCommitError. `signal` aborts
 * when the snapshot is given up (the timeout, or the kernel ended); a commit
 * that stored something should then remove it, since the machine runs on
 * past it. Implies `stop`. In worker mode `commit` and `hold` run on the
 * owner's thread with the memory transferred there.
 *
 * `hold` (with `commit`) decides after a successful commit instead of the
 * stop: the kernel stays at its consistent point, the snapshot stored,
 * until the value `hold(snapshot, signal)` returns settles. "continue": the
 * kernel goes on as after a snapshot without `stop` (the stored snapshot is
 * then stale: remove it, since the guest writes its disks again); "stop" (or
 * anything else, a rejection too: the stored snapshot is safe to resume):
 * it stops there, as without `hold`. No timeout applies: the caller bounds
 * the hold. snapshot() resolves with the snapshot once it ends, also when
 * the kernel ended meanwhile (stop(), a worker that died: `signal` aborts
 * then; the snapshot was stored and the kernel never ran past it).
 *
 * Time: nothing runs in the guest while it waits, and when it goes on (a
 * failed commit, or a hold's "continue") its clocks have advanced by the
 * wait, as for a virtual machine paused by its hypervisor: its monotonic
 * clock (the host's) jumps by it, timers that expired meanwhile fire, and
 * its wall clock stays the host's. Should the host's monotonic clock have
 * fallen behind its wall clock over the wait (it may stop while a device
 * sleeps), the guest's monotonic clock is advanced by the difference, so
 * its wall clock stays right. A restore instead continues the monotonic
 * clock from the saved value and steps the wall clock (kernel/parking.md).
 */
export interface SnapshotOptions {
  /** Stop the kernel right after the copy (no task runs after it). */
  stop?: boolean;
  /** Store the snapshot before the kernel is given up (above). */
  commit?: (snapshot: KernelSnapshot, signal: AbortSignal) => unknown;
  /** How long `commit` may take, in ms of awake time (default SNAPSHOT_COMMIT_TIMEOUT_MS). */
  commitTimeoutMs?: number;
  /** After a successful commit: keep the kernel at its consistent point until this decides (above). */
  hold?: (snapshot: KernelSnapshot, signal: AbortSignal) => SnapshotHoldDecision | PromiseLike<SnapshotHoldDecision>;
  /**
   * Have the guest write back its dirty file data and drop its clean file
   * cache (page cache, unused dentries and inodes) on the way to the
   * snapshot, so that the cache is not saved: the pages are free then and
   * left out. The guest reads the files again when it next needs them.
   * Default: true with `stop` or `commit` (a snapshot the machine stops
   * at), false for one it runs on from. A kernel that cannot ignores it.
   */
  dropCaches?: boolean;
}
/** How a snapshot({ commit, hold }) hold ends: the kernel goes on, or stops at the snapshot. */
export type SnapshotHoldDecision = "stop" | "continue";
/**
 * The host's wall clock ran ahead of its monotonic clock by this much over
 * a hold (ms) before the guest's monotonic clock is advanced to match (a
 * device that slept; smaller differences are clock noise and NTP slewing).
 */
export declare const HOLD_CLOCK_LAG_MS = 1000;
/** snapshot({ commit })'s default commitTimeoutMs. */
export declare const SNAPSHOT_COMMIT_TIMEOUT_MS = 30000;
/**
 * snapshot({ commit }) gave the snapshot up after the copy (the commit
 * rejected or timed out, or a disk did not become durable): the kernel runs
 * on, unless it ended meanwhile for another reason.
 */
export declare class SnapshotCommitError extends Error {
  /** The commit took longer than commitTimeoutMs. */
  readonly timedOut: boolean;
  constructor(message: string, opts?: {
    timedOut?: boolean;
    cause?: unknown;
  });
}
/**
 * Why a machine with the devices `present` (and the network MAC `mac`, if
 * set) cannot resume `saved`, or null if it can: the restored kernel has
 * exactly the drivers it had, so each device must be configured, or not,
 * as it was.
 */
export declare function snapshotDeviceMismatch(saved: DeviceSnapshots, present: Record<DeviceKind, boolean>, mac?: Uint8Array): string | null;
/**
 * Why a machine with `cpus` CPUs cannot resume `saved`, or null if it can:
 * a task stays on the CPU it ran on (kernel/smp.md), so a restore needs
 * every CPU the snapshot had, and no more (an SMP kernel never starts CPUs
 * after its boot).
 */
export declare function snapshotCpuMismatch(saved: KernelSnapshot, cpus: number): string | null;
/**
 * Why `disks` cannot resume `saved` (a snapshot's disks), or null if they
 * can: the same number of disks, each with the same identity, write
 * generation and stamp. A disk that changed after the snapshot would not match the
 * restored kernel's caches (its file systems would be corrupted).
 */
export declare function snapshotDiskMismatch(saved: DiskSnapshotState[], disks: BlockDevice[]): string | null;
/**
 * Encode a snapshot: MAGIC, a u32 header length, the JSON header (everything
 * but the memory and the input), the input, then each non-zero 64 KiB chunk
 * of the memory as a u32 chunk index and its bytes. Little-endian. A header
 * without `cpus` (files from before SMP snapshots) decodes as one CPU.
 */
export declare function encodeSnapshot(s: KernelSnapshot): Uint8Array;
export declare function decodeSnapshot(bytes: Uint8Array): KernelSnapshot;
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** What a backend is given besides a command. */
interface GpuBackendContext {
  /** The kernel's memory (read at call time; a backend on another thread gets copies). */
  memory(): WebAssembly.Memory;
  /** The backing pages of a resource the 2D model created, or null. */
  backing(resourceId: number): readonly VirtqBuffer[] | null;
}
/**
 * The 3D side: a renderer such as virglrenderer (gl-gpu.ts). The device
 * hands it every command the 2D model does not handle (GET_CAPSET_INFO and
 * GET_CAPSET included), as a copy, header first, and writes back what it
 * answers (header first; the device fills in the fence fields of the
 * request). Null answers ERR_UNSPEC. A promise answers later (see the file
 * header for the ordering).
 */
interface GpuBackend {
  /** Feature bits added to the device's (VIRTIO_GPU_F_VIRGL, _CONTEXT_INIT, _RESOURCE_BLOB). */
  readonly features: bigint;
  /** num_capsets in the config space, read when the driver probes; the capsets themselves come through command(). */
  readonly capsetCount: number;
  command(cmd: Uint8Array, ctx: GpuBackendContext): Uint8Array | null | Promise<Uint8Array | null>;
  /** The size of a resource the backend created (SET_SCANOUT of it), or null. */
  resource(id: number): {
    width: number;
    height: number;
  } | null;
  /** The driver reset the device: forget every context and resource. */
  reset?(): void;
  /** Why a snapshot cannot be taken now (state only the renderer holds), or "". */
  blocker?(): string;
}
/** Where the picture goes: DisplayHost. */
interface GpuDisplay {
  /** The size the host wants (GET_DISPLAY_INFO, GET_EDID). */
  wantedSize(): DisplaySize;
  /** Show this picture instead of kwfb's, or kwfb's again (null). */
  setScanout(src: DisplaySource | null): void;
}
interface VirtioGpuOptions {
  memory: () => WebAssembly.Memory;
  display: GpuDisplay;
  backend?: GpuBackend;
  /** A RESOURCE_FLUSH of the scanout's resource (the rectangle). */
  onFlush?: (rect: Rect) => void;
  log?: (msg: string) => void;
}
interface VirtioGpuStats {
  commands: number;
  errors: number;
  transfers: number;
  /** Bytes TRANSFER_TO_HOST_2D copied into host copies. */
  transferBytes: number;
  flushes: number;
  cursor: number;
  /** Commands handed to the backend. */
  backend: number;
}
declare class VirtioGpu implements VirtioDeviceModel {
  #private;
  readonly deviceId = 16;
  /** controlq, cursorq. */
  readonly queueSizes: readonly [256, 16];
  stats: VirtioGpuStats;
  constructor(opts: VirtioGpuOptions);
  features(): bigint;
  config(): Uint8Array;
  configWrite(offset: number, data: Uint8Array): void;
  /** Set by the owner (Kernel): tells the transport that the config changed. */
  set configNotifier(fn: (() => void) | null);
  /**
   * The host's display size may have changed (DisplayHost.wantedSize()):
   * when it differs from the size the driver last read, set
   * VIRTIO_GPU_EVENT_DISPLAY in events_read and raise a config interrupt.
   * The driver then asks for the EDID and the display info again and sends
   * a hotplug uevent; a KMS client that probes the connector finds the new
   * preferred mode and sets it if it wants (the display follows the mode
   * set, not this size). Before the driver has read a size nothing is
   * raised (it reads one when it probes); `force` raises it anyway (after
   * a restore, where the size the snapshot's driver read is not known).
   * True when raised.
   */
  displayChanged(force?: boolean): boolean;
  /** The display size the driver last read (GET_DISPLAY_INFO), or null before it has. */
  get displaySize(): DisplaySize | null;
  reset(): void;
  blocker(): string;
  /**
   * State that only the host holds and a snapshot cannot save, which lasts
   * while the program that made it runs ("virtio-gpu resources", the 2D
   * model's or the backend's, "virtio-gpu contexts"), or "" (commands in
   * flight are blocker()'s too, but pass).
   */
  held(): string;
  /** Resources the 2D model holds (for tests and stats). */
  get resourceCount(): number;
  /** The scanout's mode, or null while nothing is scanned out. */
  get scanoutMode(): DisplayMode | null;
  notify(q: Virtqueue): void;
}
type Fd = {
  type: "stdin" | "stdout" | "stderr";
} | {
  type: "dir";
  name: Uint8Array;
  files: Map<string, Uint8Array>;
} | {
  type: "file";
  data: Uint8Array;
  pos: number;
};
interface Subscription {
  userdata: bigint;
  tag: number;
  clock?: number;
  deadline?: bigint;
  fd?: number;
}
interface PollEvent {
  userdata: bigint;
  type: number;
  error: number;
  nbytes: bigint;
}
interface WasiHostOptions {
  /** Program arguments (argv[0] first). */
  args: string[];
  /** Read-only files of the preopened "/". */
  files?: Record<string, Uint8Array>;
}
declare class WasiHost {
  k: Kernel;
  args: Uint8Array[];
  /** The last 4 KiB written to stderr (the panic message). */
  stderr: string;
  fds: Map<number, Fd>;
  buf: ArrayBuffer | null;
  dvCache: DataView | null;
  u8Cache: Uint8Array<ArrayBuffer> | null;
  /**
   * Added to performance.now() for the guest's monotonic clock (ms): a
   * restored snapshot continues from the value it was saved at.
   */
  monoOffset: number;
  /**
   * @param k  console input/output, idle wake-ups, exit
   */
  constructor(k: Kernel, { args, files }: WasiHostOptions);
  /** The guest's monotonic clock (ms). */
  monotonicMs(): number;
  clockNs(id: number): bigint;
  /** Views of the kernel's memory, rebuilt only if it grew (the old buffer is then detached). */
  views(): void;
  dv(): DataView;
  u8(): Uint8Array<ArrayBuffer>;
  /** [ptr, len] pairs of an iovec array. */
  iovecs(iovs: number, n: number): Array<[number, number]>;
  /** Bytes of console input queued in the kernel object. */
  stdinQueued(): number;
  readStdin(dst: number, want: number): number;
  /** The poll_oneoff subscriptions at `inp`. */
  subscriptions(inp: number, n: number): Subscription[];
  /** Events for the subscriptions that are ready now. */
  ready(subs: Subscription[]): PollEvent[];
  writeEvents(out: number, nevents: number, events: PollEvent[]): void;
  exit(code: number): void;
  imports(): Record<string, unknown>;
}
/**
 * The host asks the kernel to sync (ksys_sync(): write back and flush every
 * file system; WASM_IRQ_SYNC). The kernel clears the bit when it takes the
 * request.
 */
export declare const IRQ_SYNC = 4;
/** A snapshot() waiting for the kernel's consistent point. */
interface SnapshotWaiter {
  resolve: (s: KernelSnapshot) => void;
  reject: (e: Error) => void;
  stop: boolean;
  commit?: SnapshotOptions["commit"];
  commitTimeoutMs: number;
  hold?: SnapshotOptions["hold"];
}
/**
 * How a kernel run ended: "halt" (orderly power-off/reboot: code 0 power
 * off, 1 halt, 2 restart), "panic" (code 253), "trap" (a wasm trap or JS
 * exception inside the kernel, code 254, `error` holds it), "fatal" (a host
 * runtime invariant broke, code 255) or "stopped" (Kernel.stop()).
 */
export type ExitKind = "halt" | "panic" | "trap" | "fatal" | "stopped";
export interface ExitResult {
  code: number;
  reason: string;
  kind: ExitKind;
  error?: unknown;
}
/**
 * The host side of the kwnet device, e.g. a NetStack (net.ts). Frames for
 * the guest go through Kernel.receiveFrame().
 */
export interface NetDevice {
  /** The guest's MAC address (6 bytes). */
  mac?: Uint8Array;
  /** Called once when the guest's driver initialises. */
  attach?(kernel: Kernel): void;
  /** An Ethernet frame from the guest. */
  send(frame: Uint8Array): void;
  /** Release host resources (connections, sockets). */
  close?(): void;
}
/** Detail of the "memory" boot stage. */
export interface MemoryStage {
  mib: number;
  requestedMiB: number;
  failures: string[];
  memory64: boolean;
}
export type BootStage = "memory" | "instantiate" | "start" | "exit";
export interface KernelStats {
  switches: number;
  idles: number;
  yields: number;
}
export interface KernelConfig {
  /** Compiled vmlinux (wasm64) or vmlinux32.wasm (lowered), or a bundle of either. */
  module: WebAssembly.Module;
  /** Memory type to import; default: moduleIsMemory64(module). */
  memory64?: boolean;
  /** Default 2048. */
  memoryMiB?: number;
  /** Default: the module's bundled one (bundledBoot), else "". */
  cmdline?: string;
  /** Default (undefined): the module's bundled initramfs, if any; null boots without one. */
  initrd?: Uint8Array | null;
  /** Smaller sizes to try, in order, if allocating memoryMiB fails (e.g. a phone without the address space). */
  memoryFallbackMiB?: number[];
  /** Console output. */
  write: (bytes: Uint8Array) => void;
  /** Host diagnostics; default console.error. */
  log?: (msg: string) => void;
  /**
   * Boot progress: "memory" (MemoryStage), "instantiate", "start" (kernel
   * entry), "exit" (ExitResult).
   */
  onStage?: (stage: BootStage, detail?: MemoryStage | ExitResult) => void;
  /** kwblk disks: /dev/wda, wdb, ... */
  disks?: BlockDevice[];
  /** kwnet device; without one the guest has no network interface. */
  net?: NetDevice;
  /**
   * Offer a display (kwfb, /dev/fb0; display.ts): true (640x480), a size,
   * or a function returning the size wanted when a program first opens
   * it. Default false: the guest has no framebuffer device.
   */
  display?: DisplayOption;
  /** A guest program opened the display (its mode), or the last one closed it (null). */
  onDisplay?: (mode: DisplayMode | null) => void;
  /**
   * With a display, the guest also gets a keyboard and a mouse (kwinput,
   * evdev). Called when some program opens or the last one closes them.
   */
  onInput?: (state: InputState) => void;
  /** Offer a sound card (kwsnd: ALSA playback, sound.ts) and where its PCM goes. Default false: none. */
  sound?: SoundOption;
  /**
   * Offer a vsock device (kwvsock: AF_VSOCK, guest CID 3, host CID 2;
   * vsock.ts). Default false: the kernel registers no transport. The
   * guest's packets go to onVsockPacket; Kernel.vsock.deliver() sends.
   */
  vsock?: boolean;
  /** A packet from the guest's kwvsock (header and payload; a copy). */
  onVsockPacket?: (pkt: Uint8Array) => void;
  /** kwvsock started: the guest's CID and the largest packet it takes (header and payload). */
  onVsockInit?: (guestCid: number, rxMax: number) => void;
  /**
   * Offer kwshm (shm.ts): the host reads and writes guest shmem files in
   * place. Default false: the kernel registers nothing.
   */
  shm?: boolean;
  /**
   * Offer a virtio-gpu device (kwvirtio, virtio-gpu.ts): the guest's
   * /dev/dri/card0 (driver virtio_gpu, 2D KMS), whose scanout the display
   * shows instead of kwfb's pixels while one is set. Its size is the
   * display option's. Default false: no virtio device.
   */
  gpu?: boolean;
  /** The device's 3D side (gl-gpu.ts VirglGpuBackend), with `gpu`; without one it is 2D. */
  gpuBackend?: GpuBackend;
  /**
   * Offer kwemu's JIT tier (hot guest code compiled to WebAssembly; see
   * jit.ts). Default true; false makes kwemu interpret everything. A
   * kernel built without the tier ignores it.
   */
  jit?: boolean;
  /**
   * Resume this snapshot (snapshot()) instead of booting: same kernel
   * build, memory size and type, and as many CPUs (`cpus`, which an SMP
   * snapshot needs the platform to start). initrd and cmdline are ignored.
   * `disks` must be the snapshot's, unchanged (snapshotDiskMismatch);
   * boot() rejects otherwise.
   */
  restore?: KernelSnapshot;
  /**
   * CPUs to offer an SMP kernel (CONFIG_SMP), each one more instance of
   * the module in its own thread (spawnCpu). Default 1. A UP kernel
   * ignores it (with a log line). Each CPU's kwemu has its own JIT
   * tier (jit applies to all).
   */
  cpus?: number;
  /** Start a secondary CPU's thread (Platform.spawnCpu); without it an SMP kernel gets one CPU. */
  spawnCpu?: (init: CpuInit) => CpuEndpoint;
  /** Why spawnCpu cannot work on this thread (Platform.whyNoCpus), checked once; a reason gives an SMP kernel one CPU. */
  whyNoCpus?: () => string | undefined;
  /**
   * With more than one CPU: the console ring (console-ring.ts) another
   * thread reads (worker mode's owner), so `write` is not called for
   * console output. Without it this host reads a ring of its own and
   * calls `write`.
   */
  consoleRing?: SharedArrayBuffer;
  /**
   * When this host reads the ring: called after console output was
   * written from inside the kernel's clock import (the kernel runs on), so
   * that a host which batches `write` until the kernel suspends can send it
   * now (worker mode with the messages transport).
   */
  flushOutput?: () => void;
  /** Sample guest pcs (profile.ts): time samples need spawnSampler and a shared memory. */
  profile?: ProfileOptions;
  /** Start the time sampler's thread (Platform.spawnSampler). */
  spawnSampler?: (init: SamplerInit) => SamplerHandle;
}
/**
 * Does this kernel module import a 64-bit (memory64) memory?
 *
 * The kernel comes in two builds of the same code: vmlinux (wasm64:
 * memory64 + table64) and vmlinux32.wasm, the same module after Binaryen's
 * --memory64-lowering. The lowered one keeps i64 pointers in code and at the
 * JS boundary but has a 32-bit memory and table, so it runs on engines
 * without memory64 (WebKit). The JS API does not reflect an import's memory
 * type, so this reads the linker's "target_features" section (Binaryen drops
 * "memory64" from it when lowering). Without that section it guesses wasm64;
 * boot() retries with the other memory type if instantiation fails.
 */
export declare function moduleIsMemory64(module: WebAssembly.Module): boolean;
/**
 * The root file system, command line and data disk template bundled into
 * the module by kernel/tools/bundle.mjs (custom sections "unkernel.initrd",
 * "unkernel.cmdline" and "unkernel.datadisk"), or undefined for each that
 * is absent. datadisk is a gzipped kwsparse image (kwsparse.ts).
 */
export declare function bundledBoot(module: WebAssembly.Module): {
  initrd?: Uint8Array;
  cmdline?: string;
  datadisk?: Uint8Array;
};
type Resolver = (task: bigint) => void;
/**
 * A host side that cannot get the event loop while the kernel runs (worker
 * mode's shared transport, worker-shared.ts) and looks for its events in
 * the WASI clock instead, which the kernel reads at the end of every slice
 * and before it reads wasm_host_irqs. None of these may suspend.
 */
interface KernelPoller {
  /** Every monotonic clock_time_get: cheap when nothing is new. */
  poll(): void;
  /** poll_oneoff is about to wait: true if events arrived (handled; do not wait). */
  idle(): boolean;
  /** That wait ended. */
  awake(): void;
}
/**
 * One kernel instance. boot() resolves with an ExitResult when the kernel
 * halts, panics, traps, hits a host invariant or is stopped.
 */
export declare class Kernel {
  #private;
  opts: KernelConfig;
  log: (msg: string) => void;
  /** Pending console input chunks. */
  input: Uint8Array[];
  inputOffset: number;
  /** rows << 16 | cols, 0 = unknown (setConsoleSize). */
  consoleSize: number;
  /** resolve() of the current wasm_idle promise. */
  idleWake: (() => void) | null;
  /** task -> resolve(lastTask) */
  resumers: Map<bigint, Resolver>;
  onStage: (stage: BootStage, detail?: MemoryStage | ExitResult) => void;
  /** Settles with the first exit (halt, panic, trap, fatal, stop). */
  exited: Promise<ExitResult>;
  /** Record the exit (the first one wins). */
  exit: (res: ExitResult) => void;
  /** The exit, once there is one. */
  result: ExitResult | undefined;
  stats: KernelStats;
  block: BlockHost;
  /** kwemu's JIT host (kw_host_jit_* imports); counters in jit.stats. */
  jit: JitHost;
  netRx: Uint8Array[];
  /** kwfb's host side: where the guest's pixels are, if anywhere. */
  display: DisplayHost;
  /** kwinput's host side (evdev keyboard and mouse): the event queue and whether a program reads it. */
  evdev: InputHost;
  /** kwsnd's host side (sound.ts): the playback state and the sink. */
  sound: SoundHost;
  /** kwvsock's host side (vsock.ts): the packet queues; the protocol is VsockHost's. */
  vsock: VsockDevice;
  /** kwshm's host side (shm.ts): requests, page lists and copies; the API is ShmClient's. */
  shm: ShmDevice;
  /** kwvirtio's host side (virtio.ts): the transport and its queues. */
  virtio: VirtioHost;
  /** The virtio-gpu device model (gpu option), else undefined. */
  gpu: VirtioGpu | undefined;
  memory: WebAssembly.Memory;
  memory64: boolean;
  /** The module imports a shared memory (a kernel linked with --shared-memory). */
  sharedMemory: boolean;
  wasi: WasiHost;
  exports: WebAssembly.Exports | undefined;
  /** Address of wasm_host_irqs, once instantiated. */
  irqAddr: number | undefined;
  retFromFork: (prev: bigint, next: bigint) => Promise<unknown>;
  /** performance.now() at kernel entry. */
  bootTime: number;
  /** Polled from the clock import, if set (KernelPoller). */
  poller: KernelPoller | null;
  /** The kernel build: its linux_banner (compile time and build number), once instantiated. */
  fingerprint: string;
  /** The MAC kwnet got (wasm_driver_net_init), once the guest's driver started; null before or without a network. */
  netMac: Uint8Array | null;
  /** The snapshot() in progress, until its consistent point. */
  snapshotWaiter: SnapshotWaiter | null;
  /** snapshot({ commit }): the kernel waits at its consistent point for the commit (and a hold). */
  snapshotHeld: boolean;
  /** While snapshotHeld: settles once the sealed disks are durable (true) or failed (false); sync() answers with it. */
  heldDurable: Promise<boolean> | null;
  /**
   * The guest's monotonic clock for the other CPUs' threads: [0] is
   * CpuInit.epochMs (performance.timeOrigin - WasiHost.monoOffset), on a
   * SharedArrayBuffer, so advanceClock() reaches them. Made with the first CPU thread.
   */
  clockEpoch: Float64Array | null;
  /** The host's wall clock as holdForCommit() reads it (ms; a test may stand in a clock of its own). */
  wallClock: () => number;
  /** Called with each snapshot at its consistent point, before commit or resolve: adds the host's own state (KernelInstance: `ttys`). */
  onSnapshot: ((snap: KernelSnapshot) => void) | undefined;
  /** CPUs offered to the kernel (1 unless an SMP kernel and KernelConfig.cpus > 1). */
  cpus: number;
  /** The other CPUs' threads, once started. */
  secondaries: CpuEndpoint[];
  /** Their JIT hosts' counters (CpuInit.jitMirror), in the order they started. */
  jitMirrors: Float64Array[];
  /** With more than one CPU: the console ring every CPU writes (console-ring.ts). */
  conRing: ConsoleRing | null;
  /** What a full ring makes a CPU do: "wait" when another thread reads it, else this host reads it. */
  conFull: ConsoleFull;
  /** This host reads the ring (no KernelConfig.consoleRing): batches in order (cpu.ts). */
  conReader: ConsoleRingReader | null;
  consoleOrder: ConsoleOrder | null;
  /** Ring bytes dropped that were reported. */
  conDropped: number;
  /** Guest pc sampling (KernelConfig.profile), once attached to the instance. */
  profiler: Profiler | null;
  constructor(opts: KernelConfig);
  /** Queue an Ethernet frame for the guest's kwnet device. */
  receiveFrame(frame: Uint8Array): void;
  /** Set a host IRQ bit in wasm_host_irqs (once instantiated) and wake the kernel. */
  raiseIrq(bit: number): void;
  /**
   * OR `bits` into wasm_host_irqs (once instantiated); with a shared
   * memory atomically, since other CPUs set IPI bits there too.
   */
  setIrqBits(bits: number): void;
  /** Clear `bits` in wasm_host_irqs, as setIrqBits() sets them. */
  clearIrqBits(bits: number): void;
  /**
   * With other CPUs running, an idle wait also ends when wasm_host_irqs
   * changes from 0 (an IPI: the sender notifies). Calls `done` once that
   * happens, at once if it already did, or after `timeoutMs`.
   */
  watchIrqWord(done: () => void, timeoutMs: number): void;
  /** JIT counters per CPU (CPU 0 first; the others as their hosts last mirrored them). */
  jitStatsPerCpu(): JitStats[];
  /** All CPUs' JIT counters together. */
  jitStatsAll(): JitStats;
  /** kwemu's counters per CPU (-Dkwemu-stats kernels; undefined for a CPU that has compiled nothing). */
  kwemuStatsPerCpu(): (KwemuStats | undefined)[];
  /** clockEpoch, made on first use (a CPU thread). */
  sharedClock(): Float64Array;
  /**
   * Move the guest's monotonic clock forward by `ms` on every CPU (never
   * back: the guest's clocks must not run backwards). Only while the guest
   * cannot read it mid-change: at a snapshot point, where every task is
   * parked and every other CPU held (holdForCommit()).
   */
  advanceClock(ms: number): void;
  /** wasm_cpu_start(cpu, idle): start a secondary CPU's thread. */
  startCpu(cpu: number, idle: bigint): number;
  /**
   * Console output of CPU 0 (fd_write 1): mem[p, p + len). With other
   * CPUs, into the ring, behind what they wrote before. Where this host
   * reads the ring, its write goes out at once as on one CPU: directly
   * when nothing another CPU wrote waits (the ring is empty and no batch
   * is on its way: a write that reserves after this look overlaps this
   * one), else through the ring, which it then empties.
   */
  consoleWrite(mem: Uint8Array, p: number, len: number): void;
  /**
   * More than one CPU: set up the console ring. Read by another thread
   * (KernelConfig.consoleRing): CPU 0 waits like the others when it is
   * full. Read here: a reader loop for the idle times, a take after each
   * of CPU 0's writes, and one in every clock read (the poller) at most
   * every POLL_MS unless the ring fills; CPU 0 also takes the records out
   * itself when it is full.
   */
  initConsoleRing(): void;
  /** A batch this host took out of the ring (or one another CPU posted, "out"): in order. */
  conDeliver: (b: {
    seq: number;
    bytes: Uint8Array;
  }) => void;
  /** At exit (`end`) or before a suspension: take what the ring holds (when this host reads it). */
  consoleFlush(end?: boolean): void;
  onCpuMessage(m: CpuMessage): void;
  netImports(): Record<string, unknown>;
  u8(): Uint8Array;
  dv(): DataView;
  cstr(ptr: number | bigint, max?: number): string;
  fatal(msg: string): void;
  /**
   * Stop the kernel for good. The exit is recorded at once (exited
   * settles with it); the kernel itself parks at its next suspension
   * point (an idle wait, a periodic yield or a task switch, at most about
   * 20 ms of guest work away) and never runs again. There is no clean
   * shutdown: the guest is not told, so unflushed disk writes are lost.
   */
  stop(res?: Partial<ExitResult>): void;
  /** Feed console input (bytes or string). */
  sendInput(data: Uint8Array | string): void;
  /**
   * Set the console window size (the guest tty's rows and columns). hvc_wasm
   * picks it up on its next input poll, which the console IRQ triggers;
   * the foreground process gets SIGWINCH.
   */
  setConsoleSize(cols: number, rows: number): void;
  /**
   * Ask the kernel to sync (IRQ_SYNC) and wait until every persistent disk
   * (BlockDevice.persistent, with flushSeq and whenFlushed) has completed a
   * flush issued after this call, i.e. one whose save started after it.
   * Resolves true then, or false after `timeout` ms; on a timeout the bit
   * is cleared here, since a kernel without IRQ_SYNC support never clears
   * it. Resolves true at once when no disk is persistent.
   */
  requestSync({ timeout }?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine: the kernel parks every task (arch/wasm/kernel/
   * park.c) and, at the point where all its state is in memory, the host
   * copies the memory and seals the disks (BlockDevice.snapshotSeal: their
   * content becomes durable and the snapshot records their identity and
   * write generation; disks are not copied). Resolves once the disks are
   * durable. Without `stop` the guest keeps running, and its next write
   * to a disk makes the snapshot unrestorable with that disk (a restore
   * refuses it); with `stop: true` the kernel never runs again after the
   * copy (exit kind "stopped"), so the disks stay as saved. Rejects if a
   * task does not park within 2 s (the error names it), if I/O is in
   * flight, if a disk cannot be part of a snapshot (one without
   * snapshotSeal, or an overlay kept only in memory that was written), or
   * if shm requests are waiting for the kernel. The other devices keep
   * their host side's state (DeviceSnapshots); vsock connections and the
   * network's TCP connections do not survive a restore (the guest's get
   * reset), except the 9p sessions of host file systems, which the vsock
   * device saves (VsockDevice.onSave; a request in flight on one makes
   * the snapshot point busy, VsockDevice.blocker()). An SMP kernel's
   * snapshot records its CPU count (KernelSnapshot.cpus); a restore needs
   * as many, each task resuming on the CPU it ran on. With `commit`
   * (SnapshotOptions) the kernel waits at the consistent point until the
   * caller has stored the snapshot, and stops only then (with `hold`, or
   * waits on for the caller's decision); a failed commit lets it go on
   * (SnapshotCommitError).
   */
  snapshot({ stop, commit, commitTimeoutMs, hold, dropCaches }?: SnapshotOptions): Promise<KernelSnapshot>;
  /** Put a snapshot into the fresh instance's memory (boot(), KernelConfig.restore). */
  loadSnapshot(s: KernelSnapshot): void;
  /** Which devices this machine has, as a snapshot records them (DeviceSnapshots keys). */
  devicesPresent(): Record<"display" | "sound" | "vsock" | "shm" | "network" | "gpu", boolean>;
  /** The host side of each configured device, at the snapshot point (null: its driver had not started). */
  saveDevices(): DeviceSnapshots;
  /**
   * Give each device's host side the state the kernel told the old one
   * (loadSnapshot, after the memory is in and the IRQ bits are cleared);
   * the restored kernel does not tell it again.
   */
  restoreDevices(d: DeviceSnapshots): void;
  /**
   * wasm_snapshot_point: the end of a snapshot cycle (see snapshot()). A
   * JSPI suspending import: a promise (snapshot({ commit })) keeps the
   * kernel at its consistent point until it settles.
   */
  snapshotPoint(result: number, blocker: bigint, freeMap?: bigint, freeBits?: bigint): number | Promise<number>;
  /**
   * snapshot({ commit }) at the consistent point: wait (the import's
   * promise) for the disks to become durable and then for the commit.
   * Committed: stop here for good (the promise never settles, so nothing
   * runs after the copy, and on SMP the held CPUs stay held until their
   * threads end), or with `hold` wait on for its decision and stop or go
   * on then. Not committed (it rejected, timed out, or a disk failed):
   * answer 0, and the kernel resumes every task as after a snapshot without
   * stop. Host events meanwhile (frames, input, vsock packets, sync
   * requests) only queue or set IRQ bits, as while the kernel is busy.
   */
  holdForCommit(w: SnapshotWaiter, snap: KernelSnapshot, durable: Promise<void>[]): Promise<number>;
  wake(): void;
  imports(): WebAssembly.Imports;
  onTrap(e: unknown): void;
  /** A fixed-size memory of `pages` 64 KiB pages, 64-bit (BigInt sizes) or 32-bit, shared or not. */
  static newMemory(pages: number, memory64: boolean, shared?: boolean): WebAssembly.Memory;
  /**
   * Allocate the kernel's memory (fixed size: the kernel sizes RAM from it
   * once at boot). Tries memoryMiB, then each of opts.memoryFallbackMiB.
   * The maximum equals the initial size so engines reserve no more address
   * space than needed.
   */
  allocateMemory(memoryMiB: number, initrdBytes: number): WebAssembly.Memory;
  /**
   * Instantiate and boot. Resolves with the ExitResult when the kernel
   * halts; rejects if it cannot start (memory, instantiation, initrd size).
   */
  boot(): Promise<ExitResult>;
}
export declare const KWSPARSE_MAGIC = "KWSPARS1";
/** A decoded kwsparse image: indices[i] is the disk block whose content is block(i). */
export interface KwsparseImage {
  size: number;
  blockSize: number;
  indices: number[];
  /** The block data, all blocks back to back. */
  data: Uint8Array;
  block(i: number): Uint8Array;
  /** Block index -> data (views into `data`). */
  map(): Map<number, Uint8Array>;
}
/** All bytes zero? */
export declare function isZeroBlock(b: Uint8Array): boolean;
/** The header of a kwsparse image holding the given block indices (ascending). */
export declare function kwsparseHeader(size: number, blockSize: number, indices: readonly number[]): Uint8Array;
/**
 * Encode blocks into one (uncompressed) kwsparse image. `blocks` are
 * [index, data] pairs in any order; all-zero blocks are dropped.
 */
export declare function encodeKwsparse({ size, blockSize, blocks }: {
  size: number;
  blockSize?: number;
  blocks: Iterable<[number, Uint8Array]>;
}): Uint8Array;
/** Parse an uncompressed kwsparse image (see gunzipIfNeeded). The result views `bytes`. */
export declare function decodeKwsparse(bytes: Uint8Array | ArrayBuffer): KwsparseImage;
/** Gunzip (DecompressionStream: browsers and Node) if the bytes are gzip. */
export declare function gunzipIfNeeded(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
/** Decode a kwsparse image, gzipped or not. */
export declare function readKwsparse(bytes: Uint8Array | ArrayBuffer): Promise<KwsparseImage>;
/**
 * gzip parts (e.g. CowDisk.exportParts()) with CompressionStream into a
 * Blob. The output is not byte-for-byte reproducible across engines; the
 * build tool uses zlib for that.
 */
export declare function gzipBlob(parts: BlobPart[]): Promise<Blob>;
export declare const F_RO = 1, F_FLUSH = 2, F_DISCARD = 4, F_WRITE_ZEROES = 8;
/** A result that is either ready now or arrives later. */
export type MaybePromise<T> = T | Promise<T>;
/**
 * A kwblk disk (/dev/wda, wdb, ... in the order given). Byte offsets and
 * sizes; `views` are subarrays of the kernel's memory to fill (read) or
 * take the data from (write). A method either completes synchronously or
 * returns a promise. It must not touch the views after that promise
 * settles.
 */
export interface BlockDevice {
  /** Size in bytes (a multiple of 512). */
  size: number;
  /** F_FLUSH | F_DISCARD | F_WRITE_ZEROES | F_RO. */
  flags?: number;
  readOnly?: boolean;
  /** Logical block size, default 512. */
  blockSize?: number;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  write(off: number, views: Uint8Array[]): MaybePromise<unknown>;
  flush?(): MaybePromise<unknown>;
  discard?(off: number, len: number): MaybePromise<unknown>;
  writeZeroes?(off: number, len: number): MaybePromise<unknown>;
  /**
   * Flushes reach storage that outlives the host process or page (a file,
   * IndexedDB). Kernel.requestSync() waits only for such disks, which must
   * also provide flushSeq and whenFlushed.
   */
  readonly persistent?: boolean;
  /** Number of flushes issued so far (see FlushTracker). */
  readonly flushSeq?: number;
  /** Resolves once a flush issued after the `after`-th one has completed successfully. */
  whenFlushed?(after: number): Promise<void>;
  /** A save in flight, if any (CowDisk): requestSync() waits for it when the kernel is not running. */
  readonly saving?: Promise<void> | null;
  /**
   * Snapshot support: which disk this is and its write generation now.
   * Throws if the disk cannot be part of a snapshot (its writes live only
   * in this process's memory). A disk without it cannot be in a snapshot.
   */
  snapshotState?(): DiskSnapshotState;
  /**
   * At a snapshot's consistent point (the kernel parked, no request in
   * flight; synchronous): make the current content durable and return
   * its state. `done` settles when it is durable (a failure fails the
   * snapshot). The next write starts a new generation.
   */
  snapshotSeal?(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
}
/** What a snapshot records about a disk (BlockDevice.snapshotState). */
export interface DiskSnapshotState {
  /** For messages: a path or a store name. */
  name: string;
  /** Which disk: stays the same across processes for the same content source. */
  identity: string;
  /** Write generation: differs whenever the content may differ. */
  gen: number;
  /** What changes when another program writes the disk (a file's size and mtime), if known. */
  stamp?: string;
}
/** Block I/O counters of one kernel (Kernel.block.stats). */
export interface BlockStats {
  reads: number;
  writes: number;
  flushes: number;
  discards: number;
  async: number;
  bytesRead: number;
  bytesWritten: number;
}
declare class BlockHost {
  k: Kernel;
  disks: BlockDevice[];
  /** Completed async requests (BigInt pointers). */
  done: bigint[];
  inflight: number;
  stats: BlockStats;
  /**
   * @param kernel  the Kernel (needs dv(), u8(), irqAddr, wake(), log)
   * @param disks  backends; index i becomes /dev/wd('a'+i)
   */
  constructor(kernel: Kernel, disks?: BlockDevice[]);
  imports(): Record<string, unknown>;
  submit(reqPtr: bigint): number;
  raise(): void;
}
/**
 * Counts flushes: flushSeq is the number of flushes issued, and
 * whenFlushed(n) resolves once a flush issued after the n-th one has
 * completed successfully. Flushes of one disk complete in order.
 */
export declare class FlushTracker {
  flushSeq: number;
  flushedSeq: number;
  waiters: Array<{
    after: number;
    resolve: () => void;
  }>;
  /** A flush starts: its sequence number. */
  begin(): number;
  /** Flush `seq` completed successfully. */
  done(seq: number): void;
  whenFlushed(after: number): Promise<void>;
}
/** Overlay value of a block that reads as zeros (stored as an empty record). */
export declare const ZERO_BLOCK: Uint8Array;
/** A read-only disk image: the base of a CowDisk. */
export interface DiskBase {
  size: number;
  /** Identifies the image's content (e.g. URL + size + ETag); a store refuses or drops an overlay saved for another one. */
  identity?: string;
  /** The base reads as all zeros (ZeroBase): discarding a block deletes its record instead of storing zeros. */
  zero?: boolean;
  /** Block indices with content, ascending (SparseBase; used by exportParts). */
  keys?(): number[];
  read(off: number, len: number): MaybePromise<Uint8Array>;
}
/** What OverlayStore.open() found. */
export interface StoreIndex {
  /** Block numbers that have a record. */
  keys: Set<number>;
  /** The store was seeded (a data disk, see web/disk.ts). */
  initialized: boolean;
  /** The store belongs to this other identity and was left alone ("refuse", or a read-only open). */
  mismatch?: string;
  /** The store belonged to this other identity and was cleared ("clear"). */
  cleared?: string;
  /** The write generation saved with the blocks (save()'s `meta`), if the store keeps one. */
  gen?: number;
  /** A random id the store chose when it was created, seeded or cleared, if it keeps one. */
  uid?: string;
}
/**
 * Persistence for a CowDisk overlay: records of 4 KiB blocks by index, an
 * empty record for a block that reads as zeros. IdbStore (web/disk.ts) is
 * the IndexedDB one. Every save must be atomic (one transaction), so the
 * stored state is always the state after some complete flush.
 */
export interface OverlayStore {
  /** e.g. "kwdisk:alpine", for messages. */
  readonly name?: string;
  /** Read the index (block numbers, not data). onMismatch: what to do with a store of another identity (default "refuse"). */
  open(identity: string, opts?: {
    onMismatch?: "clear" | "refuse";
    write?: boolean;
  }): Promise<StoreIndex>;
  /** The records of these blocks (absent ones are missing from the map). */
  getBlocks(blocks: number[]): Promise<Map<number, Uint8Array>>;
  /** One atomic transaction: put these records, delete those, and record `meta.gen` (the disk's write generation) if given. */
  save(puts: Array<[number, Uint8Array]>, dels: number[], meta?: {
    gen: number;
  }): Promise<void>;
  /** Delete everything. */
  clear(): Promise<void>;
  close?(): Promise<void>;
}
/** A base that reads as zeros (the data disk: its content is all in the store). */
export declare class ZeroBase implements DiskBase {
  size: number;
  readonly zero = true;
  identity: string;
  constructor(size: number);
  read(_off: number, len: number): Uint8Array;
}
/** A base made of a few non-zero 4 KiB blocks (a decoded kwsparse image, or a Map). */
export declare class SparseBase implements DiskBase {
  size: number;
  blocks: Map<number, Uint8Array>;
  identity: string;
  constructor(size: number, blocks: Map<number, Uint8Array>);
  static fromKwsparse(img: KwsparseImage): SparseBase;
  read(off: number, len: number): Uint8Array;
  keys(): number[];
}
export interface CowDiskOptions {
  /** Persistence for the overlay (loaded lazily after open()). */
  store?: OverlayStore | null;
  /** Host diagnostics; default console.warn. */
  log?: (msg: string) => void;
  /** A save failed (e.g. QuotaExceededError); the flush fails with EIO too. */
  onError?: (err: unknown) => void;
}
export interface CowDiskStats {
  /** Store read requests and the blocks they asked for (readahead included). */
  storeReads: number;
  storeBlocksRead: number;
  /** Blocks fetched ahead of a read, and reads served from them. */
  aheadBlocks: number;
  aheadHits: number;
  /** Committed saves, blocks put and records deleted by them. */
  saves: number;
  blocksSaved: number;
  blocksDeleted: number;
  /** Partial writes of blocks not in memory (read-modify-write). */
  rmw: number;
  saveErrors: number;
}
/**
 * Copy-on-write overlay over a read-only base, optionally persisted.
 *
 * Invariants, per block b:
 *   mem.has(b)     the newest content is in memory (always so without a
 *                  store; with one: written since the last committed save of b)
 *   stored.has(b)  the store has a record for b (used when !mem.has(b))
 *   otherwise      the base has the content.
 * A buffer handed to an in-flight save is frozen: a write copies it first,
 * so the save sees exactly what it was given. A block leaves memory only
 * when the save transaction that contains it has committed and it was not
 * written again meanwhile.
 */
export declare class CowDisk implements BlockDevice {
  #private;
  base: DiskBase;
  size: number;
  flags: number;
  store: OverlayStore | null;
  log: (msg: string) => void;
  onError: ((err: unknown) => void) | null;
  /** Block -> Uint8Array(4096) | ZERO_BLOCK. */
  mem: Map<number, Uint8Array>;
  /** Blocks with a record in the store. */
  stored: Set<number>;
  /** Blocks in mem not yet handed to a save. */
  dirty: Set<number>;
  /** Buffers an in-flight save holds. */
  frozen: WeakSet<Uint8Array>;
  /** Block -> store read in flight. */
  loading: Map<number, Promise<Uint8Array>>;
  /**
   * Readahead: store records fetched with a read that missed, for the
   * blocks after it. A read of one consumes it, a write drops it (so it
   * always equals the store's record). Each store read is one transaction,
   * and the guest often reads metadata one block at a time (ext4 reads its
   * orphan file, 256 blocks, that way at every mount); in WebKit every
   * IndexedDB transaction is a round trip to another process.
   */
  ahead: Map<number, Uint8Array>;
  /** Blocks being fetched ahead; a write removes them, so a stale fetch is not kept. */
  aheadPending: Set<number>;
  /** Block -> tail of the asynchronous writes on it. */
  busy: Map<number, Promise<void>>;
  /** The last flush in flight (flushes are chained). */
  saving: Promise<void> | null;
  /** detach(): flushes no longer reach the store. */
  saveDisabled: boolean;
  flushes: FlushTracker;
  stats: CowDiskStats;
  /** Set by openDataDisk: why this disk is not the persistent one (another tab, a format mismatch). */
  notice?: string;
  /** Set by openDataDisk: the store was created from the template in this session. */
  seeded: boolean;
  /** Set by openDataDisk: the store's identity. */
  identity?: string;
  /** Write generation (snapshotState): bumped by the first write after open() and after each snapshotSeal(). */
  gen: number;
  /** The generation the store has (StoreIndex.gen, then each committed save). */
  storedGen: number;
  /** From the store: its id (StoreIndex.uid) and identity. */
  storeUid?: string;
  storeIdentity?: string;
  constructor(base: DiskBase, { store, log, onError }?: CowDiskOptions);
  /**
   * Load the store's index (block numbers only, not the data). A store
   * saved for another base identity is cleared with onMismatch "clear"
   * (the store logs it), or makes this throw a StoreMismatchError.
   */
  open({ onMismatch }?: {
    onMismatch?: "clear" | "refuse";
  }): Promise<this>;
  /** Take what the store's open() found (openDataDisk opens the store itself). */
  adoptStore(st: StoreIndex, identity: string): void;
  /** Is every flush saved somewhere that outlives the page (a store that is attached)? */
  get persistent(): boolean;
  get flushSeq(): number;
  whenFlushed(after: number): Promise<void>;
  /** Number of blocks that differ from the base (stored or in memory). */
  get overlayBlocks(): number;
  /** Bytes of block data held in memory. */
  get memBytes(): number;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  static readonly RA_MIN = 8;
  static readonly RA_MAX = 128;
  /** Most blocks kept ahead (4 MiB); the oldest go first. */
  static readonly AHEAD_MAX = 1024;
  write(off: number, views: Uint8Array[]): MaybePromise<unknown>;
  discard(off: number, len: number): MaybePromise<unknown>;
  writeZeroes(off: number, len: number): MaybePromise<unknown>;
  /**
   * Save every block written so far in one store transaction; the flush
   * completes when it has committed. Flushes are chained: one issued while
   * a save is in flight waits for it (even with nothing new to save). On a
   * failed save the blocks are dirty again (the next flush retries them)
   * and the flush fails (EIO in the guest).
   */
  flush(): MaybePromise<unknown>;
  snapshotState(): DiskSnapshotState;
  /**
   * Take the dirty blocks now (no request is in flight, so no flush is
   * queued) and save them with the current generation; later writes go
   * to the next generation and later saves.
   */
  snapshotSeal(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
  /** Stop saving to the store (before replacing or clearing it); the running kernel's further writes stay in memory. */
  detach(): void;
  /** Drop all local changes (memory and persisted). Only while the kernel is not running. */
  reset(): Promise<void>;
  /**
   * The disk's current content as a kwsparse image (uncompressed), in
   * parts (Blobs, so a browser can keep large exports out of the JS heap;
   * gzipBlob() compresses them). Reads the store in batches. The base must
   * be a ZeroBase or a SparseBase.
   */
  exportParts({ batch }?: {
    batch?: number;
  }): Promise<{
    size: number;
    blocks: number;
    parts: BlobPart[];
  }>;
}
/** The distro header in the first bytes of an image (format: distro.ts). */
export interface DistroHeader {
  /** The image's size when it was built (a header of another size is ignored). */
  size: number;
  /** Bytes from the start of the image that a boot reads (= size: the whole image; 0: no hint). */
  prefetch: number;
  /** The end of what to fetch in the background once the boot is done, [prefetch, background): the warm set (0: none). */
  background: number;
  /** The distro's name (/usr/lib/kw-distro) and image id (/usr/lib/kw-image). */
  distro: string;
  image: string;
}
/** The distro header at offset 0 of an image, or null (none, another version, or another size than `size`). */
export declare function readDistroHeader(head: Uint8Array, size?: number): DistroHeader | null;
export interface HttpBaseOptions {
  /** Fetch granularity (power of two), default 256 KiB. */
  chunkSize?: number;
  /** Largest single Range request, default 4 MiB. */
  maxRequest?: number;
  /**
   * Read-ahead for sequential readers: a read that misses right after
   * chunks already here (or on their way) also fetches the chunks after
   * it, in a separate request, four chunks at first and doubling while the
   * reader keeps up, up to this many bytes; the next window is asked for
   * once the reader is halfway into the last one. Chunks arrive streamed,
   * so a read waits only for its own bytes, and a failed read-ahead only
   * leaves its chunks to lazy reads. Default 4 MiB; 0 or false: off.
   */
  readAhead?: number | false;
  /**
   * Every range must come from the image open() saw: the same total size
   * and, when open() got one, the same ETag (or Last-Modified). A range of
   * a changed image then fails (EIO in the guest) instead of mixing two
   * images' blocks. Default false.
   */
  strict?: boolean;
  /**
   * Fetch the first `prefetch` bytes right after open(), in one streaming
   * request (the image's size: one plain GET of the whole image, which
   * HTTP caches keep). Reads inside it wait for its bytes instead of
   * making their own requests; reads after it are lazy ranges, and so is
   * everything if it fails. Default: what the image's distro header says
   * (distro.ts), else nothing; false: nothing.
   */
  prefetch?: number | false;
  /**
   * Then fetch [prefetch, background) in the background (the warm set:
   * what the first commands after the boot read): once the prefetch has
   * settled, the image has been read from (the guest runs: an image is
   * often opened while its kernel still loads) and then neither read nor
   * requested for a second (the boot is done),
   * in sequential streamed pieces of `maxRequest` bytes, one at a time, so
   * a read waits at most for its own bytes of the piece in flight and
   * fetches chunks of a later piece itself. Not with the browser's Save-Data
   * set. Default: what the image's distro header says, unless `prefetch`
   * is false; false: nothing.
   */
  background?: number | false;
  /** Host diagnostics (a failed prefetch); default console.warn. */
  log?: (msg: string) => void;
}
/** What an HttpBase fetched (HttpBase.stats). */
export interface HttpBaseStats {
  /** Requests (open()'s probe included) and the bytes they brought. */
  requests: number;
  bytes: number;
  /** Range requests made for reads (not the probe, the prefetch or read-ahead). */
  lazyRequests: number;
  /** The prefetch: its size (0: none), the bytes it brought, and how it went. */
  prefetch: number;
  prefetchBytes: number;
  prefetchState: "none" | "running" | "done" | "failed";
  /** The background tier [prefetch, background) fetched after the boot settles: its end (0: none), the bytes it brought, and how it went. */
  background: number;
  backgroundBytes: number;
  backgroundState: "none" | "waiting" | "running" | "done" | "failed" | "skipped";
  /** Read-ahead (HttpBaseOptions.readAhead): range requests made ahead of a sequential reader, and the bytes they brought. */
  aheadRequests: number;
  aheadBytes: number;
}
export declare class HttpBase implements DiskBase {
  #private;
  url: string;
  size: number;
  identity: string;
  chunkSize: number;
  maxChunks: number;
  /** Chunk index -> data. */
  chunks: Map<number, Uint8Array>;
  /** Chunk index -> fetch in flight (a prefetched chunk: until its bytes arrived). */
  pending: Map<number, Promise<void>>;
  stats: HttpBaseStats;
  /** strict: the ETag or Last-Modified open() saw ("" if none), which every range must carry. */
  validator: string | null;
  /** The distro header of the image, if it has one. */
  header: DistroHeader | null;
  log: (msg: string) => void;
  /**
   * Open the image: one Range request for its first chunk, which tells the
   * size, the validator and the distro header (and is kept). Then the
   * prefetch, if any, starts (see HttpBaseOptions.prefetch), and the
   * background tier waits for its turn (HttpBaseOptions.background).
   */
  static open(url: string, { chunkSize, maxRequest, readAhead, strict, prefetch, background, log }?: HttpBaseOptions): Promise<HttpBase>;
  read(off: number, len: number): MaybePromise<Uint8Array>;
}
/**
 * A read-only BlockDevice that reads a DiskBase (e.g. an HttpBase) with no
 * overlay: the guest's writes fail with EROFS. In a snapshot it is the
 * base's identity.
 */
export declare class BaseDisk implements BlockDevice {
  base: DiskBase;
  size: number;
  readonly readOnly = true;
  readonly flags = 1;
  constructor(base: DiskBase);
  /** The base's fetch counters (an HttpBase's, see HttpBaseStats), if it keeps any. */
  get stats(): HttpBaseStats | undefined;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  write(): never;
  snapshotState(): DiskSnapshotState;
  snapshotSeal(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
}
/** The host port kwcmd connects to (guest/src/kwcmd.c KWCMD_PORT). */
export declare const CMD_PORT = 1020;
/** What a host command gets: the guest process that runs it. */
export interface HostCommandContext {
  /** The name the command was run by. */
  readonly name: string;
  /** Its arguments, without the name. */
  readonly args: readonly string[];
  /** The guest process's environment. */
  readonly env: Readonly<Record<string, string>>;
  /** The guest process's working directory. */
  readonly cwd: string;
  /** The guest process: its pid, and the user and group it runs as. */
  readonly pid: number;
  readonly uid: number;
  readonly gid: number;
  /** Which of the guest process's stdin, stdout and stderr are terminals. */
  readonly isTTY: {
    readonly stdin: boolean;
    readonly stdout: boolean;
    readonly stderr: boolean;
  };
  /** The terminal's size when the command started (0 without a terminal). */
  readonly cols: number;
  readonly rows: number;
  /**
   * The guest process's stdin. A pull stream: the guest reads its stdin
   * once for each read here (up to 16 KiB), so a command leaves alone what
   * it does not read (a terminal's typeahead, the rest of a pipe). It ends
   * at end of file, or when the guest process is gone.
   */
  readonly stdin: ReadableStream<Uint8Array>;
  /**
   * The guest process's stdout and stderr; strings are UTF-8. A write
   * resolves once the guest took it, and rejects when the guest process
   * is gone. What was written when the handler returns is still sent.
   */
  readonly stdout: WritableStream<Uint8Array | string>;
  readonly stderr: WritableStream<Uint8Array | string>;
  /** Aborts when the guest process is gone before the handler returned (killed, Ctrl-C, a closed pipe, the kernel exited). */
  readonly signal: AbortSignal;
}
/** What a host command returns (see HostCommand). */
export type HostCommandResult = number | string | Uint8Array | {
  exitCode?: number;
  signal?: string;
} | void;
/**
 * A host command: called once per guest process that runs it. What it
 * returns ends that process: a number (or { exitCode }) is its exit
 * status (0 to 255), a string or bytes are written to its stdout (status
 * 0), nothing is status 0, and { signal } ("SIGTERM" or "TERM", one of
 * TTY_SIGNALS) makes it die by that signal, as its parent then sees
 * (a shell's $? is 128 + the number). A throw (or rejection) prints the
 * error's message on its stderr and exits 1.
 */
export type HostCommand = (ctx: HostCommandContext) => HostCommandResult | Promise<HostCommandResult>;
export type CommandErrorCode =
/** The instance has no vsock device. */
"ENODEV" |
/** The guest has no kwbox (a base from before it). */
"ENOENT" |
/** A name that is not a command name, or a handler that is not a function. */
"EINVAL" |
/** vsock port 1020 is taken by another listener of the host. */
"EADDRINUSE" |
/** The guest did not finish within the timeout (no kwtty answered). */
"ETIMEDOUT" |
/** The kernel exited. */
"ECONNABORTED" |
/** The guest failed otherwise (the message has its words). */
"EREMOTE";
export declare class CommandError extends Error {
  readonly code: CommandErrorCode;
  constructor(code: CommandErrorCode, message: string, cause?: unknown);
}
/** createKernel's `commands`: names to handlers. */
export type CommandsOption = Record<string, HostCommand>;
/** @internal createKernel's `commands`, checked before boot. */
declare function parseCommands(commands: CommandsOption | undefined, vsock: boolean): Array<[string, HostCommand]>;
/** The link's message types (gl/bridge/mux.js has the same for the WebSocket link). */
export declare const MUX: {
  readonly OPEN: 1;
  readonly DATA: 2;
  readonly CLOSE: 3;
  readonly READY: 4;
  readonly LOG: 5;
};
/**
 * A vtest renderer as gl/bridge/README.md describes it: the wasm module's
 * `Module.virgl.Renderer` (gl/wasm/post.js), or the relay of the test pages.
 */
export interface VtestRenderer {
  /** Once, before any client; resolves with a description. */
  init(): Promise<string>;
  /** A new client. */
  open(id: number): void;
  /** The client's bytes, any chunking, in order; a promise: busy, feed no more until it settles. */
  feed(id: number, bytes: Uint8Array): unknown;
  /** The client is gone: free its context and resources. */
  close(id: number): void;
  /** Set by the host: reply bytes, in order. */
  onreply: (id: number, bytes: Uint8Array) => void;
  /** Set by the host: the renderer dropped the client. */
  onclose: (id: number, why: string) => void;
  /** How often and how long the client's busy waits were parked. */
  stats?(id: number): {
    parks: number;
    parkedMs: number;
  } | undefined;
  /** Counters over all clients since init (the wasm renderer: VirglTotals), or undefined while there are none (a renderer not loaded yet). */
  totals?(): VirglTotals | undefined;
}
/**
 * The wasm renderer's counters since init (gl/wasm/kw_virgl.h,
 * KW_VIRGL_STAT_*; .agents/gl.md, Stats). Times are in ms, each command's
 * GL calls included: WebGL runs most of them asynchronously, but a read
 * that returns data waits for the GPU work it reads.
 */
export interface VirglTotals {
  /** VCMD_SUBMIT_CMD: decoding a command buffer and issuing its GL calls. */
  submits: number;
  submitMs: number;
  /** TRANSFER_GET(2): readbacks (glReadPixels, getBufferSubData); about one a frame for a program that shows its frames. */
  reads: number;
  readMs: number;
  /** TRANSFER_PUT(2): uploads. */
  writes: number;
  writeMs: number;
  /** Every other command. */
  others: number;
  otherMs: number;
  /** Waiting VCMD_RESOURCE_BUSY_WAITs, answered as the next four count. */
  waits: number;
  /** At once, right after a readback of the same resource. */
  waitsRead: number;
  /** At once, their fences retired already. */
  waitsDone: number;
  /** At once, ahead of their fences. */
  waitsAhead: number;
  /** After parking until fences retired (WebGL tells only between tasks). */
  parks: number;
  parkedMs: number;
  parkMaxMs: number;
  /** Polls of parked clients: kw_virgl_poll calls that found one, and the tasks that ran them. */
  polls: number;
  messagePolls: number;
  timerPolls: number;
}
/** One message for the stream link: u32 length, u32 client id, u8 type, payload. */
export declare function frame(type: number, id: number, payload?: Uint8Array): Uint8Array;
/** Cuts a byte stream into the link's messages (each without its length). */
export declare class Deframer {
  #private;
  push(chunk: Uint8Array): void;
  /** The next whole message (a copy), or null. Throws on a length out of range. */
  next(): Uint8Array | null;
}
export interface StreamHostStats {
  /** Bridges being served now. */
  streams: number;
  /** Clients open now, over all streams. */
  clients: number;
  /** Clients opened since the start. */
  opened: number;
  /** The renderer's counters, when it keeps them (the wasm renderer does). */
  renderer?: VirglTotals;
}
export declare class StreamHost {
  #private;
  /** renderer: initialized (init() settled); StreamHost takes its onreply and onclose. */
  constructor(renderer: VtestRenderer);
  get stats(): StreamHostStats;
  /**
   * Serves one bridge until its stream ends; its clients are closed then.
   * Tells the bridge at once that the renderer is ready (it creates its
   * vtest socket on that). Rejects on a broken frame, after resetting the
   * stream. `log` gets the bridge's LOG messages.
   */
  serve(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>, { log }?: {
    log?: ((_: string) => void) | undefined;
  }): Promise<void>;
}
/** What the renderer offers, from its WebGL2 context: the device side caches it. */
interface GpuInit {
  /** Capsets by index (capset IDs 1, VIRGL, and 2, VIRGL2, as far as the renderer has them). */
  capsets: Array<{
    id: number;
    version: number;
    data: Uint8Array;
  }>;
  /** kw_vgpu_format() of each virgl format, by number: block width | height << 8 | bytes << 16. */
  formats: Uint32Array;
}
/** A command for the renderer: a copy (rewritten for packed transfers), header first. */
interface GpuRequest {
  cmd: Uint8Array;
  /** TRANSFER_TO_HOST_3D: the packed bytes. */
  data?: Uint8Array;
  /** TRANSFER_FROM_HOST_3D: how many packed bytes to read back. */
  readLen?: number;
}
/** The renderer's answer: 0 (OK) or a virtio-gpu response type, and a readback's packed bytes. */
interface GpuReply {
  code: number;
  data?: Uint8Array;
}
/** The module's virtio-gpu helpers (gl/wasm/post.js, Module.virgl.gpu). */
interface VirglGpuApi {
  buffer(n: number): Uint8Array;
  command(cmd: Uint8Array, data?: Uint8Array): number;
  capset(id: number): {
    version: number;
    data: Uint8Array;
  } | null;
  format(f: number): number;
  fence(): number;
  fencesDone(): number;
  /** Host GL errors of guests' commands so far (GpuRendererStats.glErrors). Absent in a module from before it. */
  glErrors?(): number;
  info(res: number): {
    texture: WebGLTexture | null;
    width: number;
    height: number;
    format: number;
    yTop: boolean;
    alpha?: boolean;
  } | null;
  /** Absent in a module from before window images (GpuRenderer.image() then gives null). */
  blit?(res: number, x: number, y: number, w: number, h: number, flags?: number): number;
  present(res: number, x: number, y: number, w: number, h: number): number;
  read(res: number, x: number, y: number, w: number, h: number, bpp?: number): Uint8Array | null;
}
/** What GpuRenderer runs on: the module's helpers and its WebGL2 context (an OffscreenCanvas). */
interface GpuRendererCore {
  gpu: VirglGpuApi;
  gl: WebGL2RenderingContext;
}
/** A resource's texture in the renderer's WebGL2 context (GpuRenderer.texture()). */
interface GpuTexture {
  /** The context that owns it (the renderer's; share nothing with another context). */
  gl: WebGL2RenderingContext;
  /** The texture, or null for a resource without one (a buffer). */
  texture: WebGLTexture | null;
  width: number;
  height: number;
  /** The virgl format (virgl_formats; 1 B8G8R8A8, 2 B8G8R8X8, 67 R8G8B8A8, 134 R8G8B8X8 ...). */
  format: number;
  /**
   * VIRGL_RESOURCE_Y_0_TOP: the texture's row k holds the picture's row
   * height - 1 - k (rows counted from the top, as the guest lays them
   * out); without it row k holds row k, so drawn into a framebuffer as GL
   * counts rows (from the bottom) it is upside down.
   */
  yTop: boolean;
  /** The format has alpha (B8G8R8A8, R8G8B8A8 ...; not B8G8R8X8, R8G8B8X8). */
  alpha: boolean;
}
/** What GpuRenderer.image() takes of a resource, and how. */
interface GpuImageOptions {
  /** The rectangle of the picture (rows from the top): default all of it; clamped to the resource. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /**
   * Alpha 1 everywhere. Default: when the resource's format has none
   * (GpuTexture.alpha). Pass what the client declared: true for an X
   * fourcc (XR24, XB24: the fourth byte is undefined), false for an A one
   * (AR24, AB24: premultiplied alpha, kept).
   */
  opaque?: boolean;
  /**
   * Upside down: the image's row 0 is the picture's last row. For a
   * buffer whose client set y_invert (zwp_linux_buffer_params_v1 flag 1:
   * its row 0 is the bottom), so that the image's row 0 is the top.
   */
  flipY?: boolean;
}
interface GpuRendererStats {
  /** Commands run. */
  commands: number;
  /** Fenced commands, and how they were answered: at once, or after waiting for the GPU (parks). */
  fenced: number;
  parks: number;
  parkedMs: number;
  /** Frames presented (RESOURCE_FLUSH of the scanout), and readbacks (TRANSFER_FROM_HOST_3D). */
  presents: number;
  reads: number;
  /** Window images made (image()). */
  images: number;
  /** Commands the renderer refused or could not run (logged, at most one line a second). */
  errors: number;
  /**
   * WebGL errors raised by guests' commands: each one a call WebGL dropped
   * (it refuses calls GLES leaves undefined), with the guest's context
   * going on; the renderer logs them ("[gl] virgl: ... GL error 0x502 ...").
   */
  glErrors: number;
  /**
   * The latest of the commands that failed, for a device without DevTools: the command, its
   * context and resource, the answer and why ("" while none failed), e.g.
   * "SUBMIT_3D ctx 1: 0x1200, the renderer refused it (...)".
   */
  lastError: string;
  /**
   * The WebGL2 context is lost and no new renderer has been made since: every
   * 3D command fails until the guest's next new GL context makes one
   * (GpuRendererOptions.renew).
   */
  contextLost: boolean;
  /** WebGL2 contexts lost so far, and new renderers made after a loss. */
  losses: number;
  renewals: number;
}
interface GpuRendererOptions {
  /**
   * Answer every fenced command once its GPU work is done, as QEMU does
   * (glmark2 and the like then wait for each frame). Default false: at
   * once, except that after a frame was presented a fenced command waits
   * until that frame is done (the guest runs at most about a frame ahead
   * of the GPU).
   */
  strictWaits?: boolean;
  log?: (msg: string) => void;
  /**
   * A renderer to go on with after the WebGL2 context was lost: a new
   * module instance on a new WebGL2 context (gl.ts, GlLoader.get()),
   * asked when the guest makes its next new GL context. Without it a
   * loss is final: every 3D command fails from then on.
   */
  renew?: () => Promise<GpuRendererCore>;
}
/** The current scanout and its latest frame (GpuRenderer.scanout). */
interface GpuScanout {
  resource: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Frames presented on it so far. */
  seq: number;
}
/**
 * The renderer side of virtio-gpu 3D, on the thread with the WebGL2
 * context. Runs commands in the order they come; answers fenced ones as
 * GpuRendererOptions.strictWaits says (gl.md, The DRM path: why answering
 * ahead of the GPU cannot make the guest read data before it is valid);
 * presents the scanout: a RESOURCE_FLUSH of the scanout's resource blits
 * it into the context's drawing buffer (sized to the scanout) and takes it
 * as an ImageBitmap (transferToImageBitmap: no readback), which
 * drawFrame() draws into the page's canvas. frame() reads the scanout back
 * on demand (screenshots). image() takes any resource's picture the same
 * way, for a compositor on the page (window images).
 *
 * A lost WebGL2 context takes every guest object of the renderer with it
 * (#loseContext). With `renew`, the guest's next new GL context gets a new
 * renderer; contexts and resources the guest still holds from the lost one
 * are stale: commands naming them fail, or are dropped where nothing is
 * left to do (destroy, unref, detach), so the programs that had them must
 * be restarted. Contexts that never submitted (a Wayland relay's) hold no
 * objects and are made again in the new renderer.
 */
declare class GpuRenderer {
  #private;
  /** The capsets and the format table once the renderer is up (after start()); rejects if it cannot be. */
  readonly init: Promise<GpuInit>;
  stats: GpuRendererStats;
  /** A new frame was presented, or the scanout changed. */
  onFrame: (() => void) | undefined;
  /**
   * `load` gives the module's helpers and its WebGL2 context: called once,
   * on start() (the device side's first 3D use, or at once for a renderer
   * loaded before boot), or on the first command.
   */
  constructor(load: () => Promise<GpuRendererCore>, opts?: GpuRendererOptions);
  /** Load the renderer now, if that has not started (the guest's first 3D use). */
  start(): void;
  /** start() was called: the renderer is loaded, loading, or failed. */
  get started(): boolean;
  /** Run a command and answer (after the commands before it). */
  call(req: GpuRequest): GpuReply | Promise<GpuReply>;
  /** Run a command, no answer. */
  post(req: GpuRequest): void;
  /** The module's heap for a transfer's packed bytes (inline), valid until the next command. */
  buffer(n: number): Uint8Array;
  /** The device reset: destroy the guest's contexts and resources. */
  reset(): void;
  /** The scanout (a 3D resource on it) and how many frames it got, or null. */
  get scanout(): GpuScanout | null;
  /**
   * Draw the scanout's latest frame into a 2D context at (0, 0), its size
   * (the canvas should be the scanout's size). True if it drew a frame it
   * had not drawn before, false if there is nothing new, null if no 3D
   * resource is on the scanout (show frame() or the display instead).
   * The frame stays until the next one, so `force` draws it again.
   */
  drawFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, force?: boolean): boolean | null;
  /** The scanout as RGBA, read back from the GPU (for screenshots, not every frame), or null. */
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /**
   * A resource's GL texture in the renderer's context, for host code that
   * composes guest buffers (a client's dmabuf: DRM_IOCTL_VIRTGPU_RESOURCE_INFO
   * gives its resource id): null if there is no such resource. Use it on
   * this thread, in `gl`, and do not change its parameters or delete it.
   */
  texture(resource: number): GpuTexture | null;
  /**
   * A resource's picture as an ImageBitmap, for a compositor on the page
   * (a guest client's dmabuf: DRM_IOCTL_VIRTGPU_RESOURCE_INFO gives the
   * resource id; textures do not cross WebGL contexts, images do). Row 0
   * is the picture's top row as the guest lays it out (VIRGL_RESOURCE_Y_0_TOP
   * resources included), unless `flipY`; colour and alpha as the client
   * rendered them, premultiplied (Wayland's ARGB, and what a 2D canvas's
   * drawImage() takes from an ImageBitmap), or opaque (`opaque`, by default
   * for a format without alpha). No readback: the module blits the texture
   * into the renderer's drawing buffer (vrend's state handled as for the
   * scanout) and takes it with transferToImageBitmap(), so the image holds
   * what the guest's commands before this call drew, now; later rendering
   * does not change it. The image is the caller's: close() it when drawn.
   *
   * Null for an unknown id, a resource without a texture (a buffer), an
   * empty rectangle, or no renderer; a promise while the renderer is
   * still loading (it waits for it; the guest made no 3D resource before
   * the renderer could run its commands, so nothing waits otherwise). It
   * never loads the renderer: before the guest's first 3D use there is no
   * resource. The drawing buffer is resized to the image (the scanout's
   * next present resizes it back; its frame is already an ImageBitmap).
   */
  image(resource: number, opts?: GpuImageOptions): ImageBitmap | null | Promise<ImageBitmap | null>;
  /**
   * Host pixels into a guest 2D texture resource (level 0, the box x, y,
   * width x height; rows from the top as the guest lays them out), after
   * every command before it: a TRANSFER_TO_HOST_3D in no guest context,
   * which vrend runs as any upload. For host code that fills a resource a
   * guest program made and exported (guest VA-API's surfaces, va.ts): its
   * importers sample what the guest's commands after this one see. `fill`
   * writes the rows, tightly packed (width x the format's bytes per
   * texel), into the buffer it gets (the module's heap: one copy). False,
   * with nothing written, for no renderer (not loaded, failed, lost), an
   * unknown resource or a buffer, or a format the module cannot pack.
   */
  write(resource: number, box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }, fill: (dst: Uint8Array) => void): boolean;
  video(resource: number, frame: unknown, width: number, height: number): string | null;
  /** A guest texture resource's texels read back (the box, rows from the top, the guest's layout), or null. */
  read(resource: number, box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Uint8Array | null;
}
/** The vsock port the host's renderer listens on (the guest's forwarder connects to CID 2 there). */
export declare const GL_PORT = 1019;
/** The guest's forwarder (gl/bridge/vtest-bridge.c, stream link only) as a command: a tool of the base's kwbox. */
export declare const GL_FORWARDER: readonly string[];
export interface GlOptions {
  /**
   * The wasm renderer: the emscripten module virgl.mjs (with virgl.wasm
   * next to it). Default: the one next to the SDK's web entry
   * (dist/virgl.mjs, export `unkernel/virgl.mjs`).
   */
  module?: string | URL;
  /**
   * A vtest renderer of your own (gl/bridge/README.md, The renderer in the
   * page) in place of the wasm module, initialized here; works on any
   * platform.
   */
  renderer?: VtestRenderer;
  /**
   * Start the guest's forwarder (GL_FORWARDER) through kwtty once the
   * renderer is up. Default true; false: start it yourself (`kwbox
   * vtest bridge --link vsock:2:1019 --daemon`).
   */
  forwarder?: boolean;
  /**
   * Load the renderer (fetch and compile the module, make its WebGL2
   * context) before the kernel boots, as the guest's first GL use would,
   * so that a failure shows up front (`ready` rejects). Default false: on
   * the guest's first GL use (a vtest client, or virtio-gpu's first capset
   * or 3D command), which then waits for it; `status` and `load()` tell
   * and start it.
   */
  eager?: boolean;
  /**
   * The wasm renderer answers every waiting busy wait as vtest does: once
   * the fences submitted before it have retired, which WebGL tells only
   * between tasks. Default false: it answers at once where that cannot
   * make the guest read data before it is valid (gl/wasm/kw_virgl.c,
   * busy_wait), which saves most of that wait in each frame. With
   * `gpu`, likewise for virtio-gpu's fences: each fenced command is
   * answered once its GPU work is done (QEMU's answer), instead of at once
   * or, after a presented frame, once that frame is done (gl-gpu.ts,
   * GpuRenderer). For comparison.
   */
  strictWaits?: boolean;
}
/** createKernel's `gl`: true, or options. */
export type GlOption = boolean | GlOptions;
/**
 * KernelHandle.gl.stats: bridges and clients, the renderer's counters
 * (`renderer`, VirglTotals, once it is loaded; virtio-gpu's commands count
 * there too) and, with `gpu`, the virtio-gpu side's (`gpu`).
 */
export interface GlStats extends StreamHostStats {
  gpu?: GpuRendererStats;
}
/** Where the renderer is (KernelHandle.gl.status). */
export interface GlRendererStatus {
  /**
   * "idle": not loaded yet, it loads on the guest's first GL use; "loading"
   * (also a new renderer after a loss); "ready"; "lost": the browser
   * dropped its WebGL2 context, the GL programs that were running fail and
   * must be restarted, and the guest's next GL use makes a new renderer
   * (`error` says why the last try failed, if one did); "failed": it cannot
   * be had (`error` says why), and the guest's GL programs get no renderer
   * (with virtio-gpu, Mesa falls back to software rendering).
   */
  state: "idle" | "loading" | "ready" | "lost" | "failed";
  /** WebGL2 contexts lost so far, and new renderers made after a loss. */
  losses: number;
  renewals: number;
  /** Loaded before the kernel booted (gl.eager), not on first use. */
  eager: boolean;
  /** performance.now() when the load started, or null. */
  startedAt: number | null;
  /** How long the load took (the module's fetch and compile, the WebGL2 context, the renderer's start), in ms, or null. */
  loadMs: number | null;
  /** Why it failed, or null. */
  error: string | null;
  /** Once ready: the renderer ("virglrenderer (wasm) on WebGL 2.0 ...") and the WebGL2 implementation (WEBGL_debug_renderer_info). */
  what: string | null;
  webgl: string | null;
}
/** The host side of guest GL (KernelHandle.gl). */
export declare class GlHost {
  #private;
  /**
   * Resolves with the renderer's description once guest GL programs can
   * run: the host listens and (unless `forwarder: false`) the guest's
   * forwarder is linked and has made its vtest socket. With the default
   * lazy loading the renderer itself is not loaded then (`status`,
   * `loaded`); with `eager` it is, and its description is in the string.
   * Rejects if that cannot happen (also logged).
   */
  readonly ready: Promise<string>;
  /**
   * Settles once the renderer is loaded ("<renderer>; <WebGL2
   * implementation>"), on the guest's first GL use, or at once with
   * `eager` or load(); rejects if it cannot be (logged). Never settles
   * while the guest uses no GL.
   */
  readonly loaded: Promise<string>;
  /** @internal Use createKernel({ gl }). */
  constructor(vsock: Vsock | undefined, prep: GlPrep, log: (msg: string) => void);
  /** Bridges and clients being served, the renderer's counters, and virtio-gpu's (with `gpu`). */
  get stats(): GlStats;
  /** Where the wasm renderer is: not loaded yet, loading, ready (with how long the load took), failed. */
  get status(): GlRendererStatus;
  /** Load the renderer now, as the guest's first GL use would (nothing if it is loaded or loading); resolves as `loaded`. */
  load(): Promise<string>;
  /**
   * With `gpu`: virtio-gpu's renderer side (gl-gpu.ts), on this thread:
   * `scanout`, `drawFrame(ctx)` (the scanout's latest frame into a 2D
   * canvas, no readback), `frame()` (a readback, for screenshots),
   * `texture(resourceId)` (a guest resource's WebGLTexture), `stats`,
   * `onFrame`. Undefined without `gpu` or without WebGL2 (the 2D device).
   */
  get gpu(): GpuRenderer | undefined;
  /** @internal The kernel exited. */
  shutdown(): void;
}
/** The module's JS helpers (gl/wasm/post.js) that GlHost uses. */
interface VirglModule {
  virgl: {
    init(gl: WebGL2RenderingContext): number;
    Renderer: new (gl: WebGL2RenderingContext, opts?: {
      strictWaits?: boolean;
    }) => VtestRenderer;
    gpu: VirglGpuApi;
  };
}
/** One module instance and its WebGL2 context, which the vtest link and virtio-gpu share. */
interface GlCore extends GpuRendererCore {
  module: VirglModule;
}
/**
 * @internal The wasm renderer, loaded on the first load(): the guest's
 * first GL use (a vtest client, virtio-gpu's first capset or 3D command),
 * GlHost.load(), or before boot with `eager`. When the browser drops its
 * WebGL2 context, get() makes a new one (a new module instance on a new
 * WebGL2 context) on the guest's next GL use; the vtest link and virtio-gpu
 * share whichever is current.
 */
declare class GlLoader {
  #private;
  readonly status: GlRendererStatus;
  /** The first renderer (the first load). */
  readonly loaded: Promise<GlCore>;
  /** `failed`: it cannot be had at all (no WebGL2 context when probed), so load() rejects with that. */
  constructor(url: string, log: (msg: string) => void, eager: boolean, failed?: string);
  load(): Promise<GlCore>;
  /**
   * The renderer to use now: the first load (started if need be), the
   * current renderer, or, when its context was lost, a new one (one try at
   * a time; after a failure the next try waits a second). Rejects if there
   * is none.
   */
  get(): Promise<GlCore>;
  /** Hear when the current renderer's context is lost (with the renderer). */
  onLost(fn: (c: GlCore) => void): void;
}
/** @internal What createKernel({ gl }) prepared before the kernel boots: the options, the renderer's loader, virtio-gpu's side. */
interface GlPrep {
  opts: GlOptions;
  loader?: GlLoader;
  gpu?: GpuRenderer;
}
/** The vsock port the host's renderer listens on (the guest's ICD connects to CID 2 there). */
export declare const VK_PORT = 1018;
/** The parts of WebGPU this file uses (the SDK's TypeScript has no WebGPU types). */
export interface VkGpuAdapter {
  readonly features: Iterable<string> & {
    has(name: string): boolean;
  };
  readonly limits: object;
  readonly info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
  requestDevice(desc?: {
    requiredFeatures?: string[];
    requiredLimits?: Record<string, number>;
  }): Promise<VkGpuDevice>;
}
export interface VkGpuDevice {
  readonly lost: Promise<{
    reason?: string;
    message?: string;
  }>;
  readonly features: Iterable<string>;
  destroy(): void;
}
export interface VkOptions {
  /** The translator's wasm (kwvk-naga.wasm): a URL or its bytes. Default: the one next to the web entry. */
  shaderWasm?: URL | string | BufferSource;
  /** A WebGPU device to render on, instead of one requested from navigator.gpu at the first connection. */
  device?: VkGpuDevice;
  /** With `device`: its adapter (for the hello reply's description). */
  adapter?: VkGpuAdapter;
  /** The adapter's power preference when the host requests one. */
  powerPreference?: "low-power" | "high-performance";
  /** Log every renderer line as "[vk] ..." (default true). */
  log?: boolean;
}
export type VkOption = boolean | VkOptions;
/** What vm.vk.status says about the renderer. */
export interface VkRendererStatus {
  /**
   * idle: no guest Vulkan use yet; loading; ready; lost (the WebGPU device
   * was lost: the next program's connection makes a new device and
   * renderer); failed (`error`).
   */
  state: "idle" | "loading" | "ready" | "lost" | "failed";
  /** When the load started (ms on performance.now()), or null. */
  startedAt: number | null;
  /** How long the load took, or null. */
  loadMs: number | null;
  error: string | null;
  /** The adapter ("vendor architecture description"), once there is one. */
  adapter: string | null;
}
export interface VkStats {
  /** Guest streams (VkInstances) being served, and served in all. */
  connections: number;
  opened: number;
  /** Bytes from and to the guest. */
  bytesIn: number;
  bytesOut: number;
  /** WebGPU devices lost (each time the open programs were cut off and a new renderer made on demand). */
  losses: number;
  /**
   * The current renderer's counters (vk-host.ts VkStats: presents, draws,
   * submits, bytesWritten, bytesRead, translations, errors, ...), or null
   * before the first program and after a loss; they start again with each
   * new renderer.
   */
  renderer: Record<string, number> | null;
}
/**
 * An external buffer the guest's ICD made for a swapchain image (wland's
 * ExternalRef: wland_external_buffer_manager_v1.create_buffer's arguments,
 * the id as (id_hi << 32) | id_lo). vk/PROTOCOL.md, Amendments, "External present".
 */
export interface VkExternalRef {
  id: bigint;
  width: number;
  height: number;
  /** DRM fourcc: ARGB8888 / XRGB8888 (the ICD's B8G8R8A8 swapchains), ABGR8888 / XBGR8888 */
  format: number;
  /** 1 y_invert (the ICD never sets it) */
  flags: number;
}
/** The renderer's modules (vk-host.ts, vk-shader.ts), as the entry that bundles them loads them. */
interface VkModules {
  VkRenderer: unknown;
  loadVkShader: (wasm: never) => Promise<unknown>;
}
/** @internal What createKernel({ vk }) prepared before the boot. */
interface VkPrep {
  opts: VkOptions;
  shaderWasm: URL | string | BufferSource;
  load: () => Promise<VkModules>;
}
/** The guest's Vulkan renderer: vsock port 1018 served on this thread (vm.vk). */
export declare class VkHost {
  #private;
  /** Resolves once the host listens (the renderer itself loads on the guest's first Vulkan instance). */
  readonly ready: Promise<string>;
  /** Settles once the renderer is loaded (the adapter's description) or failed; never while the guest uses no Vulkan. */
  readonly loaded: Promise<string>;
  /** @internal Use createKernel({ vk }). */
  constructor(vsock: Vsock, prep: VkPrep, log: (msg: string) => void);
  /** Where the renderer is: idle (no guest Vulkan yet), loading, ready, lost, failed. */
  get status(): VkRendererStatus;
  /** Streams served, bytes carried, device losses, and the current renderer's counters. */
  get stats(): VkStats;
  /** The WebGPU device the renderer runs on, once there is one (undefined before the first program and after a loss). */
  get device(): VkGpuDevice | undefined;
  /**
   * A page compositor's resolver for the ICD's external buffers (wland's
   * `gpu.resolveExternal`: give it the ref as wland does): the swapchain
   * image's current picture as an ImageBitmap of the caller's (close() it),
   * copied GPU to GPU on the renderer's device (no readback), row 0 at the
   * top, premultiplied alpha or opaque as the format says. Synchronous, on
   * this thread (the renderer's, in both modes). null keeps the surface's
   * last content: no renderer (not loaded, or lost), an id no live program
   * made (a wrong token, a destroyed image, an image not yet presented) or
   * a size, format or flags that are not the image's. It never starts the
   * load. The ICD uses external buffers only where wland offers its
   * wland_external_buffer_manager_v1, i.e. where the page passes this as
   * resolveExternal.
   */
  externalImage(ref: VkExternalRef): ImageBitmap | null;
  /** Load the renderer now, as the guest's first Vulkan instance would; resolves as `loaded`. */
  load(): Promise<string>;
  /** @internal The kernel exited. */
  shutdown(): void;
}
/** How a context's decoder is expected to give its outputs (vm.va.stats). */
type CodecMode = "model" | "conservative";
/** Rate control as VA names it: VA_RC_CBR, VA_RC_VBR, VA_RC_CQP. */
type RcMode = "cbr" | "vbr" | "cqp";
/** One encode context, as vm.va.stats.encode.list shows it. */
interface VaEncodeContextStats {
  id: number;
  profile: string;
  /** the context's size (surfaces: VP9's are aligned to 64) and the frames' */
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  /** VideoEncoder.configure()'s codec string, bitrateMode, bitrate (bits/s; 0 for quantizer), frame rate, hardwareAcceleration */
  codec: string | null;
  rc: RcMode;
  bitrate: number;
  framerate: number;
  hardwareAcceleration: string;
  open: boolean;
  pictures: number;
  chunks: number;
  keyFrames: number;
  bytes: number;
  failed: number;
  recoveries: number;
  reconfigures: number;
  /** encode latency, ms (moving average): picture in to its chunk out */
  latencyMs: number;
}
interface VaEncodeStats {
  /** encode contexts open now, and made in all; VideoEncoders now */
  contexts: number;
  opened: number;
  encoders: number;
  /** pictures the guest sent, chunks back (key frames among them) and their bytes */
  pictures: number;
  chunks: number;
  keyFrames: number;
  codedBytes: number;
  /**
   * Where pictures' pixels came from: sent with the picture over vsock
   * (uploads, uploadBytes), the host's kept copy of a surface that did not
   * change (kept), a decoded picture of the stream (decoded: nothing sent),
   * a surface never written (black); keptBytes held now.
   */
  uploads: number;
  uploadBytes: number;
  kept: number;
  decoded: number;
  black: number;
  keptBytes: number;
  /** pictures that failed; encoder errors, reclamations, stall flushes, encoders made again with the owed pictures encoded again, configure() for a new rate or size, configurations given up */
  failed: number;
  errors: number;
  reclaims: number;
  flushes: number;
  recoveries: number;
  reconfigures: number;
  fallbacks: number;
  /** hidden frames asked (show_frame 0), encoded shown */
  hidden: number;
  /** open contexts and the last few destroyed */
  list: VaEncodeContextStats[];
}
/** The vsock port the host's decoder listens on (the guest's driver connects to CID 2 there). */
export declare const VA_PORT = 1024;
export interface VaOptions {
  /** WebCodecs' hardwareAcceleration for every decoder (default "no-preference"); prefer-software is tried after it where a decoder fails before its first picture. */
  hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
  /** Log the decoders' errors as "[va] ..." (default true). */
  log?: boolean;
  /** "auto" (default): each context starts in its codec's model mode and goes conservative where the decoder disagrees; "conservative": every context starts there. */
  mode?: "auto" | "conservative";
  /** @internal Test hook: H.264 declares this many more reorder frames than it needs, so a real decoder holds more than the model says. */
  holdExtra?: number;
  /** @internal Test hook: each chunk as it first goes to a decoder (not replays or fillers), e.g. to decode the stream elsewhere. */
  dump?: (chunk: {
    ctx: number;
    profile: string;
    key: boolean;
    data: Uint8Array;
  }) => void;
  /**
   * How a video processing output (a BGRX surface, mpv's
   * --vo=dmabuf-wayland) gets its picture: "auto" (default) draws the
   * decoder's VideoFrame into the surface's texture on the GPU where it
   * can (texSubImage2D; the browser converts YUV to RGB) and falls back to
   * the CPU per picture; "cpu" always copies the frame to NV12 and converts
   * it on the CPU (the page's `?va=cpu`), for comparison or as an escape
   * hatch.
   */
  upload?: "auto" | "cpu";
  /** @internal Test hook: keep each GPU-drawn picture's NV12 too, for VaHost.reference(). */
  verify?: boolean;
}
export type VaOption = boolean | VaOptions;
/** What vm.va.status says. */
export interface VaStatus {
  /** idle: no guest connection yet; ready: the profiles are known; failed (`error`). */
  state: "idle" | "ready" | "failed";
  /** The VA profiles the host offers ("vp9.0": VP9 profile 0), once known. */
  profiles: string[];
  /** Whether WebCodecs says it decodes in hardware here (prefer-hardware supported for an offered profile), once known. */
  hardware: boolean | null;
  /** Per profile asked about: whether isConfigSupported says yes with prefer-hardware and with prefer-software (1080p). */
  support: Record<string, {
    hardware: boolean;
    software: boolean;
  }>;
  /** Profiles taken back after their decoders failed before any picture (isConfigSupported said yes): not offered to later connections. */
  broken: string[];
  /** The VA profiles with an encoder (VAEntrypointEncSlice: VideoEncoder.isConfigSupported says yes), once known, and the rate control modes of each (cqp, cbr, vbr). */
  encode: string[];
  encodeModes: Record<string, string[]>;
  error: string | null;
}
/** One VA context, as vm.va.stats shows it: what a report from real hardware needs. */
export interface VaContextStats {
  id: number;
  /** the VA profile ("h264.high") and the context's size */
  profile: string;
  width: number;
  height: number;
  /** VideoDecoder.configure()'s codec string now, and whether it had a description (avcC) */
  codec: string | null;
  description: boolean;
  /** the hardwareAcceleration configured */
  hardwareAcceleration: string;
  /** what decodes, as far as WebCodecs tells: from the configured preference and isConfigSupported's answers for prefer-hardware and prefer-software */
  decoder: "hardware" | "software" | "hardware or software";
  /** the VideoFrame format of its outputs (I420: a software decoder, as a rule; NV12: hardware) */
  format: string | null;
  /** model (the adapter predicts the outputs) or conservative (since `modeWhy`) */
  mode: CodecMode;
  modeWhy: string | null;
  /** the context is still open */
  open: boolean;
  pictures: number;
  frames: number;
  /** pictures that failed */
  failed: number;
  /** decoders made again: for the adapter (restarts), for any reason with the history replayed (replays) */
  restarts: number;
  replays: number;
  /** the hold timer fired: a picture the guest waited for did not come (a stall); then a filler or a flush */
  holdFires: number;
  fillers: number;
  flushes: number;
  /** pictures a decoder dropped (no output after a flush) */
  dropped: number;
  /** outputs that came before the model said */
  early: number;
  /** configurations given up for the next (another packaging, prefer-software) after a decoder failed before its first picture */
  fallbacks: number;
  /** decode latency (ms, moving average) */
  latencyMs: number;
  /** the VideoFrames' colour space as WebCodecs reports it ("bt709 limited"; "null" parts: unspecified), which the browser converts by on the GPU path */
  colorSpace: string | null;
  /** the adapter's own (H.264: reorder, packaging) */
  adapter: Record<string, string | number | boolean>;
}
export interface VaStats {
  /** Guest streams (VADisplays) being served, and served in all. */
  connections: number;
  opened: number;
  /** Bytes from and to the guest. */
  bytesIn: number;
  bytesOut: number;
  /** VideoDecoders now. */
  decoders: number;
  /** Pictures the guest sent, hidden ones (VP9: no output of their own) among them. */
  pictures: number;
  hidden: number;
  /** Decoder outputs, pictures read back by the guest, and their bytes. */
  frames: number;
  readbacks: number;
  bytesRead: number;
  /** Chunks the host added (VP9: a show_existing_frame to take a hidden frame's picture). */
  showExisting: number;
  /** Pictures that failed (the guest gets the last good picture instead). */
  failed: number;
  /** Decoder errors (not reclamations), decoders the browser reclaimed, and flushes of a decoder that held a picture. */
  errors: number;
  reclaims: number;
  flushes: number;
  /** Decoders made again with the stream since its last key frame replayed, and the chunks replayed. */
  replays: number;
  replayed: number;
  /** Of those, the decoders made again because the codec adapter asked (H.264: a deeper reorder delay, conservative mode). */
  restarts: number;
  /** Hold-timer fires (stalls), fillers given, pictures dropped by decoders, contexts gone conservative, configuration fallbacks. */
  holdFires: number;
  fillers: number;
  dropped: number;
  modeSwitches: number;
  fallbacks: number;
  /**
   * Zero-copy output (va/PROTOCOL.md "export"): vaExportSurfaceHandle calls,
   * surfaces whose GPU resources the host fills now, pictures uploaded into
   * them (host memory to the renderer's textures, never through the guest)
   * with their bytes and time, and uploads that failed (no renderer, or the
   * resource is gone).
   */
  exports: number;
  exported: number;
  uploads: number;
  uploadBytes: number;
  uploadMs: number;
  uploadFailed: number;
  /**
   * Video processing outputs (BGRX surfaces) by path: drawn from the
   * VideoFrame into the surface's texture on the GPU (no CPU copy of the
   * pixels) and the time of those draws; converted from NV12 on the CPU
   * and uploaded as bytes (also counted in uploads) and the time of that;
   * and, per reason, the pictures that went the CPU way.
   */
  gpuUploads: number;
  gpuUploadMs: number;
  cpuConversions: number;
  cpuConversionMs: number;
  gpuFallbacks: Record<string, number>;
  /** VideoFrame.copyTo() to NV12 (for a hardware decoder's frame a GPU-to-CPU readback): count and total ms from start to done. */
  copies: number;
  copyMs: number;
  /** Decoder outputs (VideoFrames) not closed yet: held for their first consumer, or being copied to NV12. */
  framesHeld: number;
  /** The most held at once, and frames copied to NV12 because a context held more than its cap (va.md, Frame lifetime). */
  framesHeldPeak: number;
  framesEvicted: number;
  /** Every open context, and the last few destroyed. */
  contexts: VaContextStats[];
  /** Encoding (va-enc.ts): pictures, chunks, where their pixels came from, recoveries; its contexts in `list`. */
  encode: VaEncodeStats;
}
/** @internal VaHost.inject's test hooks. */
type VaInjection = "reclaim" | "error" | "flush" | "fail";
/**
 * @internal The GL host's side of zero-copy output (gl-gpu.ts GpuRenderer,
 * on this thread in both modes): host pixels into a guest resource's
 * texture, after the virtio-gpu commands before it. Absent without the
 * virtio-gpu device with 3D (`gl` and `gpu` in a browser with WebGL2): then
 * the guest gets readback only.
 */
interface VaGpu {
  write(resource: number, box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }, fill: (dst: Uint8Array) => void): boolean;
  /**
   * A VideoFrame drawn into a resource's texture on the GPU (its visible
   * picture top left, cropped to width x height): null when done, else why
   * not (nothing written). Absent: CPU conversion only.
   */
  video?(resource: number, frame: VideoFrameLike, width: number, height: number): string | null;
  /** A resource's texels back (rows from the top, the guest's layout), or null. */
  read?(resource: number, box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): Uint8Array | null;
}
interface PlaneLayout {
  offset: number;
  stride: number;
}
/** @internal The part of a VideoFrame the host uses. */
interface VideoFrameLike {
  readonly format: string | null;
  readonly timestamp: number;
  readonly visibleRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly colorSpace?: {
    primaries?: string | null;
    transfer?: string | null;
    matrix?: string | null;
    fullRange?: boolean | null;
  } | null;
  copyTo(dst: Uint8Array, opts?: {
    layout?: PlaneLayout[];
    format?: string;
    rect?: object;
  }): Promise<PlaneLayout[]>;
  close(): void;
}
/** The guest's VA-API decoder: vsock port 1024 served on this thread (vm.va). */
export declare class VaHost {
  #private;
  /** Resolves once the host listens. */
  readonly ready: Promise<string>;
  /** @internal Use createKernel({ va }). */
  constructor(vsock: Vsock, opts: VaOptions, log: (msg: string) => void, gpu?: VaGpu);
  /** idle (no guest connection yet), ready (profiles known), failed. */
  get status(): VaStatus;
  /** Streams, decoders, pictures, read-backs and errors; each context's decoder, mode, stalls and recoveries. */
  get stats(): VaStats;
  /**
   * @internal Test hook (VaOptions.verify): for a BGRX resource a picture
   * was drawn into on the GPU, the CPU path's conversion of that picture
   * (BGRX, the resource's size), to compare with what the compositor shows.
   */
  reference(resource: number): {
    width: number;
    height: number;
    data: Uint8Array;
  } | null;
  /**
   * @internal Test hook: change the options for contexts made from now on
   * (mode, holdExtra, hardwareAcceleration), and forget which profiles'
   * decoders disagreed with the model.
   */
  setOptions(o: Partial<VaOptions>): void;
  /** Ask WebCodecs now which profiles it decodes, as the guest's first connection would. */
  load(): Promise<VaStatus>;
  /**
   * @internal Test hook: every decoder as if the browser reclaimed it
   * ("reclaim"), it failed ("error") or held its picture ("flush"), or a
   * picture fails ("fail": decoded, its output dropped). Now on every
   * stream (not "fail"), or with `every` after every that many pictures
   * of each stream, now and later ones, `count` times (default always).
   * null clears them.
   */
  inject(what: VaInjection | null, opts?: {
    every?: number;
    count?: number;
  }): void;
  /** @internal The kernel exited. */
  shutdown(): void;
}
/** A kernel: a compiled module, its bytes, a Response, or a URL to fetch (a file path or file: URL on Node). */
export type KernelSource = WebAssembly.Module | BytesSource;
/** Bytes, a Response, or a URL to fetch (a file path or file: URL on Node). */
export type BytesSource = Uint8Array | ArrayBuffer | ArrayBufferView | Response | URL | string;
/** Download progress of the kernel or the initramfs. */
export interface DownloadProgress {
  stage: "download";
  what: "kernel" | "initrd";
  url: string;
  /** Bytes so far. */
  loaded: number;
  /** Expected bytes, 0 if unknown. */
  total: number;
  done: boolean;
}
export interface LoadOptions {
  what?: "kernel" | "initrd";
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  /**
   * Read a URL or path without fetch, or return undefined to fetch it (the
   * Node entry reads file: URLs and plain paths from disk).
   */
  readFile?: (src: URL | string) => Promise<Uint8Array> | undefined;
  /**
   * Want the SMP kernel: if the kernel is a bundle with an SMP patch
   * (kernel/tools/bundle.mjs --smp), load its bytes (no streaming
   * compile), patch them (kpatch.ts) and compile the result. A bundle
   * without one, or a compiled Module, is used as it is.
   */
  smp?: boolean;
}
/** Why loading or booting failed: the step that failed. */
export type BootFailStage = "support" | "download" | "compile" | "memory" | "boot";
/** An error from createKernel() or the loaders, tagged with the step that failed. */
export declare class BootError extends Error {
  stage: BootFailStage;
  constructor(stage: BootFailStage, message: string, options?: {
    cause?: unknown;
  });
}
/**
 * Download into memory, reporting progress (`onProgress`). With
 * content-encoding, content-length counts compressed bytes but the reader
 * yields decoded ones: x-decoded-length (if the server sends it) is used, else the total
 * is unknown (0).
 */
export declare function download(url: URL | string, opts?: LoadOptions): Promise<Uint8Array>;
/** Bytes of an initramfs (or any file) from any BytesSource. */
export declare function loadBytes(src: BytesSource, opts?: LoadOptions): Promise<Uint8Array>;
/**
 * Compile a kernel from any KernelSource. URLs and Responses are compiled
 * while they download (WebAssembly.compileStreaming) when the engine has it.
 */
export declare function loadKernelModule(src: KernelSource, opts?: LoadOptions): Promise<WebAssembly.Module>;
/** Events a backend reports for one TCP connection. */
export interface NetConnectionEvents {
  onConnect(): void;
  onData(data: Uint8Array): void;
  /** The remote side half-closed (no more data). */
  onEnd(): void;
  /** Data written earlier has been sent; `buffered` went down. */
  onDrain(): void;
  /** Called once, last; null for a clean close. */
  onClose(error: Error | null): void;
}
/** The host side of one TCP connection. */
export interface NetConnection {
  write(data: Uint8Array): void;
  /** Half-close (the guest sent FIN). */
  end(): void;
  /** Abort; no events follow. */
  destroy(): void;
  /** Stop delivering onData until resume(). */
  pause(): void;
  resume(): void;
  /** Bytes written but not yet sent. */
  readonly buffered: number;
}
/**
 * Transport for the guest's TCP connections and DNS lookups.
 *
 *   connect({ host, port }, events) -> NetConnection
 *   lookup(name) -> IPv4 dotted quads; reject with { code: "ENOTFOUND" }
 *     for NXDOMAIN, anything else becomes SERVFAIL
 *   close() (optional) drops every connection and the transport
 */
export interface NetBackend {
  connect(addr: {
    host: string;
    port: number;
  }, ev: NetConnectionEvents): NetConnection;
  lookup(name: string): Promise<string[]>;
  close?(): void;
}
export interface NetStackOptions {
  backend: NetBackend;
  log?: (msg: string) => void;
  /** TCP to the gateway (10.0.2.2) goes to 127.0.0.1. Default false. */
  hostLoopback?: boolean;
  /** MTU advertised by DHCP (option 26). */
  mtu?: number;
  /** The guest's MAC address, default 52:54:00:12:34:56. */
  mac?: string;
}
export interface NetStats {
  rx: number;
  tx: number;
  tcpOpened: number;
  dns: number;
}
export declare const ip4: (s: string) => number;
export declare const ip4str: (n: number) => string;
/** FIFO of bytes with random-access reads from the front. */
declare class ByteQueue {
  chunks: Uint8Array[];
  /** Offset into chunks[0]. */
  head: number;
  length: number;
  push(u8: Uint8Array): void;
  drop(n: number): void;
  copyTo(dst: Uint8Array, dstOff: number, offset: number, len: number): void;
}
interface Segment {
  sport: number;
  dport: number;
  seq: number;
  ack: number;
  flags: number;
  win: number;
  mss?: number;
  wscale?: number;
}
/** What sendTcp needs of a connection (a TcpConn, or a stand-in for a reset). */
interface TcpEndpoint {
  ip: number;
  port: number;
  gport: number;
  rcvNxt: number;
  sndUna: number;
  sendq: ByteQueue | null;
}
declare class TcpConn implements TcpEndpoint {
  stack: NetStack;
  key: string;
  gport: number;
  ip: number;
  port: number;
  irs: number;
  rcvNxt: number;
  iss: number;
  sndUna: number;
  sndNxt: number;
  mss: number;
  sndWscale: number;
  rcvWscale: number;
  sndWl: number;
  sendq: ByteQueue;
  state: "connecting" | "synrcvd" | "established" | "closed";
  remoteEof: boolean;
  finSent: boolean;
  guestFin: boolean;
  paused: boolean;
  rto: number;
  retries: number;
  timer: ReturnType<typeof setTimeout> | null;
  lastWnd: number;
  handle: NetConnection | undefined;
  constructor(stack: NetStack, key: string, gport: number, ip: number, port: number, seg: Segment);
  inFlight(): number;
  rcvWnd(): number;
  send(flags: number, seq: number, payloadLen?: number, opts?: Uint8Array | null): void;
  ack(): void;
  synAck(): void;
  /** Send whatever the guest's window allows, then FIN if due. */
  flush(): void;
  armTimer(): void;
  clearTimer(): void;
  onTimer(): void;
  connect(): void;
  refuse(err?: Error | null): void;
  close(): void;
  maybeDone(): void;
  /** A segment from the guest for this connection. */
  input(seg: Segment, payload: Uint8Array): void;
}
/**
 * The host end of the guest's network: pass it as the kernel's `net`
 * (kwnet) device. Terminates the guest's frames and bridges TCP and DNS to
 * `opts.backend`.
 */
export declare class NetStack implements NetDevice {
  backend: NetBackend;
  log: ((msg: string) => void) | undefined;
  hostLoopback: boolean;
  mtu: number | undefined;
  /** The guest's MAC. */
  mac: Uint8Array;
  gwMac: Uint8Array;
  guestMac: Uint8Array;
  net: number;
  mask: number;
  gw: number;
  dns: number;
  guest: number;
  tcp: Map<string, TcpConn>;
  ipId: number;
  /** Where frames for the guest go (set by attach()). */
  output: (frame: Uint8Array) => void;
  stats: NetStats;
  constructor(opts: NetStackOptions);
  /** Hook up to a Kernel (core/kernel.ts); called when the guest's driver initialises. */
  attach(kernel: Kernel): void;
  /** Frame from the guest. */
  send(frame: Uint8Array): void;
  /** Reset every TCP connection (the backend stays usable). */
  close(): void;
  emit(frame: Uint8Array): void;
  backendHost(ip: number): string | null;
  input(f: Uint8Array): void;
  arp(f: Uint8Array): void;
  ipv4(f: Uint8Array): void;
  /** Ethernet + IPv4 header for a reply to the guest; returns [frame, view]. */
  ipFrame(src: number, dst: number, proto: number, l4len: number, dstMac?: Uint8Array): [Uint8Array, DataView];
  l4csum(f: Uint8Array, src: number, dst: number, proto: number, off: number, len: number): number;
  sendUdp(src: number, sport: number, dst: number, dport: number, payload: Uint8Array, dstMac?: Uint8Array): void;
  sendTcp(c: TcpEndpoint, flags: number, seq: number, payloadLen: number, opts: Uint8Array | null, wnd: number): void;
  icmpInput(f: Uint8Array, _dv: DataView, src: number, dst: number, l4: number, end: number): void;
  icmpUnreachable(f: Uint8Array, l4: number, src: number, dst: number, code: number): void;
  udpInput(f: Uint8Array, dv: DataView, src: number, dst: number, l4: number, end: number): void;
  dhcp(p: Uint8Array): void;
  bytes4(n: number): number[];
  dnsQuery(q: Uint8Array, src: number, sport: number, dst: number): Promise<void>;
  tcpInput(f: Uint8Array, dv: DataView, _src: number, dst: number, l4: number, end: number): void;
}
/** The spec format. A spec may carry `v`; a factory refuses other versions. */
export declare const DEVICE_SPEC_VERSION = 1;
interface SpecCommon {
  /** Format version, default DEVICE_SPEC_VERSION. */
  v?: number;
  /** If it cannot be built, leave it out (and say why) instead of failing the boot. Later disks move up a letter. */
  optional?: boolean;
}
/** A disk image file on the host (Node). */
export interface FileDiskSpec extends SpecCommon {
  kind: "file";
  /** A path (relative paths are relative to the process's working directory). */
  path: string;
  /** Refuse writes. */
  readOnly?: boolean;
  /** Writes go to an in-memory overlay and are lost at exit (the CLI's --snapshot). */
  snapshot?: boolean;
}
/** An image served over HTTP with Range support, read lazily, under a copy-on-write overlay. */
export interface HttpDiskSpec extends SpecCommon {
  kind: "http";
  /** An absolute URL (a relative one is resolved against the page before it crosses to a worker). */
  url: string;
  chunkSize?: number;
  /** Browsers: keep the overlay in IndexedDB under this name (openHttpDisk's `name`); else it is in memory. */
  persist?: string;
  /** No overlay: the guest's writes fail (EROFS), and every range must come from the image first seen (HttpBase strict). `persist` is ignored. */
  readOnly?: boolean;
  /** Bytes to fetch ahead at open, in one streaming request (HttpBaseOptions.prefetch); default: what the image's distro header says; false: none. */
  prefetch?: number | false;
}
/** The persistent data disk (browsers: IndexedDB; see js/web/disk.ts openDataDisk()). */
export interface DataDiskSpec extends SpecCommon {
  kind: "data";
  /** A kwsparse image (gzipped or not), or "bundled": the kernel module's unkernel.datadisk section. */
  template: Uint8Array | "bundled";
  /** "persistent" (default; the caller holds the one-tab lock) or "snapshot" (memory only, e.g. another tab owns it). */
  mode?: "persistent" | "snapshot";
  /** Store name and format version (default "kwdata", "v1"). */
  name?: string;
  version?: string;
  snapshotLimit?: number;
  /** The disk's size in bytes: a new or smaller saved disk is made or grown this large, never shrunk (openDataDisk()'s `size`). */
  size?: number;
}
export type DiskSpec = FileDiskSpec | HttpDiskSpec | DataDiskSpec;
/** The network device: a NetStack over a backend. */
export interface NetSpec extends SpecCommon {
  kind: "net";
  backend: {
    kind: "direct";
  } | {
    kind: "wisp";
    servers: string | string[];
    headers?: Record<string, string>;
    /** Plain HTTP to these host names is answered with fetch() from these base URLs (net-fetch.ts fetchRoutes()). */
    routes?: Record<string, string>;
  };
  /** TCP to the gateway (10.0.2.2) goes to the host's 127.0.0.1 (direct only). */
  hostLoopback?: boolean;
  mtu?: number;
  mac?: string;
}
export type NetBackendSpec = NetSpec["backend"];
/** A disk spec (plain data), not a BlockDevice object. */
export declare function isDiskSpec(x: unknown): x is DiskSpec;
/** A network spec, not a NetDevice or NetBackend object. */
export declare function isNetSpec(x: unknown): x is NetSpec;
/** A disk that a spec marked optional could not be built: why. */
export interface SkippedDisk {
  index: number;
  kind: string;
  reason: string;
}
/**
 * What can be read off a disk from another thread (a WorkerKernel's
 * disks): the BlockDevice's flags and flush count, and for a CowDisk its
 * overlay, store and counters.
 */
export interface DiskState {
  /** Its index in the `disks` option (/dev/wda is the first disk that was built; skipped ones take no letter). */
  index: number;
  kind: string;
  size: number;
  readOnly: boolean;
  /** Flushes reach storage that outlives the host (a file, IndexedDB). */
  persistent: boolean;
  flushSeq: number;
  /** A save is in flight. */
  saving: boolean;
  /** CowDisk: blocks that differ from the base (stored or in memory). */
  overlayBlocks?: number;
  /** CowDisk: bytes of block data held in memory. */
  memBytes?: number;
  /** CowDisk with a store: blocks the store holds, its name, whether it was seeded now, and its identity. */
  storedBlocks?: number;
  store?: string;
  seeded?: boolean;
  identity?: string;
  /** CowDisk: why it is not the persistent disk (e.g. "in memory only, started from the template"). */
  notice?: string;
  /** CowDisk: saves no longer reach the store (detached before an import or reset). */
  detached?: boolean;
  cow?: CowDiskStats;
}
/**
 * distros.json: the index of the distro images that go with a base bundle
 * (unkernel.wasm), next to them in a release and in a build's
 * vendor/build/distro/ (guest/tools/distros-json.mjs writes it).
 */
export interface DistroIndex {
  /** KW_ABI_VERSION of the bundle's kwemu (null if unknown). */
  abi: number | null;
  /** The base id of the bundle's initramfs (`base-<hash>`, /kw/layer/usr/lib/kw-base; null if unknown). */
  base: string | null;
  /** Alpine first, then by name. */
  distros: DistroIndexEntry[];
}
/** One image in distros.json. */
export interface DistroIndexEntry {
  /** The distro's name (`[a-z0-9]+`), what /usr/lib/kw-distro says. */
  name: string;
  /** The image's file name, next to distros.json (`<name>.erofs`). */
  file: string;
  /** Its size in bytes. */
  size: number;
  /** Its SHA-256, hex. */
  sha256: string;
  /** The image id, /usr/lib/kw-image (`<name>-<version>-<hash>`). */
  image: string;
}
/** A distro image: a path or URL (Node: a file path, a file: URL or an http(s) URL; browsers: a URL, relative to the page), a disk spec, or a BlockDevice. */
export type DistroSource = string | URL | DiskSpec | BlockDevice;
/** What the host read off the distro image (structured-cloneable). */
export interface DistroInfo {
  /** Its path or URL (for messages). */
  name: string;
  /** The file system, from its superblock. */
  fs: "erofs" | "ext4";
  /** The volume label (the base looks for "kwroot"). */
  label: string;
  /** The file system UUID, hex. */
  uuid: string;
  /** Size in bytes. */
  size: number;
  /** The content identity a snapshot records (see DistroDisk). */
  identity: string;
  /** From its distro header (see the file comment), if it has one: the distro's name, the image id and the prefetch size. */
  distro?: string;
  image?: string;
  prefetch?: number;
}
/** The file system in the first bytes of an image, or null. */
export declare function probeDistro(head: Uint8Array): {
  fs: DistroInfo["fs"];
  label: string;
  uuid: string;
} | null;
/**
 * The distro image as a disk: read-only whatever the underlying disk
 * allows, with a content identity for snapshots (see the file comment).
 * open() reads its first 64 KiB and rejects an image that is neither erofs
 * nor ext4.
 */
export declare class DistroDisk implements BlockDevice {
  readonly inner: BlockDevice;
  readonly info: DistroInfo;
  readonly size: number;
  readonly readOnly = true;
  readonly flags = 1;
  readonly blockSize?: number;
  /** @internal Use DistroDisk.open(). */
  constructor(inner: BlockDevice, info: DistroInfo);
  /** Wrap `inner` (a DistroDisk is returned as it is). `name` is for messages (default: what its snapshot state says). */
  static open(inner: BlockDevice, { name, log }?: {
    name?: string;
    log?: (msg: string) => void;
  }): Promise<DistroDisk>;
  /** What an image over HTTP fetched (requests, bytes, the prefetch: HttpBaseStats); undefined for a file. */
  get stats(): HttpBaseStats | undefined;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  write(): never;
  snapshotState(): DiskSnapshotState;
  snapshotSeal(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
  /** Close the underlying disk (a FileDisk's descriptor), if it can be. */
  close(): void;
}
/**
 * A kernel or initrd source that crosses a thread: an absolute URL (the
 * worker fetches it, or reads it from disk on Node: file: URLs), bytes
 * (transferred), or, for the kernel, a WebAssembly.Module (it survives
 * postMessage within one process).
 */
type WorkerSource = string | Uint8Array;
/** Everything the worker needs to boot. It loads and compiles the kernel itself. */
interface WorkerBootSpec {
  kernel: WorkerSource | WebAssembly.Module;
  /** undefined = the module's bundled initramfs (if any), null = none. */
  initrd: WorkerSource | null | undefined;
  cmdline?: string;
  memoryMiB: number;
  memoryFallbackMiB?: number[];
  memory64?: boolean;
  jit?: boolean;
  /** CPUs for an SMP kernel (CreateKernelOptions.cpus); the worker starts their threads itself. */
  cpus?: number;
  consoleSize?: {
    cols: number;
    rows: number;
  };
  /** Disk and network specs (devices.ts), built by the worker's registry. */
  disks?: DiskSpec[];
  /** The distro image as a read-only disk spec (CreateKernelOptions.distro), the first disk. */
  distro?: DiskSpec;
  net?: NetSpec;
  /** Milliseconds between stats snapshots while running. */
  statsIntervalMs: number;
  /** Milliseconds the owner took to load and compile the kernel, when it did (the worker's stats report it). */
  compileMs?: number;
  /**
   * The display: true (640x480) or the size wanted. For a `display`
   * function the owner calls it and sends the result here and in
   * "display-size" messages; the worker answers the kernel from the latest.
   */
  display?: boolean | DisplaySize;
  /** A sound card: the sink's preferred rate, whether the owner wants "sound-wake"/"sound-chunk", and an optional shared PCM ring. */
  sound?: false | {
    rate?: number;
    chunks: boolean;
    ring?: SharedArrayBuffer;
  };
  /** A vsock device: the worker's kernel passes packets ("vsock" both ways); the protocol runs on the owner. */
  vsock?: boolean;
  /** kwshm: the worker's kernel offers it and runs the owner's "shm" calls (the copies happen there). */
  shm?: boolean;
  /**
   * virtio-gpu (gpu option): the device model runs in the worker, next to
   * the kernel; 2D frames come as the display's. "virgl": with 3D, whose
   * renderer is on the owner (gl-gpu.ts): the worker's VirglGpuBackend
   * sends "gpu-start" (the guest's first 3D use) and "gpu" requests, and
   * gets "gpu-init" (once the renderer is up) and "gpu-reply".
   */
  gpu?: boolean | "virgl";
  /**
   * The shared transport's control block (worker-shared.ts): console and
   * evdev input and frame requests go through it instead of "input",
   * "evdev" and "frame-want" messages. Absent: messages only.
   */
  shared?: SharedArrayBuffer;
  /**
   * With the shared transport and more than one CPU: the console ring
   * (console-ring.ts) the owner reads; every CPU writes its console output
   * there instead of "output" messages.
   */
  console?: SharedArrayBuffer;
  /**
   * Resume this snapshot instead of booting (CreateKernelOptions.restore);
   * its memory is transferred. The worker builds the disks and devices from
   * the spec and checks them against it, as inline.
   */
  restore?: KernelSnapshot;
  /** Sample guest pcs (CreateKernelOptions.profile); the worker starts the sampler thread itself. */
  profile?: ProfileOptions;
}
/** An ExitResult with `error` reduced to something structured clone accepts. */
interface WorkerExit {
  code: number;
  reason: string;
  kind: ExitKind;
  error?: unknown;
}
/** Owner -> worker. */
type ToWorker = {
  t: "boot";
  spec: WorkerBootSpec;
} | {
  t: "input";
  data: Uint8Array | string;
} | {
  t: "resize";
  cols: number;
  rows: number;
} | {
  t: "sync";
  id: number;
  timeout?: number;
} | {
  t: "stop";
  code?: number;
  reason?: string;
} |
/** The owner's AbortSignal fired: abort the downloads, or stop the kernel once booted. */
{
  t: "abort";
} |
/**
 * An operation on disk `index` (built order), answered by "disk-result":
 * "detach" stops its saves, waits for the one in flight and closes its
 * store (before the owner replaces the store); "export" returns its
 * content as kwsparse parts (CowDisk.exportParts(): Blobs).
 */
{
  t: "disk";
  id: number;
  index: number;
  op: "detach" | "export";
} |
/** Evdev calls, in order (EVDEV_OP triples). */
{
  t: "evdev";
  ops: number[];
} |
/** The display size wanted now (kwfb asks at the next first open); `hotplug`: virtio-gpu offers it (updateDisplaySize()). */
{
  t: "display-size";
  size: DisplaySize;
  hotplug?: boolean;
} |
/**
 * A frame credit: send one "frame" (id = this id) once the picture may
 * have changed (at once with `now`, even if unchanged). `buf` is a
 * returned frame buffer for the worker to reuse.
 */
{
  t: "frame-want";
  id: number;
  buf?: ArrayBuffer;
  now?: boolean;
} |
/**
 * The sink's answer to "sound-chunk" `seq`: frames queued after it, at
 * `at` (performance.timeOrigin + performance.now() on the owner).
 */
{
  t: "sound-queued";
  seq: number;
  frames: number;
  at: number;
} |
/** Shared transport: the owner wrote into the control block while the kernel waited idle. */
{
  t: "kick";
} |
/** vsock packets for the guest (header and payload each; transferred), in order; the shared transport puts them in its ring instead (worker-shared.ts). */
{
  t: "vsock";
  packets: Uint8Array[];
} |
/** A kwshm call (shm.ts) for the worker's ShmDevice; answered by "shm-result" with the same rid. */
{
  t: "shm";
  rid: number;
  call: ShmCall;
} |
/** virtio-gpu 3D: the renderer's capsets and formats (or why there is none). */
{
  t: "gpu-init";
  init?: GpuInit;
  error?: string;
} |
/** virtio-gpu 3D: the answer to a "gpu" request with that rid (a readback's bytes transferred). */
{
  t: "gpu-reply";
  rid: number;
  reply: GpuReply;
} |
/**
 * Save the machine (KernelInstance.snapshot()); answered by
 * "snapshot-result" with the same id. With `commit` (SnapshotOptions)
 * the worker first posts "snapshot-held" and keeps the kernel at its
 * consistent point until "snapshot-commit" (or `commitTimeoutMs`); with
 * `hold` also, after a successful commit, until "snapshot-release" (no
 * timeout: a page frozen for hours meanwhile changes nothing).
 */
{
  t: "snapshot";
  id: number;
  stop?: boolean;
  commit?: boolean;
  commitTimeoutMs?: number;
  hold?: boolean;
  dropCaches?: boolean;
} |
/** The owner's commit of "snapshot-held" `id` succeeded (the kernel then stops, or with `hold` waits on) or failed (it goes on). */
{
  t: "snapshot-commit";
  id: number;
  ok: boolean;
  error?: string;
} |
/** The owner's hold decision for snapshot `id` (after a successful commit): stop at the snapshot, or go on. */
{
  t: "snapshot-release";
  id: number;
  stop: boolean;
} |
/** The profile so far (KernelHandle.profile()); answered by "profile-result" with the same id. */
{
  t: "profile";
  id: number;
};
/** Worker -> owner. Output, log and progress keep their order relative to "started" and "exit". */
type FromWorker =
/** First message: the worker runs (a web binding revokes its Blob URL then), and whether it has JSPI. */
{
  t: "ready";
  jspi: boolean;
} | {
  t: "output";
  bytes: Uint8Array;
} | {
  t: "log";
  msg: string;
} | {
  t: "progress";
  p: BootProgress;
} | {
  t: "started";
  cmdline: string;
  memoryMiB: number;
  memory64: boolean;
  stats: InstanceStats;
  disks: DiskState[];
  skipped: SkippedDisk[];
  distro?: DistroInfo;
} | {
  t: "boot-error";
  stage: string;
  message: string;
} | {
  t: "stats";
  stats: InstanceStats;
  disks: DiskState[];
} | {
  t: "synced";
  id: number;
  ok: boolean;
} |
/** A disk failed to save a flush (CowDisk onError). */
{
  t: "disk-error";
  index: number;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
} | {
  t: "disk-result";
  id: number;
  ok: true;
  value?: unknown;
} | {
  t: "disk-result";
  id: number;
  ok: false;
  error: string;
} |
/** A program opened the display or changed its mode, or the last one closed it (null). */
{
  t: "display";
  mode: DisplayMode | null;
} |
/** The evdev open mask changed (InputHost.mask). */
{
  t: "input-state";
  mask: number;
} |
/**
 * The answer to "frame-want" `id`: the mode, and the pixels as packed
 * XRGB8888 rows (width * 4 bytes; transferred), or null when the picture
 * did not change since the last frame sent or no program has the display.
 */
{
  t: "frame";
  id: number;
  mode: DisplayMode | null;
  data: Uint8Array | null;
} |
/**
 * Shared transport: the frame triple buffer for the mode in the next
 * "display" message (`cap` bytes per slot), or null when none could be
 * made (frames then go by "frame-want" and "frame").
 */
{
  t: "frame-buffer";
  buffer: SharedArrayBuffer | null;
  cap: number;
} |
/** Shared transport: the answer to FRAME_NOW `id` (and earlier ones); the frame is in the buffer. */
{
  t: "frame-ready";
  id: number;
  mode: DisplayMode | null;
} | {
  t: "sound-state";
  state: SoundState;
  event: SoundEvent;
  n: number;
} |
/** PCM the guest played (transferred); answered by "sound-queued" (throttled). */
{
  t: "sound-chunk";
  seq: number;
  format: SoundFormat;
  data: Uint8Array;
} |
/** Sound ring: it became non-empty; the owner drains it into onChunk (and onState, in the ring's order). */
{
  t: "sound-wake";
} |
/** vsock packets from the guest (transferred), in order; posted from inside the import once 64 KiB or 64 packets are waiting, else per microtask. */
{
  t: "vsock";
  packets: Uint8Array[];
} |
/** virtio-gpu 3D: a command for the owner's renderer (data transferred), answered by "gpu-reply" when it has a rid. */
{
  t: "gpu";
  req: GpuRequest;
  rid?: number;
} |
/** virtio-gpu 3D: the guest's first 3D use: load the renderer if it is not loaded or loading ("gpu-init" follows). */
{
  t: "gpu-start";
} |
/** virtio-gpu 3D: the driver reset the device. */
{
  t: "gpu-reset";
} |
/** The kernel's kwvsock started (VsockDevice onInit). */
{
  t: "vsock-ready";
  guestCid: number;
  rxMax: number;
} |
/**
 * The answer to "shm": the result (read's bytes transferred), or the
 * ShmError's code and message. After "shm-share", an info result also
 * carries the export's page runs for the owner (`place`; absent when no
 * slot was free).
 */
{
  t: "shm-result";
  rid: number;
  ok: true;
  value: ShmCallResult;
  place?: ShmPlace;
} | {
  t: "shm-result";
  rid: number;
  ok: false;
  code: string;
  message: string;
} |
/** Shared transport: the answer to a read from the control block's shm ring (worker-shared.ts), bytes transferred. */
{
  t: "shm-read";
  seq: number;
  ok: true;
  data: Uint8Array;
} | {
  t: "shm-read";
  seq: number;
  ok: false;
  code: string;
  message: string;
} |
/**
 * Shared transport with a shared kernel memory (an SMP kernel), before
 * "started": that memory and ShmShareServer's slot table, for reads in
 * place on the owner's thread (shm.ts, ShmInPlace).
 */
{
  t: "shm-share";
  memory: SharedArrayBuffer;
  table: SharedArrayBuffer;
} |
/** kwshm announced an export's page list (new, or refreshed). */
{
  t: "shm-attach";
  info: ShmInfo;
} |
/** kwshm withdrew an export. */
{
  t: "shm-detach";
  id: number;
} |
/**
 * A "snapshot" with `commit` at the kernel's consistent point, its disks
 * durable: the snapshot (memory transferred) for the owner to commit; the
 * kernel waits for "snapshot-commit".
 */
{
  t: "snapshot-held";
  id: number;
  snapshot: KernelSnapshot;
} |
/**
 * The answer to "snapshot": the snapshot (its memory transferred; none
 * after "snapshot-held", whose snapshot it confirms), or why it failed
 * (`commitFailed`: a SnapshotCommitError, the kernel went on unless it
 * ended). Always posted before "exit", for every "snapshot" (a snapshot
 * with stop or a commit ends the kernel).
 */
{
  t: "snapshot-result";
  id: number;
  ok: true;
  snapshot?: KernelSnapshot;
} | {
  t: "snapshot-result";
  id: number;
  ok: false;
  error: string;
  commitFailed?: boolean;
  timedOut?: boolean;
} |
/** The answer to "profile" (undefined: no profile option, or the kernel had none). */
{
  t: "profile-result";
  id: number;
  report?: ProfileReport;
} |
/** Sent after every save in flight has settled, so the worker can be ended at once; with the profile option, its last report. */
{
  t: "exit";
  result: WorkerExit;
  stats: InstanceStats;
  disks: DiskState[];
  profile?: ProfileReport;
};
/** The owner's end: a started worker running serveKernel(). */
interface WorkerEndpoint {
  post(msg: ToWorker, transfer?: ArrayBuffer[]): void;
  listen(handlers: {
    message(msg: FromWorker): void;
    /** An uncaught error in the worker. */
    error(err: unknown): void;
    /** The worker thread ended (also after terminate()). */
    exit(): void;
  }): void;
  terminate(): void;
}
/** Which way the owner and the kernel talk: on one thread, or worker mode by messages or with shared memory. */
export type KernelTransport = "inline" | "messages" | "shared";
/**
 * Can this thread use the shared transport: SharedArrayBuffer exists, the
 * context is not a non-isolated browser page, and one survives a post.
 */
export declare function sharedMemoryAvailable(): boolean;
/** The options WorkerKernel takes over from createKernel(). */
export interface WorkerKernelOptions {
  onOutput?: (bytes: Uint8Array) => void;
  onProgress: (p: BootProgress) => void;
  log: (msg: string) => void;
  onDiskError?: (index: number, error: unknown) => void;
  display?: DisplayOption;
  onDisplay?: (mode: DisplayMode | null) => void;
  onInput?: (state: InputState) => void;
  sound?: SoundOption;
  /** The vsock protocol runs here (VsockHost); the worker's kernel only passes packets. */
  vsock?: boolean | VsockOption;
  /** kwshm: the API (ShmClient) runs here, the calls run in the worker. */
  shm?: boolean;
  /** The shared transport's control block (worker-shared.ts), also sent in the boot spec; absent: messages. */
  shared?: SharedArrayBuffer;
  /** The console ring (console-ring.ts), also sent in the boot spec: read here. */
  console?: SharedArrayBuffer;
  /** The sound ring (sound-ring.ts), also sent in the boot spec: read here or by sink.onRing. */
  soundRing?: SharedArrayBuffer;
  /** virtio-gpu 3D: the renderer side here (gl-gpu.ts), serving the worker's "gpu" requests. */
  gpu?: GpuRenderer;
}
/**
 * A kernel running in a worker: the surface of KernelInstance, proxied over
 * messages. There is no low-level `kernel` object (it lives in the worker).
 * stats() returns the latest snapshot the worker sent (every 500 ms while
 * running, and a final one at exit) with uptimeMs brought up to date. The
 * display, evdev and sound work as inline, with the differences that a
 * thread boundary makes (worker-devices.ts): frame() returns the latest
 * frame the worker sent (readFrame() waits for a fresh one), evdev's open
 * state and return values are this thread's mirror, and a `display`
 * function is asked here, at boot, on resize() and on updateDisplaySize().
 */
export declare class WorkerKernel implements KernelHandle {
  #private;
  /** The command line it booted with. */
  cmdline: string;
  /** The distro image (the `distro` option) as the worker read it, or undefined. */
  distro: DistroInfo | undefined;
  /** Memory actually allocated, in MiB. */
  memoryMiB: number;
  memory64: boolean;
  /** Settles when the kernel exits (see KernelInstance.exited), or 255 "fatal" if the worker dies. */
  readonly exited: Promise<ExitResult>;
  /** @internal Resolves once the kernel has started; rejects with a BootError. */
  readonly started: Promise<void>;
  /** @internal Use createKernel({ worker: true }). */
  constructor(endpoint: WorkerEndpoint, opts: WorkerKernelOptions);
  /** @internal Loading the kernel failed before the boot message was sent: end the worker. */
  abandon(reason: string): void;
  /** Console output as a stream (see KernelInstance.output). */
  get output(): ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /**
   * How console and evdev input, frames, shm reads and vsock packets for
   * the guest reach the worker: "shared" (SharedArrayBuffers, read by the
   * worker while the kernel runs, within about a millisecond) or "messages"
   * (handled when the kernel yields, up to 20 ms while the guest is busy).
   * Everything else is messages either way.
   */
  get transport(): KernelTransport;
  /** Console input as a stream. */
  get input(): WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /**
   * See KernelHandle.updateDisplaySize(): a `display` function is asked
   * here (inline the kernel calls it itself when it needs a size; the
   * worker cannot), and the size goes to the worker, which answers kwfb's
   * next first open with it and lets virtio-gpu offer it. resize() sends a
   * function's new size too, for kwfb only.
   */
  updateDisplaySize(size?: DisplaySize): void;
  /** @internal The display option as it goes in the boot message. */
  get bootDisplay(): boolean | DisplaySize;
  /**
   * The keyboard, mouse and tablet (with the display option): InputHost's
   * methods, forwarded to the worker in order. The open state is a mirror
   * of the worker's (reported with onInput), so it may lag by a yield.
   */
  get evdev(): Evdev | undefined;
  /** With the display option: the mode while a program has /dev/fb0 open (as last reported), else null. */
  get display(): {
    readonly mode: DisplayMode | null;
  } | undefined;
  /**
   * The latest frame the worker sent, as RGBA (see KernelInstance.frame()),
   * or null with no display, while no program has it open, or before the
   * first frame arrived. Each call also asks for a newer one (at most two
   * requests are outstanding; the worker answers once the picture may have
   * changed). Compare frameSeq to skip repainting an unchanged frame.
   */
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** Ask for a newer frame without converting the current one (see frame()). */
  requestFrame(): void;
  /** Counts frames received with new pixels: frame() has something new when it changed. */
  get frameSeq(): number;
  /** A fresh frame: a round trip to the worker (with messages at most about 20 ms while the guest is busy; shared, about a millisecond). */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
  /**
   * With the vsock option: listen() and connect() as inline (VsockHost).
   * The protocol runs on this thread; the packets for the guest cross to
   * the worker through the shared transport's ring (taken at the kernel's
   * next clock read, about a millisecond) or, without it, as messages,
   * which it takes while the kernel is suspended (up to 20 ms while the
   * guest is busy); the guest's come back as messages, posted at the
   * kernel's next task switch or yield.
   */
  get vsock(): VsockHost | undefined;
  /** A program on its own pty or on pipes, and exec(), as inline (tty.ts; the protocol runs on this thread). */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  /** Take over a detachable session, as inline (tty.ts attachPty(); the protocol runs on this thread). */
  attach(session: string | TtySessionSnapshot, opts?: AttachOptions): Promise<Pty>;
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /** A raw byte stream to a TCP server on the guest's loopback, as inline (kwtty's CONNECT; the protocol runs on this thread). */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /** HTTP/1.1 to a server on the guest's loopback, as inline (http.ts over connect()). */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Host file systems in the guest, as inline (mounts.ts): the 9p server and the handlers run on this thread. */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  get mounts(): ReadonlyMap<string, Mount>;
  /** @internal createKernel's `mounts`, once the kernel runs. */
  startMounts(list: ReturnType<typeof parseMounts>): void;
  /** Host commands, as inline (commands.ts): the handlers run on this thread. */
  addCommand(name: string, handler: HostCommand, opts?: {
    timeout?: number;
  }): Promise<void>;
  removeCommand(name: string, opts?: {
    timeout?: number;
  }): Promise<void>;
  get commands(): ReadonlyMap<string, HostCommand>;
  /** @internal createKernel's `commands`, once the kernel runs. */
  startCommands(list: ReturnType<typeof parseCommands>): void;
  /** @internal createKernel's `gl`, once the kernel runs: served on this thread, as vsock is. */
  attachGl(gl: GlHost | undefined): void;
  /** With the gl option: the GL renderer's host side (gl.ts), on this thread as inline. */
  get gl(): GlHost | undefined;
  /** @internal createKernel's `vk`, once the kernel runs: served on this thread, as vsock is. */
  attachVk(vk: VkHost | undefined): void;
  /** With the vk option: the Vulkan renderer's host side (vk.ts), on this thread as inline. */
  get vk(): VkHost | undefined;
  /** @internal createKernel's `va`, once the kernel runs: served on this thread, as vsock is. */
  attachVa(va: VaHost | undefined): void;
  /** With the va option: the VA-API decoder's host side (va.ts), on this thread as inline. */
  get va(): VaHost | undefined;
  /**
   * With the shm option: open(), create() and openId() as inline. Each call
   * is a round trip to the worker, which runs it when the kernel next
   * suspends (up to 20 ms while the guest is busy), except reads: in place
   * on this thread where the worker shared the kernel's memory (an SMP
   * kernel with the shared transport: inPlace, readSync() and views() as
   * inline), else with the shared transport at the kernel's next clock read
   * (worker-shared.ts), else as a round trip; the worker copies and
   * transfers the bytes.
   */
  get shm(): ShmClient | undefined;
  /** With the sound option: the playback state, as the worker last reported it. */
  get sound(): {
    readonly state: SoundState;
    readonly playing: boolean;
  } | undefined;
  /**
   * See KernelInstance.sync(): a round trip to the worker, which raises
   * the sync IRQ and waits for every persistent disk to complete a flush
   * issued after it (true), or `timeout` ms (false). A request still
   * open when the kernel exits or the worker dies resolves false if a
   * persistent disk was attached (nothing confirmed it), else true. After
   * the exit it resolves true at once: the worker reported the exit only
   * after the saves in flight had settled.
   */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine, as KernelInstance.snapshot(): the worker takes the
   * snapshot and transfers it here (its memory is not copied again).
   * Resume it with createKernel({ restore }), in worker mode or inline.
   * Rejects while host file systems are mounted, as inline.
   */
  snapshot(opts?: SnapshotOptions): Promise<KernelSnapshot>;
  /**
   * Stop the kernel now (see KernelInstance.stop()). The worker confirms
   * and is then ended; if it does not answer within 2 s it is ended anyway.
   */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  /**
   * The disks' state as of the latest snapshot (every 500 ms, and final at
   * exit): flags, flush count, and for a CowDisk its overlay, store and
   * counters. Indexed as the `disks` option; see skippedDisks for the
   * optional ones left out.
   */
  get disks(): readonly DiskState[];
  /** Disks whose spec was optional and could not be built, and why. */
  get skippedDisks(): readonly SkippedDisk[];
  /**
   * Stop disk `index` (a CowDisk with a store) saving: the worker detaches
   * it, waits for the save in flight and closes its store, so this thread
   * may then replace or clear the store (the guest's later writes stay in
   * the worker's memory). Rejects if the kernel has exited.
   */
  detachDisk(index: number): Promise<void>;
  /** Disk `index`'s current content as a kwsparse image in parts (CowDisk.exportParts(); gzipBlob() compresses them). */
  exportDisk(index: number): Promise<{
    size: number;
    blocks: number;
    parts: BlobPart[];
  }>;
  /** With the profile option: the samples so far (a round trip), or after the exit the worker's last report. */
  profile(): Promise<ProfileReport | undefined>;
  /** The latest snapshot from the worker, with uptimeMs brought up to date while it runs. */
  stats(): InstanceStats;
}
/**
 * Boot progress, in order: downloads (with compile overlapping them when
 * streaming), memory, instantiate, start. Worker mode adds "worker" (the
 * worker runs, and whether it has JSPI) before "memory": it may come
 * before, during or after the download and compile, which run on the
 * owner's thread while the worker starts (unless compileInWorker).
 */
export type BootProgress = {
  stage: "worker";
  jspi: boolean;
} | DownloadProgress | {
  stage: "compile";
} | {
  stage: "compiled";
  ms: number;
  memory64: boolean;
} | ({
  stage: "memory";
} & MemoryStage) | {
  stage: "instantiate";
} | {
  stage: "start";
  cmdline: string;
};
export interface CreateKernelOptions {
  /**
   * Resume a snapshot (KernelInstance.snapshot()) instead of booting: the
   * same kernel build; initrd, cmdline and memoryMiB are ignored. In
   * worker mode the memory is copied to the worker (see
   * WorkerOption.transferRestore). `disks` must be the snapshot's disks,
   * unchanged since it was taken (same identity and write generation); otherwise createKernel
   * rejects, naming the disk, and the caller can boot normally instead.
   * The devices must be the snapshot's too: display, sound, vsock, shm
   * and network each given, or not, as when it was taken (a network with
   * the same MAC), or createKernel rejects. vsock sessions (spawn(),
   * exec(), connect(), fetch(), listeners' connections) and the guest's
   * TCP connections do not survive: the guest's ends are reset, except
   * detachable terminal sessions (spawn() with `detachable`), which the
   * guest keeps detached for attach() (the snapshot's `ttys`). Host file
   * systems do (inline only): `mounts` must give one for each mount path
   * in the snapshot, read-only as it was, and the guest's open files on
   * it are opened again by path (a file gone meanwhile answers ESTALE);
   * nothing of their files is in the snapshot. Other `mounts` are
   * mounted as at boot. `cpus` defaults to the snapshot's CPU count, and
   * another count rejects (every task resumes on the CPU it ran on).
   */
  restore?: KernelSnapshot;
  /**
   * The kernel: a URL (a path or file: URL on Node), bytes, a Response or
   * a compiled WebAssembly.Module. Default: the bundled kernel
   * (unkernel.wasm next to the entry: the kernel and the base initramfs,
   * which boots `distro`, or without one the base shell).
   */
  kernel?: KernelSource;
  /**
   * The initramfs (a cpio, optionally gzipped). Default (undefined): the
   * one bundled into the kernel, if any; null boots without one.
   */
  initrd?: BytesSource | null;
  /**
   * Kernel command line. Default: the kernel's bundled one if its bundled
   * initramfs is used; else "console=hvc0 root=/dev/wda rw" with disks and
   * no initramfs; else "console=hvc0 rdinit=/init".
   */
  cmdline?: string;
  /** Kernel memory (fixed for the run). Default 2048 on Node; on the web, autoMemoryMiB(). */
  memoryMiB?: number;
  /** Smaller sizes to try in order if memoryMiB cannot be allocated. Default none on Node; DEFAULT_MEMORY_FALLBACK_MIB on the web. */
  memoryFallbackMiB?: number[];
  /** Memory type; default: detected from the module. */
  memory64?: boolean;
  /**
   * kwblk disks: /dev/wda, wdb, ... (CowDisk, HttpBase-backed disks,
   * FileDisk on Node, or your own BlockDevice), or specs (devices.ts:
   * plain data such as { kind: "file", path } on Node or { kind: "data",
   * template: "bundled" } in browsers), which the instance builds, owns
   * and closes at exit. Worker mode takes specs only.
   */
  disks?: Array<BlockDevice | DiskSpec>;
  /**
   * A distro image for the base initramfs of the bundled kernel
   * (unkernel.wasm, which mounts the disk labelled kwroot read-only under
   * the root overlay and runs its /sbin/init; without one it starts a
   * base shell: busybox, the kw tools, kwtty): an erofs or ext4 image, attached read-only as the first
   * disk (/dev/wda), before `disks` (whose indices, as in DiskState,
   * onDiskError and WorkerKernel.detachDisk(), stay those of `disks`). A
   * path or file: URL (Node), an http(s) URL served with Range support,
   * read lazily and never cached across sessions (browsers: relative to
   * the page), a disk spec (made read-only: { kind: "file", path } on
   * Node, { kind: "http", url }), or a BlockDevice (inline only; wrapped
   * read-only). The guest never writes it. In a snapshot it is the first
   * disk, identified by its content (DistroDisk). Needs an initramfs: the
   * bundled one by default, or `initrd`, unless `cmdline` is given. On
   * Node, fetchDistro("alpine") gives the path of a named one (from the
   * release of the package's version, downloaded once); in browsers, pass
   * the URL of an image you host.
   */
  distro?: DistroSource;
  /**
   * Network: a NetBackend (wrapped in a NetStack), a NetStack, any
   * NetDevice, or a spec ({ kind: "net", backend: { kind: "direct" } } on
   * Node, or { kind: "wisp", servers }). Default: none (the guest has no
   * eth0). The instance closes it (and its backend) when the kernel exits.
   * Worker mode takes a spec only.
   */
  net?: NetDevice | NetBackend | NetSpec;
  /** A disk built from a spec failed to save a flush (e.g. QuotaExceededError; the guest gets EIO for it). */
  onDiskError?: (index: number, error: unknown) => void;
  /**
   * kwemu's JIT tier: hot guest code is compiled to WebAssembly modules at
   * run time (synchronously, a few KiB each). Default true; false runs the
   * interpreter only.
   */
  jit?: boolean;
  /**
   * CPUs to give an SMP kernel (a kernel built with CONFIG_SMP; kernel.md,
   * SMP): each runs in its own thread on a shared memory, so it needs a
   * platform that starts CPU threads (Platform.spawnCpu: Node, and browsers
   * where the kernel runs in a worker of a cross-origin isolated page, as
   * `worker: true` does). Default 1, or with `restore` the snapshot's. A UP
   * kernel ignores it, and so does a thread that cannot start CPUs (both
   * with a log line; a restore then rejects); stats().cpus says how many
   * it got.
   */
  cpus?: number;
  /**
   * A display: the guest gets /dev/fb0 (kwfb, XRGB8888), and frame() /
   * display read what it draws. true = 640x480; or a size; or a function
   * returning the size wanted each time a program first opens the device
   * (e.g. the window's size; the kernel caps it at 1M pixels by dividing
   * by an integer; in worker mode it is asked ahead of time instead, see
   * WorkerOption). A program may set its own size; onDisplay reports
   * every change. Default false (no device).
   */
  display?: DisplayOption;
  /** A guest program opened the display or changed its mode (the mode), or the last one closed it (null). */
  onDisplay?: (mode: DisplayMode | null) => void;
  /**
   * With a display the guest also gets a keyboard and a mouse (evdev,
   * /dev/input/event0 and event1). Called when a program opens or the
   * last one closes them; send keys and motion through `evdev` only
   * while they are open, and to the console otherwise.
   */
  onInput?: (state: InputState) => void;
  /**
   * A sound card (kwsnd: ALSA hw:0,0 and OSS /dev/dsp, playback only):
   * true (output dropped) or a sink that receives the PCM chunks with
   * their format and the playback state (sound.ts). Default false (no card).
   */
  sound?: SoundOption;
  /**
   * A vsock device (kwvsock: AF_VSOCK, guest CID 3, host CID 2): `vsock`
   * on the instance listens for guest connections and connects to guest
   * listeners, each a byte stream (vsock.ts), and spawn() and exec() run
   * programs through it (tty.ts). true, or options. Default true; false:
   * the guest has no vsock transport.
   */
  vsock?: boolean | VsockOption;
  /**
   * kwshm: `shm` on the instance opens guest shmem files (by name in
   * /dev/shm, or by the id a guest program got from /dev/kwshm) and reads
   * and writes their pages in place (shm.ts). Default false: no device.
   */
  shm?: boolean;
  /**
   * A virtio-gpu device (kwvirtio, virtio-gpu.ts): the guest gets
   * /dev/dri/card0 and renderD128 (driver virtio_gpu), and while a client
   * has a framebuffer on its scanout, frame() and `display` show that
   * instead of /dev/fb0's pixels. With `gl` too, where WebGL2 is (a
   * browser), the device has 3D: the guest's Mesa renders through its
   * virtio_gpu (virgl) driver on gl's renderer, and a GL client's scanout
   * is presented from its texture (`gl.gpu.drawFrame()`; gl-gpu.ts).
   * Otherwise it is 2D: KMS with dumb buffers. Implies `display` (whose
   * size the scanout offers) when that is not given. Default false: no
   * virtio device.
   */
  gpu?: boolean;
  /** @internal The virtio-gpu device's 3D side in the kernel's worker (worker-serve.ts); createKernel makes its own from `gl`. */
  gpuBackend?: GpuBackend;
  /**
   * Host file systems to mount in the guest (mounts.ts): guest paths to a
   * file system (an Fs such as MemoryFs or nodeFs(), or a plain object
   * tree of files: strings, bytes, functions, subdirectory objects), or to
   * { fs, readOnly, timeout, requestTimeout }. Each is served over 9p on
   * vsock and mounted by the guest's kw9p, through kwtty, once it answers.
   * spawn() and exec() wait for them; if one failed, the calls that waited
   * reject with its MountError (it is logged too). Needs vsock (the default).
   */
  mounts?: MountsOption;
  /**
   * Host commands (commands.ts): names to functions of the host that the
   * guest runs as programs. Each gets a link /run/kw/bin/NAME to the
   * guest's kwbox, which runs kwcmd (first on PATH; not "kwcmd" or "kwbox"),
   * made through kwtty once it answers; a
   * guest process that runs NAME is a normal process, and the function is
   * called with its arguments, environment, stdin, stdout and stderr, and
   * what it returns ends that process. spawn() and exec() wait for the
   * links; if making them failed, the calls that waited reject with the
   * CommandError (it is logged too). Needs vsock (the default). With
   * `restore`, the snapshot's links are replaced by these.
   */
  commands?: CommandsOption;
  /**
   * Guest GL (gl.ts, .agents/gl.md): the guest's Mesa renders through
   * virglrenderer compiled to wasm on one WebGL2 context of this thread
   * (an OffscreenCanvas; frames come back to the guest by readback). The
   * module (virgl.mjs and virgl.wasm next to the web entry) is fetched only
   * with `gl`, and only on the guest's first GL use (`gl.eager`: before the
   * boot); the host listens on vsock port 1019 and starts the guest's
   * forwarder (`kwbox vtest`) through kwtty, after which GL
   * programs run with GALLIUM_DRIVER=virpipe LIBGL_ALWAYS_SOFTWARE=1
   * (Debian: Mesa from apt). true, or options. Needs vsock and WebGL2:
   * where there is none (Node) it is ignored with a log line, unless
   * `renderer` gives one. With `gpu` the same renderer gives the virtio-gpu
   * device 3D (see gpu). Default false.
   */
  gl?: GlOption;
  /**
   * Guest Vulkan (vk.ts, vk/PROTOCOL.md): the guest's ICD
   * (/usr/lib/kw/libvulkan_kw.so, found by the Vulkan loader through
   * /usr/share/vulkan/icd.d/kw_icd.json) sends Vulkan over vsock port 1021
   * to a renderer on this thread's WebGPU device; SPIR-V is translated to
   * WGSL by kwvk-naga.wasm (next to the web entry). The device, the
   * renderer and the translator load only on the guest's first Vulkan
   * instance. true, or options. Needs vsock and WebGPU: where there is no
   * navigator.gpu (Node) it is ignored with a log line, unless `vk.device`
   * gives a device. Default false.
   */
  vk?: VkOption;
  /**
   * Guest VA-API (va.ts, va/PROTOCOL.md): the guest's libva driver
   * (kw_drv_video.so, which libva loads for the virtio-gpu device as
   * virtio_gpu_drv_video.so) sends each picture over vsock port 1024 to a
   * WebCodecs VideoDecoder on this thread and reads it back as NV12
   * (VP9 profile 0, H.264, AV1 Main and HEVC Main where WebCodecs decodes
   * them; decode only). Nothing is asked of WebCodecs before the
   * guest's first connection. true, or options. Needs vsock and
   * VideoDecoder: where there is none (Node) it is ignored with a log
   * line. Default false.
   */
  va?: VaOption;
  /** Initial console size (cols x rows); resize() changes it later. */
  consoleSize?: {
    cols: number;
    rows: number;
  };
  /** Console output, from the first byte. */
  onOutput?: (bytes: Uint8Array) => void;
  /** Host diagnostics ("[host] ...", "[net] ..."). Default console.error. */
  log?: (msg: string) => void;
  /** Download, compile and boot progress. */
  onProgress?: (p: BootProgress) => void;
  /** Aborts the downloads; once booted, stops the kernel (stop()). */
  signal?: AbortSignal;
  /**
   * Sample where guest user time goes (profile.ts; read it with
   * profile()): true, or the rates. Time samples need the kernel's memory
   * shared (the SMP kernel, `cpus` > 1) and a platform that starts a
   * sampler thread (Node); otherwise only instruction samples are taken
   * (with a log line). Default: off.
   */
  profile?: boolean | ProfileOptions;
  /**
   * @internal Worker mode with the shared transport: the console ring the
   * owner reads (KernelConfig.consoleRing; console-ring.ts).
   */
  consoleRing?: SharedArrayBuffer;
  /** @internal KernelConfig.flushOutput (the worker's batched "output" messages). */
  flushOutput?: () => void;
}
export interface VsockOption {
  /** The host's receive buffer per connection: the credit the guest gets. Default 256 KiB. */
  bufferSize?: number;
  /**
   * Low level, inline only: the guest's packets (virtio-vsock header and
   * payload) go to `onPacket` instead of the SDK's protocol, and `vsock`
   * on the instance is undefined; send with kernel.vsock.deliver().
   */
  raw?: {
    onPacket: (pkt: Uint8Array) => void;
    onInit?: (guestCid: number, rxMax: number) => void;
  };
}
/**
 * The worker option, kept out of CreateKernelOptions so that plain
 * options still type createKernel() as a KernelInstance.
 */
export interface WorkerOption {
  /**
   * Run the kernel in a worker (a worker_threads Worker on Node, a module
   * Web Worker in browsers), so it never blocks this thread. The
   * result is a WorkerKernel: the console, sync(), stop(), stats(),
   * exited, the disks' state, the display (frame() is the latest frame
   * the worker sent; readFrame() waits for a fresh one), evdev and sound,
   * without the low-level `kernel`. Disks and the network must be specs
   * (devices.ts), which the worker builds. A `display` function is asked
   * on this thread at boot, on resize() and on
   * WorkerKernel.updateDisplaySize(). The worker starts at once, and while
   * it starts this thread downloads (or reads) and compiles the kernel
   * (the engine compiles off-thread) and then posts the compiled
   * WebAssembly.Module to it. Default false.
   */
  worker?: boolean;
  /**
   * Worker mode: load and compile the kernel in the worker instead of on
   * this thread (it then starts only once the worker runs, which is
   * slower). A kernel given as a WebAssembly.Module is posted as it is
   * either way. Default false.
   */
  compileInWorker?: boolean;
  /**
   * Worker mode: console and evdev input and frames through
   * SharedArrayBuffers (worker-shared.ts), which the worker reads while the
   * kernel runs, instead of messages it handles only when the kernel
   * yields (up to 20 ms while the guest is busy). Default (undefined):
   * shared where a SharedArrayBuffer can be posted (Node; a browser page
   * only when cross-origin isolated), else messages. false: messages
   * always. true: shared, or a BootError ("support") where it cannot be.
   * WorkerKernel.transport says which is used.
   */
  shared?: boolean;
  /**
   * Worker mode with `restore`: hand the snapshot's memory buffer to the
   * worker instead of copying it (about 150 ms per 512 MiB), for a
   * snapshot that is used once; its `memory` is detached then (one of
   * 2 GiB or more is shared with the worker instead). Default false.
   */
  transferRestore?: boolean;
}
export interface InstanceStats extends KernelStats {
  /** Milliseconds since kernel entry. */
  uptimeMs: number;
  /** CPUs the kernel was offered (CreateKernelOptions.cpus, or 1 for a UP kernel or where CPU threads cannot start). */
  cpus: number;
  /** Milliseconds to download and compile the kernel (0 if a Module was given). */
  compileMs: number;
  block: BlockStats;
  net?: NetStats;
  /** JIT counters, of all CPUs together. */
  jit: JitStats;
  /** With more than one CPU: the JIT counters per CPU (CPU 0 first). */
  jitCpus?: JitStats[];
  /** kwemu's counters, only from a -Dkwemu-stats kernel (`kernel/build.sh stats`); CPU 0's. */
  kwemu?: KwemuStats;
  /** With more than one CPU: kwemu's counters per CPU (-Dkwemu-stats kernels). */
  kwemuCpus?: (KwemuStats | undefined)[];
  display?: DisplayStats;
  evdev?: InputStats;
  sound?: SoundStats;
  vsock?: VsockStats;
  shm?: ShmStats;
  /** virtio-gpu (gpu option): commands, transfers, flushes. */
  gpu?: VirtioGpuStats;
}
/**
 * A running kernel, wherever it runs: KernelInstance (on this thread) and
 * WorkerKernel (in a worker) both have this surface.
 */
export interface KernelHandle {
  /** The command line it booted with. */
  readonly cmdline: string;
  /** The distro image (the `distro` option) as the host read it, or undefined. */
  readonly distro: DistroInfo | undefined;
  /** Settles when the kernel exits: halt (power off 0, halt 1, restart 2), panic 253, trap 254, fatal 255, or stop(). */
  readonly exited: Promise<ExitResult>;
  /** Console output as a stream: the first access gets everything since boot (the last 1 MiB); closes at exit. */
  readonly output: ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /** Console input as a stream. */
  readonly input: WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /** Ask the guest to sync its file systems and disks; true once persistent disks have flushed. */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /** Stop the kernel now (no clean shutdown). Resolves with the exit. */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  /** Save the machine; resume it with createKernel({ restore }) (see KernelInstance.snapshot()). */
  snapshot(opts?: SnapshotOptions): Promise<KernelSnapshot>;
  /** Counters (in a worker: the latest snapshot, at most about 500 ms old while running). */
  stats(): InstanceStats;
  /** With the profile option: the samples so far (after the exit: all of them), else undefined. In a worker, a round trip. */
  profile(): Promise<ProfileReport | undefined>;
  /** Memory actually allocated, in MiB. */
  readonly memoryMiB: number;
  readonly memory64: boolean;
  /** With the display option: the mode while a program has /dev/fb0 open, else null. */
  readonly display: {
    readonly mode: DisplayMode | null;
  } | undefined;
  /**
   * With the display option: the display size changed. `size` replaces
   * the option from now on; without one a `display` function is asked
   * again (in a worker on this thread; other options: no change). kwfb
   * takes it at the next first open of /dev/fb0. The virtio-gpu device
   * (gpu option) offers it at once when it differs from the size the
   * guest's driver last read (fitted: 64 to 4095 a side, at most about
   * 3840x2400; virtio-gpu.ts fitGpuSize()): a display event, after which
   * the driver reads the display info and the EDID again and sends a
   * hotplug uevent. The guest decides whether to switch: a KMS client
   * that probes the connector finds the new preferred mode (X: `xrandr
   * --auto`; kmscube on its next start), and `display`, frames and
   * onDisplay follow the mode it sets, not this size. Cheap when nothing
   * changed; debounce calls during a drag yourself.
   */
  updateDisplaySize(size?: DisplaySize): void;
  /** With the display option: the keyboard, mouse and tablet (InputHost's methods). */
  readonly evdev: Evdev | undefined;
  /** The current frame as RGBA (in a worker: the latest one it sent), or null. */
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** A fresh frame as RGBA (in a worker: a round trip), or null. */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
  /** With the sound option: the playback state. */
  readonly sound: {
    readonly state: SoundState;
    readonly playing: boolean;
  } | undefined;
  /**
   * With the vsock option: listen() for guest connections to the host
   * (CID 2) and connect() to guest listeners (CID 3). In worker mode the
   * protocol runs on this thread and the packets cross as messages.
   */
  readonly vsock: Vsock | undefined;
  /**
   * Run `file` with `args` in the guest (no file: root's login shell),
   * served by the guest's kwtty over vsock (tty.ts): on its own pty, a Pty
   * (the zigpty / node-pty shape), or with `pty: false` on stdin, stdout
   * and stderr pipes, a Subprocess. Rejects with a PtyError ENODEV when
   * the instance was created with `vsock: false`. Waits until
   * createKernel's `mounts` are mounted and its `commands` linked, as
   * exec() does, and rejects with the MountError or CommandError if one
   * of them failed.
   */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  /**
   * Take over a detachable session (spawn() with `detachable`) by its
   * `sessionId` or as the snapshot listed it (KernelSnapshot.ttys),
   * typically after createKernel({ restore }): a live Pty on the same
   * program and pty, whose output starts with the session's recent output
   * unless `replay: false` (tty.ts attachPty()). Rejects with a PtyError
   * ENOENT when the guest has no such session (or cannot reattach: an
   * image from before the feature), ENODEV without vsock. Does not wait
   * for createKernel's `mounts` or `commands`.
   */
  attach(session: string | TtySessionSnapshot, opts?: AttachOptions): Promise<Pty>;
  /**
   * Run `file` with `args` on pipes, feed it `input`, and resolve with
   * its stdout and stderr (strings, or bytes with `encoding: "buffer"`)
   * and how it ended (a non-zero exit resolves too). tty.ts.
   */
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /**
   * A raw byte stream to TCP `port` on the guest's 127.0.0.1, through the
   * guest's kwtty (tty.ts, CONNECT): resolves once the guest connected,
   * rejects with a PtyError ECONNREFUSED when nothing listens there, or
   * ENODEV without vsock. Waits for createKernel's `mounts`, as spawn().
   */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /**
   * An HTTP/1.1 request to a server on the guest's loopback (http.ts
   * fetchOver() over connect()): the URL's port picks the guest port
   * (default 80), its host only goes into the Host header.
   */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /**
   * Mount a host file system at guest `path` (mounts.ts): serve `fs` over
   * 9p and run kw9p in the guest. Resolves with the Mount (unmount(),
   * stats) once the guest has it mounted; rejects with a MountError
   * (ENODEV without vsock or without 9p in the kernel, ENOENT without kw9p
   * in the image, EBUSY, ETIMEDOUT, ...).
   */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  /** The mounts the guest has now, by guest path. */
  readonly mounts: ReadonlyMap<string, Mount>;
  /**
   * Add a host command (commands.ts): from now on a guest process that
   * runs `name` calls `handler` here. Resolves once the guest has the link
   * /run/kw/bin/NAME (at once when `name` is replaced); rejects with a
   * CommandError (EINVAL for a bad name, ENODEV without vsock, ENOENT
   * without kwcmd in the image, ETIMEDOUT, ...).
   */
  addCommand(name: string, handler: HostCommand, opts?: {
    timeout?: number;
  }): Promise<void>;
  /** Remove a host command and its link in the guest. A guest process running it goes on. */
  removeCommand(name: string, opts?: {
    timeout?: number;
  }): Promise<void>;
  /** The host commands the guest has now, by name. */
  readonly commands: ReadonlyMap<string, HostCommand>;
  /**
   * With the shm option: guest shmem files read and written in place
   * (open(), create(), openId(); ShmFile.read()/write()). In worker mode the
   * copies run in the worker, where the kernel's memory is, except where
   * that memory is shared with this thread (an SMP kernel with the shared
   * transport): then, as inline, readSync() and views() work here
   * (Shm.inPlace).
   */
  readonly shm: Shm | undefined;
  /**
   * How input and frames reach the kernel: "inline" (this thread),
   * "messages" or "shared" (worker mode; see WorkerOption.shared).
   */
  readonly transport: KernelTransport;
  /** With the gl option, where it could start: the renderer's host side (ready, stats); it runs on this thread in both modes. */
  readonly gl: GlHost | undefined;
  /** With the vk option, where it could start: the Vulkan renderer's host side (status, stats); on this thread in both modes. */
  readonly vk: VkHost | undefined;
  /** With the va option, where it could start: the VA-API decoder's host side (status, stats); on this thread in both modes. */
  readonly va: VaHost | undefined;
}
/** A booted kernel: its console, its exit, and the low-level Kernel. */
export declare class KernelInstance implements KernelHandle {
  #private;
  /** The low-level runtime object (imports, memory, IRQ bits). */
  readonly kernel: Kernel;
  readonly module: WebAssembly.Module;
  /** The command line it booted with. */
  readonly cmdline: string;
  /** The network device, if any. */
  readonly net: NetDevice | undefined;
  /** The distro image (the `distro` option) as the host read it, or undefined. */
  distro: DistroInfo | undefined;
  /** Disks whose spec was optional and could not be built, and why. */
  skippedDisks: SkippedDisk[];
  /** Settles when the kernel exits: halt (power off 0, halt 1, restart 2), panic 253, trap 254, fatal 255, or stop(). */
  readonly exited: Promise<ExitResult>;
  /** @internal Use createKernel(). */
  constructor(kernel: Kernel, module: WebAssembly.Module, cmdline: string, net: NetDevice | undefined, compileMs: number);
  /** @internal The vsock protocol's host end, when the vsock option is set (and not raw). */
  attachVsock(host: VsockHost): void;
  /**
   * @internal createKernel({ restore, mounts }), before the kernel runs:
   * serve the snapshot's mounts again and tell the kernel to keep their
   * connections. Returns the mounts to mount once it runs.
   */
  restoreMounts(snap: KernelSnapshot, list: ReturnType<typeof parseMounts>): Promise<ReturnType<typeof parseMounts>>;
  /** @internal createKernel's `mounts`, once the kernel runs. */
  startMounts(list: ReturnType<typeof parseMounts>): void;
  /** @internal createKernel's `commands`, once the kernel runs. */
  startCommands(list: ReturnType<typeof parseCommands>): void;
  /** @internal createKernel's `gl`, once the kernel runs. */
  attachGl(gl: GlHost | undefined): void;
  /** With the gl option: the GL renderer's host side (gl.ts), or undefined. */
  get gl(): GlHost | undefined;
  /** @internal createKernel's `vk`, once the kernel runs. */
  attachVk(vk: VkHost | undefined): void;
  /** With the vk option: the Vulkan renderer's host side (vk.ts), or undefined. */
  get vk(): VkHost | undefined;
  /** @internal createKernel's `va`, once the kernel runs. */
  attachVa(va: VaHost | undefined): void;
  /** With the va option: the VA-API decoder's host side (va.ts), or undefined. */
  get va(): VaHost | undefined;
  /**
   * With the vsock option: listen() for guest connections to the host
   * (CID 2, any port) and connect() to guest listeners (CID 3), each a
   * byte stream with half-close and reset (VsockHost, vsock.ts).
   */
  get vsock(): VsockHost | undefined;
  /**
   * A program on its own pty, or on pipes (`pty: false`), served by the
   * guest's kwtty on vsock port 1022 (tty.ts).
   */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  /** Take over a detachable session (see KernelHandle.attach()). */
  attach(session: string | TtySessionSnapshot, opts?: AttachOptions): Promise<Pty>;
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /** A raw byte stream to a TCP server on the guest's loopback (see KernelHandle.connect()). */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /** HTTP/1.1 to a server on the guest's loopback (see KernelHandle.fetch()). */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Mount a host file system in the guest (mounts.ts; see KernelHandle.mount()). */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  get mounts(): ReadonlyMap<string, Mount>;
  /** Add a host command (commands.ts; see KernelHandle.addCommand()). */
  addCommand(name: string, handler: HostCommand, opts?: {
    timeout?: number;
  }): Promise<void>;
  removeCommand(name: string, opts?: {
    timeout?: number;
  }): Promise<void>;
  get commands(): ReadonlyMap<string, HostCommand>;
  /**
   * With the shm option: open guest shmem files by name or by a guest
   * export's id and read and write their pages in place (shm.ts). Handles
   * read in place here (readSync(), views(): zero-copy views of the
   * kernel's memory, valid until the kernel runs again).
   */
  get shm(): ShmClient | undefined;
  /** @internal Disks built from specs, closed (after their last save) when the kernel exits. */
  own(disks: BlockDevice[]): void;
  /** Resolves once every save in flight on the disks has settled (a no-op for disks without saves). */
  settled(): Promise<void>;
  /** @internal Console output from the kernel. */
  emit(bytes: Uint8Array): void;
  /**
   * Console output as a stream. The first access gets everything since
   * boot (the last 1 MiB); later chunks are queued without limit, so keep
   * reading it (or use onOutput()). Closes when the kernel exits. There is
   * one such stream; tee() it for more readers.
   */
  get output(): ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /** Console input as a stream (e.g. pipe a terminal into it). */
  get input(): WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /**
   * Ask the guest to write back all file systems and flush its disks (the
   * sync IRQ), e.g. before a page goes away. Resolves true once every
   * persistent disk (FileDisk, a CowDisk saved in IndexedDB) has completed
   * a flush issued after the call, false after `timeout` ms (default 3000).
   * True at once without persistent disks.
   */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine (Kernel.snapshot()); resume it with createKernel({
   * restore }). Disks are not copied: the snapshot stays restorable only
   * while they are unchanged. Without `stop` the guest keeps running, and
   * its next disk write ends that; `stop: true` stops the kernel right
   * after the copy (no clean shutdown), the usual way to suspend a machine
   * with disks. The devices' host state is saved (display, input, sound,
   * shm exports, the network's MAC); vsock sessions and TCP connections
   * are not (a restored guest's ends are reset), but detachable terminal
   * sessions survive in the guest and are listed in `ttys` for attach(). Host file systems are:
   * each mount's 9p session and the guest's open files on it (not the
   * files themselves; restore with the same `mounts`). Rejects while a
   * mount or unmount runs, or when a 9p request is in flight at the
   * snapshot point. `commit` stores the snapshot while the kernel waits
   * at that point, and the kernel stops only once it succeeded (with
   * `hold`, or waits on there until told to stop or go on); if it fails
   * the guest goes on (SnapshotOptions, SnapshotCommitError).
   */
  snapshot(opts?: SnapshotOptions): Promise<KernelSnapshot>;
  /**
   * Stop the kernel now (no clean shutdown: the guest is not told and
   * unflushed disk writes are lost; prefer typing `poweroff` or call
   * sync() first). Resolves
   * with the exit, which is the stop unless the kernel had already exited.
   */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  stats(): InstanceStats;
  /** With the profile option: the samples so far (profile.ts), else undefined. */
  profile(): Promise<ProfileReport | undefined>;
  /** The kernel runs on this thread. */
  get transport(): KernelTransport;
  /** The sound card's host side, if the sound option was set: `playing`, `state`, `stats`. */
  get sound(): SoundHost | undefined;
  /** Memory actually allocated, in MiB. */
  get memoryMiB(): number;
  get memory64(): boolean;
  /**
   * The display's host side, if the display option was set: its mode and
   * the address of the pixels while a guest program has /dev/fb0 open.
   */
  get display(): DisplayHost | undefined;
  /** See KernelHandle.updateDisplaySize(). */
  updateDisplaySize(size?: DisplaySize): void;
  /**
   * The current frame as RGBA (canvas ImageData layout), or null when there
   * is no display or no program has it open. The guest is suspended
   * whenever this can run, but a program may be in the middle of drawing;
   * call it once per animation frame at most. `out` is reused when it has
   * the right size.
   */
  /**
   * The keyboard and mouse (with the display option): key(), button(),
   * move(), wheel(), and their open state (keyboardOpen, mouseOpen).
   */
  get evdev(): InputHost | undefined;
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** frame(), as a promise (the same call as WorkerKernel.readFrame(), which needs a round trip). */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
}
/**
 * The default Wisp server: the project's own. Public alternatives (run by
 * third parties, who see the host names and ports the guest connects to and
 * plain-HTTP content; the guest's TLS is end to end): wss://anura.pro/,
 * wss://wisp.mercurywork.shop/. A ws:// server is blocked as mixed content
 * on an https page.
 */
export declare const DEFAULT_WISP_SERVERS: readonly string[];
export interface WispBackendOptions {
  log?: (msg: string) => void;
  /**
   * Extra handshake headers, e.g. `{ Origin: "http://localhost" }`. Only
   * runtimes whose WebSocket takes `{ headers }` (Node, Deno, Bun) send
   * them; in browsers, which set Origin themselves, the option is ignored.
   * The Node entry's wispBackend() defaults to NODE_WISP_HEADERS.
   */
  headers?: Record<string, string>;
}
/** A Wisp backend; close() drops the WebSocket (and with it every stream). */
export interface WispBackend extends NetBackend {
  close(): void;
}
/**
 * @param url  Wisp endpoint(s), e.g. "wss://wisp.example/" (trailing slash
 *   per the spec). Several are raced; the fastest handshake wins.
 */
export declare function wispBackend(url: string | readonly string[], opts?: WispBackendOptions): WispBackend;
/** A base URL (prefix rewrite) or a handler. */
export type FetchRoute = string | ((req: Request) => Response | Promise<Response>);
export interface FetchRoutesOptions {
  log?: (msg: string) => void;
}
/** close() aborts every served request and closes the inner backend. */
export interface FetchRoutesBackend extends NetBackend {
  close(): void;
}
/**
 * Wrap `inner` (or nothing: other names do not resolve and other
 * connections are refused) so that plain HTTP to the host names of
 * `routes` is answered with fetch().
 */
export declare function fetchRoutes(inner: NetBackend | undefined, routes: Record<string, FetchRoute>, opts?: FetchRoutesOptions): FetchRoutesBackend;
/** A kernel log line: "[    1.234567] ...". */
export declare const KSTAMP: RegExp;
/** Kernel messages worth showing even when kernel lines are hidden. */
export declare const IMPORTANT: RegExp;
/** ANSI escape sequences (CSI, charset selection, keypad modes, save/restore). */
export declare const ANSI: RegExp;
export interface KernelLineInfo {
  /** The time stamp, seconds since boot. */
  time: number;
  /** Matches IMPORTANT (panic, oops, OOM kill, segfault, ...). */
  important: boolean;
  /** The line as received, with its line end. */
  raw: string;
}
export interface ConsoleRouterOptions {
  /** A kernel message, without "\r" and the line end. */
  onKernelLine?: (line: string, info: KernelLineInfo) => void;
  /** User-space output (including `dmesg` output), as it arrives. */
  onUserOutput?: (text: string) => void;
  /**
   * Once: user space printed its first non-empty line, or a shell prompt.
   * `why` is "first output: <line>" or "shell prompt".
   */
  onUserspace?: (why: string) => void;
  /** How long an undecidable line start is held back, default 250 ms. */
  holdMs?: number;
}
export declare class ConsoleRouter {
  #private;
  /** Whether user space has started printing (onUserspace fired). */
  userspace: boolean;
  constructor(opts?: ConsoleRouterOptions);
  /** Console output: bytes (decoded as a UTF-8 stream) or text. */
  write(data: Uint8Array | string): void;
  /** Release a held-back line start as user output now. */
  flush(): void;
}
export interface SupportReport {
  /** Everything the default (lowered, 32-bit memory) kernel needs: WebAssembly, BigInt and working JSPI. */
  ok: boolean;
  wasm: boolean;
  bigint: boolean;
  /** WebAssembly.Suspending and WebAssembly.promising exist and a suspend/resume round trip works. */
  jspi: boolean;
  /** memory64: only the wasm64 reference kernel (vmlinux) needs it. */
  memory64: boolean;
  /** Why `ok` is false (empty when it is true). */
  problems: string[];
}
/** Check JSPI by suspending a tiny module on a timer and resuming it. */
export declare function checkJspi(timeoutMs?: number): Promise<{
  ok: boolean;
  why?: string;
}>;
/** What this engine supports, and whether that is enough to boot the default kernel. */
export declare function checkSupport(): Promise<SupportReport>;
export interface SoundRingRecord {
  /** PCM: the chunk's number. A state record: the state change's number. */
  seq: number;
  format: SoundFormat;
  data: Uint8Array;
  /** Set on a state record (no PCM): the stream's state changed here. */
  event?: SoundEvent;
}
/** Allocate a SharedArrayBuffer backing a SoundRing (power-of-two data capacity). */
export declare function createSoundRing(capacityBytes?: number): SharedArrayBuffer;
/** Single-producer writer in the kernel worker thread. */
export declare class SoundRingWriter {
  #private;
  readonly buffer: SharedArrayBuffer;
  constructor(buffer: SharedArrayBuffer);
  /**
   * Append a state record (number `n`, see the top). Returns false if even
   * the reserve is full; a reader that also gets the states as messages
   * (SoundBridge) notices the gap in the numbers.
   */
  writeEvent(n: number, event: SoundEvent): boolean;
  /**
   * Append one PCM chunk record. Returns true if the reader appears asleep on
   * an empty ring (Dekker check: Atomics.store(HEAD) then Atomics.load(TAIL)),
   * so the caller should send a coalesced "sound-wake" if draining via callbacks.
   */
  write(seq: number, format: SoundFormat, bytes: Uint8Array): boolean;
  /** Frames not played yet: those the reader's sink reported, plus those still in the ring. */
  queuedFrames(): number;
  /** A new stream: forget what the sink reported for the last one. */
  resetQueued(): void;
  /** Bytes dropped because the ring was full. */
  droppedBytes(): number;
}
/** Single-consumer reader on the owner thread or inside an AudioWorkletProcessor. */
export declare class SoundRingReader {
  #private;
  readonly buffer: SharedArrayBuffer;
  constructor(buffer: SharedArrayBuffer);
  /** Bytes (including 16-byte record headers + padding) currently readable. */
  availableBytes(): number;
  /**
   * Frames the sink still has queued after the records read so far. The
   * kernel reports it (plus what is in the ring) as the stream's delay, so
   * a reader that never calls this leaves the sink's latency out of it.
   */
  setQueuedFrames(frames: number): void;
  /** Bytes dropped by the producer because the ring overflowed. */
  droppedBytes(): number;
  /** The number of the state record that is next in the ring, or -1 (PCM next, or empty). */
  nextEvent(): number;
  /**
   * Read one record (PCM into `scratch` if provided and large enough), or
   * null if empty. A state record has `event` set and no data.
   */
  readNext(scratch?: Uint8Array): SoundRingRecord | null;
}
/** A byte stream to a server in the guest. */
export interface ByteDuplex {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}
/** Open a byte stream to the guest's 127.0.0.1:<port>. */
export type GuestConnect = (port: number, opts: {
  signal?: AbortSignal;
}) => Promise<ByteDuplex>;
/** The largest status line plus header block accepted, interim responses included. */
export declare const HTTP_MAX_HEADER_BYTES: number;
/**
 * Fetch from a server in the guest: always connects to the guest's
 * 127.0.0.1:<port>, the URL's port (default 80). Only http: URLs. The
 * hostname goes only into the Host header. Takes what fetch() takes; a
 * Request's own body is read in full first and sent with Content-Length,
 * a ReadableStream (or other streaming) `init.body` is sent chunked.
 * Redirects are returned, not followed. Rejects 101 Switching Protocols.
 */
export declare function fetchOver(connect: GuestConnect, input: string | URL | Request, init?: RequestInit): Promise<Response>;
/** The host port kwwasi connects to (guest/src/kwwasi.c KWWASI_PORT). */
export declare const WASI_EXEC_PORT = 1021;
export interface WasiExecOptions {
  /** The vsock port to listen on (default WASI_EXEC_PORT, 1021). */
  port?: number;
  /** The largest module accepted (default 256 MiB). */
  maxModuleBytes?: number;
  log?: (msg: string) => void;
  /** Workers kept for the next program once theirs ended by itself (default 2). */
  idleWorkers?: number;
  /**
   * Compiled modules kept, least recently used dropped first: at most
   * `count` (default 16) and `bytes` of module files (default 512 MiB; the
   * newest is kept even when larger).
   */
  moduleCache?: {
    count?: number;
    bytes?: number;
  };
  /**
   * Requests through a SharedArrayBuffer per program instead of messages
   * (default: when this thread can use one, wasiSharedChannelAvailable()).
   * false: messages and JSPI.
   */
  sharedMemory?: boolean;
}
export interface WasiExecStats {
  /** Programs started, running now, and ended by a trap or an error. */
  started: number;
  running: number;
  failed: number;
  /** Requests made to kwwasi. */
  requests: number;
  /** Modules kwwasi sent (it sends none the host has), and compiled modules kept. */
  received: number;
  cached: number;
  /** Worker threads alive (running a program or idle), and the idle ones. */
  workers: number;
  idle: number;
  /** Shared channels still served (sharedMemory; 0 once no program runs). */
  channels: number;
}
export interface WasiExecServer {
  readonly port: number;
  /** Requests go through a SharedArrayBuffer (WasiExecOptions.sharedMemory), not messages. */
  readonly shared: boolean;
  readonly stats: WasiExecStats;
  /** Stop listening and end the idle workers (running programs go on). */
  close(): void;
}
export {};