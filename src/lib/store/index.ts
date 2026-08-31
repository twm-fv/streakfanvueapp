import { env } from "@/env";
import { FileStore } from "./file";
import type { Store } from "./types";

let store: Store | null = null;

export function getStore(): Store {
  if (!store) store = new FileStore(env.DATA_DIR);
  return store;
}

export * from "./types";
