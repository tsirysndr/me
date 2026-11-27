// Exercise the browser worker unchanged, using Node's message-port adapter.
import { parentPort, workerData } from "node:worker_threads";
const nativeFetch = fetch;
globalThis.fetch = (url, options) =>
  nativeFetch(new URL(url, workerData.baseUrl), options);
globalThis.postMessage = (message, transfer) =>
  parentPort.postMessage(message, transfer);
globalThis.addEventListener = (_type, listener) =>
  parentPort.on("message", (data) => listener({ data }));
await import("./kernel-worker.mjs");
