import type { HookFailure } from "@core/hooks/types";

export interface PluginFailureRecord {
  pluginSlug: string;
  at: string;
  source: "boot" | "hook";
  hookName?: string;
  message: string;
  stack?: string;
}

const RING_LIMIT = 100;

export interface PluginFailureRingOptions {
  /**
   * Optional fire-and-forget persistence callback. Invoked for every record
   * after it lands in the in-memory ring. Errors thrown from `persist` are
   * caught + logged so persistence failures never break the kernel.
   */
  persist?: (record: PluginFailureRecord) => Promise<void> | void;
}

export class PluginFailureRing {
  private buf: PluginFailureRecord[] = [];
  private opts: PluginFailureRingOptions;

  constructor(opts: PluginFailureRingOptions = {}) {
    this.opts = opts;
  }

  recordBoot(slug: string, err: Error): void {
    this.push({
      pluginSlug: slug,
      at: new Date().toISOString(),
      source: "boot",
      message: err.message,
      stack: err.stack
    });
  }

  recordHook(failure: HookFailure): void {
    this.push({
      pluginSlug: failure.pluginSlug,
      at: new Date().toISOString(),
      source: "hook",
      hookName: failure.hookName,
      message: failure.error.message,
      stack: failure.error.stack
    });
  }

  list(): readonly PluginFailureRecord[] {
    return this.buf.slice();
  }

  clear(): void {
    this.buf = [];
  }

  private push(record: PluginFailureRecord): void {
    this.buf.push(record);
    if (this.buf.length > RING_LIMIT) this.buf.shift();
    console.error(
      `[plugin-failure] ${record.pluginSlug} (${record.source}${record.hookName ? `:${record.hookName}` : ""}): ${record.message}`
    );
    if (this.opts.persist) {
      const result = this.opts.persist(record);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((err) => {
          console.error(`[plugin-failure] persist failed:`, err);
        });
      }
    }
  }
}
