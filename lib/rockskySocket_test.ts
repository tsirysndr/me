import { assert, assertEquals } from "$std/assert/mod.ts";
import { FakeTime } from "$std/testing/time.ts";
import { createRockskySocket } from "./rockskySocket.ts";

class FakeSocket {
  readyState = 0;
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  closed = 0;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  // Deliberately never deliver close: model a half-open network connection.
  close() {
    this.readyState = 2;
    this.closed++;
  }
  open() {
    this.readyState = 1;
    this.onopen?.call(this as unknown as WebSocket, new Event("open"));
  }
  frame(data: unknown) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}

Deno.test("Rocksky retries a failed login read without a new visitor subscription", async () => {
  const time = new FakeTime();
  const sockets: FakeSocket[] = [];
  let attempts = 0;
  const connection = createRockskySocket({
    loadToken: () => {
      attempts++;
      return attempts === 1
        ? Promise.reject(new Error("Temporary read failure"))
        : Promise.resolve("test-login");
    },
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    onFrame: () => {},
    onDisconnect: () => {},
  });
  try {
    await connection.ensure();
    assertEquals(sockets.length, 0);
    await time.tickAsync(5000);
    assertEquals(attempts, 2);
    assertEquals(sockets.length, 1);
    sockets[0].open();
    assertEquals(JSON.parse(sockets[0].sent[0]).type, "register");
  } finally {
    connection.stop();
    time.restore();
  }
});

Deno.test("a silent Rocksky socket is replaced even when close never completes", async () => {
  const time = new FakeTime();
  const sockets: FakeSocket[] = [];
  let frames = 0;
  const connection = createRockskySocket({
    loadToken: () => Promise.resolve("test-login"),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    onFrame: () => {
      frames++;
    },
    onDisconnect: () => {},
  });
  try {
    await connection.ensure();
    sockets[0].open();
    sockets[0].frame({ type: "devices", devices: [] });
    const staleMessage = sockets[0].onmessage!;
    await time.tickAsync(30000);
    assertEquals(sockets[0].closed, 1);
    await time.tickAsync(5000);
    assertEquals(sockets.length, 2);
    staleMessage.call(
      sockets[0] as unknown as WebSocket,
      new MessageEvent("message", { data: '{"type":"devices"}' }),
    );
    assertEquals(frames, 1);
    assert(
      sockets[0].sent.every((s) =>
        s === "ping" || JSON.parse(s).type === "register"
      ),
    );
  } finally {
    connection.stop();
    time.restore();
  }
});

Deno.test("unregistered Rocksky connections retry after the handshake deadline", async () => {
  const time = new FakeTime();
  const sockets: FakeSocket[] = [];
  const connection = createRockskySocket({
    loadToken: () => Promise.resolve("test-login"),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    onFrame: () => {},
    onDisconnect: () => {},
  });
  try {
    await connection.ensure();
    sockets[0].open();
    await time.tickAsync(8000);
    assertEquals(sockets[0].closed, 1);
    await time.tickAsync(5000);
    assertEquals(sockets.length, 2);
  } finally {
    connection.stop();
    time.restore();
  }
});
