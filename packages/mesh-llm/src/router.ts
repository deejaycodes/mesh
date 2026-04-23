import type { LLMClient, LLMRequest, LLMResponse } from "@corelay/mesh-core";

export interface LLMRouterConfig {
  /** Name of the primary provider. Must appear in `providers`. */
  primary: string;
  /** Ordered list of fallback provider names. Unknown names are skipped. */
  fallbacks?: string[];
  /** Provider implementations. Looked up by `name`. */
  providers: LLMClient[];
}

/**
 * Routes a chat request through a primary LLM provider, falling through to
 * configured fallbacks when the primary throws.
 *
 * Implements `LLMClient` itself, so any place that accepts an LLMClient can
 * accept a router.
 */
export class LLMRouter implements LLMClient {
  readonly name = "router";
  private readonly order: LLMClient[];

  constructor(config: LLMRouterConfig) {
    const byName = new Map(config.providers.map((p) => [p.name, p]));

    const primary = byName.get(config.primary);
    if (!primary) {
      throw new Error(
        `LLMRouter: primary provider "${config.primary}" is not in the providers list`,
      );
    }

    const fallbacks = (config.fallbacks ?? [])
      .map((n) => byName.get(n))
      .filter((p): p is LLMClient => p !== undefined && p.name !== config.primary);

    this.order = [primary, ...fallbacks];
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];
    for (const provider of this.order) {
      try {
        return await provider.chat(request);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${provider.name}: ${msg}`);
      }
    }
    throw new Error(`LLMRouter: all providers failed — ${errors.join("; ")}`);
  }
}
