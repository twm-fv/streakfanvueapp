import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

/** Tiny file-backed key/value store. Prototype-grade: swap for Postgres before any pilot. */
export class JsonStore<T> {
  private readonly file: string;
  private cache: Record<string, T> | null = null;

  constructor(name: string) {
    this.file = join(config.DATA_DIR, `${name}.json`);
  }

  private read(): Record<string, T> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, T>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private write(data: Record<string, T>): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.cache = data;
  }

  get(key: string): T | undefined {
    return this.read()[key];
  }

  set(key: string, value: T): void {
    const data = { ...this.read(), [key]: value };
    this.write(data);
  }

  delete(key: string): void {
    const data = { ...this.read() };
    delete data[key];
    this.write(data);
  }

  values(): T[] {
    return Object.values(this.read());
  }
}
