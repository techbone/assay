/**
 * Reads what the collector has recorded and published to the `data` branch: the basis
 * history, the scorecard and coverage. These need memory that a stateless function does
 * not have, so they are the collector's job; the live API only relays them.
 */
export const DEFAULT_RECORDED_BASE = "https://raw.githubusercontent.com/techbone/assay/data";

export class Recorded {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly base: string = DEFAULT_RECORDED_BASE,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly ttlMs = 60_000,
  ) {}

  /** `null` means not published (yet) - never an error the site should surface as one. */
  async get<T>(path: string): Promise<T | null> {
    const hit = this.cache.get(path);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T | null;
    let value: T | null = null;
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { signal: AbortSignal.timeout(8_000) });
      value = res.ok ? ((await res.json()) as T) : null;
    } catch {
      value = null;
    }
    this.cache.set(path, { at: Date.now(), value });
    return value;
  }
}
