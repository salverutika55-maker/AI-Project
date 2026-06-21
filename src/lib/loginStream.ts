import { EventEmitter } from "events";

const globalWithEmitter = globalThis as unknown as {
  __loginActivityEmitter?: EventEmitter;
};

export const loginActivityEmitter = globalWithEmitter.__loginActivityEmitter ?? new EventEmitter();

if (!globalWithEmitter.__loginActivityEmitter) {
  globalWithEmitter.__loginActivityEmitter = loginActivityEmitter;
}

loginActivityEmitter.setMaxListeners(100);
