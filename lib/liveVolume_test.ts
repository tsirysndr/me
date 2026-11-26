import { assertEquals } from "$std/assert/mod.ts";
import { createLiveVolume, VOLUME_STORAGE_KEY } from "./liveVolume.ts";
import type { VolumeStringStorage } from "./liveVolume.ts";

function memoryStorage(saved?: string) {
  const values = new Map<string, string>();
  if (saved !== undefined) values.set(VOLUME_STORAGE_KEY, saved);
  const listeners = new Set<(value: string | null) => void>();
  let reads = 0;
  const storage: VolumeStringStorage = {
    getItem: (key) => {
      reads++;
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    subscribe: (_key, listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    storage,
    values,
    listeners,
    reads: () => reads,
    external(value: string | null) {
      if (value === null) values.delete(VOLUME_STORAGE_KEY);
      else values.set(VOLUME_STORAGE_KEY, value);
      for (const listener of listeners) listener(value);
    },
  };
}

Deno.test("volume is SSR-safe and restores a saved level only after subscribing", () => {
  const memory = memoryStorage("-12");
  const volume = createLiveVolume(() => memory.storage);
  assertEquals(volume.get(), -24);
  assertEquals(memory.reads(), 0);
  const close = volume.subscribe(() => {});
  assertEquals(volume.get(), -12);
  close();
});

Deno.test("volume survives a new store/page reload, including saved mute", () => {
  const memory = memoryStorage();
  const first = createLiveVolume(() => memory.storage);
  const closeFirst = first.subscribe(() => {});
  assertEquals(first.get(), -24);
  first.set(-9);
  assertEquals(memory.values.get(VOLUME_STORAGE_KEY), "-9");
  closeFirst();
  const reload = createLiveVolume(() => memory.storage);
  const closeReload = reload.subscribe(() => {});
  assertEquals(reload.get(), -9);
  reload.set(-24);
  closeReload();
  const mutedReload = createLiveVolume(() => memory.storage);
  const closeMuted = mutedReload.subscribe(() => {});
  assertEquals(mutedReload.get(), -24);
  closeMuted();
  assertEquals(memory.listeners.size, 0);
});

Deno.test("invalid stored values default to mute; controls stay in the allowed range", () => {
  for (const saved of ["broken JSON", "null", '"-9"', "{}", "100", "-100"]) {
    const memory = memoryStorage(saved);
    const volume = createLiveVolume(() => memory.storage);
    const close = volume.subscribe(() => {});
    assertEquals(volume.get(), -24);
    close();
  }
  const memory = memoryStorage("-13");
  const volume = createLiveVolume(() => memory.storage);
  const close = volume.subscribe(() => {});
  assertEquals(volume.get(), -12);
  assertEquals(volume.set((value) => value + 3), -9);
  assertEquals(volume.set(100), 0);
  assertEquals(volume.set(-100), -24);
  close();
});

Deno.test("cross-tab volume changes are validated and subscriptions are cleaned up", () => {
  const memory = memoryStorage("-12");
  const volume = createLiveVolume(() => memory.storage);
  let observed = -24;
  const close = volume.subscribe((value) => observed = value);
  memory.external("-3");
  assertEquals(volume.get(), -3);
  assertEquals(observed, -3);
  memory.external("100");
  assertEquals(volume.get(), -24);
  memory.external(null);
  assertEquals(volume.get(), -24);
  close();
  assertEquals(memory.listeners.size, 0);
});

Deno.test("blocked storage does not break in-memory volume controls", () => {
  const fail = () => {
    throw new Error("Storage blocked");
  };
  const volume = createLiveVolume(() => ({
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  }));
  const close = volume.subscribe(() => {});
  assertEquals(volume.get(), -24);
  assertEquals(volume.set(-6), -6);
  close();
});
