import {
  bundledBoot,
  createKernel,
  NetStack,
  openDataDisk,
  wispBackend,
} from "unkernel/web";
import { downloadPool } from "./download-assets.mjs";
import { enableIcmpEcho } from "./icmp-network.mjs";
import { openImageDisk } from "./image-disk.mjs";

let vm;
let starting = false;
let size = [80, 24];
let supplyKernel;
const kernelReady = new Promise((resolve) => {
  supplyKernel = resolve;
});
const pending = [];
const abort = new AbortController();
const send = (type, data = {}) => postMessage({ type, ...data });
const log = (message) => send("log", { message });

addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "boot" && !starting) {
    starting = true;
    size = [message.cols, message.rows];
    void boot(message).catch((error) => {
      abort.abort();
      vm?.stop();
      send("error", { message: error.message });
    });
  } else if (message.type === "kernel") {
    supplyKernel(message.kernel);
  } else if (message.type === "input") {
    if (vm) vm.write(message.bytes);
    else pending.push(message.bytes);
  } else if (message.type === "resize") {
    size = [message.cols, message.rows];
    if (vm) vm.resize(...size);
  }
});

async function boot({ image, relayUrl }) {
  let cache;
  try {
    cache = await caches.open("portfolio-linux-assets-v1");
  } catch { /* Optional storage. */ }
  log("Opening the read-only Alpine image");
  let fetched = 0, cached = 0, prefetching = true;
  const disk = await openImageDisk(image, {
    cache,
    pool: downloadPool(4),
    signal: abort.signal,
    onProgress(bytes, hit) {
      if (hit) cached += bytes;
      else fetched += bytes;
      if (prefetching) send("image-progress", { fetched, cached });
    },
  });
  log("Loading only the image blocks needed for Fish");
  const [, kernel] = await Promise.all([disk.prefetch(), kernelReady]);
  prefetching = false;
  log(
    `Boot image ready: ${(fetched / 1e6).toFixed(1)} MB downloaded, ${
      (cached / 1e6).toFixed(1)
    } MB cached`,
  );
  log("Creating the sparse 4 GB disk and allocating 1 GB RAM");
  const data = await openDataDisk({
    template: bundledBoot(kernel).datadisk,
    mode: "snapshot",
    name: "portfolio-linux",
    size: 4 * 1024 ** 3,
  });
  const echoUrl = new URL(relayUrl);
  echoUrl.protocol = echoUrl.protocol === "wss:" ? "https:" : "http:";
  const names = new Map();
  const backend = wispBackend([relayUrl]);
  const lookup = backend.lookup.bind(backend);
  backend.lookup = async (name) => {
    const addresses = await lookup(name);
    for (const address of addresses) names.set(address, name);
    return addresses;
  };
  const network = enableIcmpEcho(
    new NetStack({ backend, log }),
    {
      hostnameForAddress: (address) => names.get(address),
      url: echoUrl.href,
      signal: abort.signal,
    },
  );
  log("Configuring TCP networking and relayed ICMP echo");
  vm = await createKernel({
    kernel,
    distro: disk,
    disks: [data],
    memoryMiB: 1024,
    cmdline: "console=hvc0 rdinit=/init kw.user=visitor quiet loglevel=3",
    consoleSize: { cols: size[0], rows: size[1] },
    net: network,
    onProgress: ({ stage }) => log(`Kernel: ${stage}`),
    log,
    onOutput(bytes) {
      const copy = bytes.slice();
      postMessage({ type: "output", bytes: copy }, [copy.buffer]);
    },
  });
  for (const bytes of pending.splice(0)) vm.write(bytes);
  vm.exited.then((result) => send("exit", { result }));
}
