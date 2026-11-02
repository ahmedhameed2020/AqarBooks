#!/usr/bin/env node
// Minimal HTTP load probe. Refuses remote targets unless ALLOW_REMOTE_LOAD=1 so
// it cannot be pointed at production by accident.
//
//   node scripts/load/http-load.mjs http://127.0.0.1:3100 /en 10 15
//     baseUrl  path  concurrency  seconds
//
// Prints count, error rate, p50, p95, p99. No writes, GET only.
const [baseUrl, path = "/en", concurrencyArg = "10", secondsArg = "15", rpsArg = "0"] = process.argv.slice(2);
if (!baseUrl) {
  console.error("usage: node scripts/load/http-load.mjs <baseUrl> [path] [concurrency] [seconds]");
  process.exit(2);
}
const url = new URL(path, baseUrl);
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (!loopback && process.env.ALLOW_REMOTE_LOAD !== "1") {
  console.error(`refusing remote target ${url.host}; set ALLOW_REMOTE_LOAD=1 to opt in`);
  process.exit(2);
}
const concurrency = Number(concurrencyArg);
const seconds = Number(secondsArg);
const targetRps = Number(rpsArg);
const intervalMs = targetRps > 0 ? (concurrency * 1000) / targetRps : 0;

const latencies = [];
let errors = 0;
let requests = 0;
const deadline = Date.now() + seconds * 1000;

async function worker() {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      if (res.status >= 500) errors++;
      await res.arrayBuffer();
    } catch {
      errors++;
    }
    latencies.push(performance.now() - started);
    requests++;
    if (intervalMs > 0) {
      const wait = intervalMs - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
latencies.sort((a, b) => a - b);
const q = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]?.toFixed(0);
console.log(
  JSON.stringify(
    {
      url: url.toString(),
      requests,
      concurrency,
      seconds,
      errorRate: requests ? +(errors / requests).toFixed(3) : 0,
      p50ms: +q(50),
      p95ms: +q(95),
      p99ms: +q(99),
      rps: +(requests / seconds).toFixed(1),
    },
    null,
    2,
  ),
);
