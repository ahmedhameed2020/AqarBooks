import "server-only";

/**
 * Abuse ceiling for AI endpoints reached from the public demo.
 *
 * WHY THIS EXISTS
 * Every AI route today authorizes with "is there a signed-in user with an
 * organization", and nothing else. That was sufficient while every signed-in
 * user was a paying tenant's employee. A public demo breaks that assumption:
 * the demo account is a valid signed-in user that anyone on the internet can
 * obtain by clicking a button, so without a ceiling the demo turns Gemini into
 * a free, unauthenticated API funded by us (spec §27).
 *
 * WHY IT IS IN-MEMORY, AND WHAT THAT HONESTLY BUYS
 * The repository has no KV namespace, no Durable Object and no rate-limiting
 * binding; wrangler.jsonc declares only ASSETS. Adding shared state is a
 * deployment change that cannot be exercised by `next dev`, so shipping it
 * untested would be worse than shipping a limiter whose limits are understood.
 *
 * This limiter is per-isolate. Concretely:
 *
 *   - It DOES stop the realistic abuse case -- a script hammering the endpoint
 *     from one client, which lands on a small number of isolates and is capped
 *     within seconds.
 *   - It DOES bound casual over-use by a genuine visitor.
 *   - It does NOT enforce a global budget. Traffic spread across many colos
 *     and isolates gets a separate allowance per isolate, and an isolate that
 *     is evicted forgets its counters.
 *
 * The durable fix is a Cloudflare Rate Limiting binding, which needs no KV and
 * would slot in behind this same function signature. That is recorded as a
 * caveat rather than silently assumed to be covered.
 *
 * Nothing here applies to real tenants -- every call site checks isDemo first.
 */

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds the caller should wait. Only meaningful when allowed is false. */
  retryAfterSeconds: number;
};

/** Short window: stops a burst. */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 5;

/** Long window: stops a slow drip that would still cost real money over a day. */
const SUSTAINED_WINDOW_MS = 60 * 60_000;
const SUSTAINED_MAX = 40;

/**
 * Timestamps of recent requests, newest last, keyed by client. Trimmed on every
 * read, so an idle key shrinks to an empty array rather than growing forever.
 */
const hits = new Map<string, number[]>();

/**
 * Bounds the map itself. Without this, a spray of unique client keys would grow
 * the isolate's memory until it was evicted -- turning the limiter into the
 * denial-of-service it was added to prevent.
 */
const MAX_TRACKED_CLIENTS = 5_000;

/**
 * Identifies the caller for limiting purposes.
 *
 * Cloudflare sets CF-Connecting-IP and it cannot be spoofed by the client --
 * the edge overwrites whatever the request carried. `x-forwarded-for` is only
 * consulted as a local-development fallback and is trusted for nothing else.
 * When neither is present every caller shares the "unknown" bucket, which is
 * deliberately the strict direction: unidentifiable traffic is limited
 * together rather than exempted.
 */
export function clientKeyFromRequest(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

export function checkDemoAiRateLimit(clientKey: string, now = Date.now()): RateLimitDecision {
  const recent = (hits.get(clientKey) ?? []).filter((t) => now - t < SUSTAINED_WINDOW_MS);

  const inBurst = recent.filter((t) => now - t < BURST_WINDOW_MS);

  if (inBurst.length >= BURST_MAX) {
    const oldest = inBurst[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((BURST_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  if (recent.length >= SUSTAINED_MAX) {
    const oldest = recent[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((SUSTAINED_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }

  // Only a permitted request is recorded. Counting refusals too would let a
  // client that is already being refused extend its own penalty indefinitely.
  recent.push(now);
  hits.set(clientKey, recent);

  if (hits.size > MAX_TRACKED_CLIENTS) evictIdle(now);

  return { allowed: true, retryAfterSeconds: 0 };
}

function evictIdle(now: number): void {
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < SUSTAINED_WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
  // If everything is still live, drop the oldest keys rather than growing. The
  // map is insertion-ordered, so the earliest entries go first.
  if (hits.size > MAX_TRACKED_CLIENTS) {
    const excess = hits.size - MAX_TRACKED_CLIENTS;
    let dropped = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

/** Test seam. Not called by application code. */
export function __resetDemoRateLimitState(): void {
  hits.clear();
}

export const DEMO_RATE_LIMIT_POLICY = {
  BURST_WINDOW_MS,
  BURST_MAX,
  SUSTAINED_WINDOW_MS,
  SUSTAINED_MAX,
} as const;
