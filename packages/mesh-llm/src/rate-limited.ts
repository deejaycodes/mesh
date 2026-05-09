import type { LLMClient, LLMRequest, LLMResponse } from "@corelay/mesh-core";

export interface RateLimitConfig {
  /** Max requests per window. Default 60. */
  maxRequests?: number;
  /** Window duration in ms. Default 60_000 (1 minute). */
  windowMs?: number;
}

/**
 * Wraps any LLMClient with a token-bucket rate limiter.
 * Queues requests that exceed the rate and processes them when capacity frees up.
 */
export class RateLimitedLLMClient implements LLMClient {
  readonly name: string;
  private readonly inner: LLMClient;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];
  private queue: Array<{ request: LLMRequest; resolve: (r: LLMResponse) => void; reject: (e: Error) => void }> = [];
  private processing = false;

  constructor(inner: LLMClient, config: RateLimitConfig = {}) {
    this.inner = inner;
    this.name = `rate-limited:${inner.name}`;
    this.maxRequests = config.maxRequests ?? 60;
    this.windowMs = config.windowMs ?? 60_000;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    return new Promise<LLMResponse>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this.pruneTimestamps();

      if (this.timestamps.length >= this.maxRequests) {
        // Wait until the oldest timestamp expires
        const waitMs = this.timestamps[0]! + this.windowMs - Date.now() + 10;
        await sleep(Math.max(waitMs, 100));
        this.pruneTimestamps();
        continue;
      }

      const item = this.queue.shift()!;
      this.timestamps.push(Date.now());

      try {
        const response = await this.inner.chat(item.request);
        item.resolve(response);
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }

  private pruneTimestamps(): void {
    const cutoff = Date.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
