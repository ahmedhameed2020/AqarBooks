const CACHE_VERSION = "2026-09-25-1";
const CACHE_PREFIX = "aqarbooks-gate-scanner-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const PRECACHE_ASSETS = [
  "/gate-scanner.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];
const NETWORK_ONLY_PREFIXES = ["/api", "/auth", "/rest", "/rpc"];
const STATIC_ICON_PATHS = new Set(["/icon-192.png", "/icon-512.png"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

function hasNetworkOnlyPath(pathname) {
  return NETWORK_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticScannerAsset(request, url) {
  if (STATIC_ICON_PATHS.has(url.pathname) || url.pathname === "/gate-scanner.webmanifest") {
    return true;
  }

  if (!request.referrer) return false;
  const referrer = new URL(request.referrer);
  const cameFromScanner = referrer.origin === self.location.origin
    && /\/operations\/gate(?:\/|$)/.test(referrer.pathname);

  return url.pathname.startsWith("/_next/static/")
    && cameFromScanner
    && (request.destination === "script" || request.destination === "style");
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    event.waitUntil(networkResponsePromise.then(() => undefined));
    return cachedResponse;
  }

  return (await networkResponsePromise) ?? new Response(null, {
    status: 503,
    statusText: "Service Unavailable",
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET"
    || request.mode === "navigate"
    || url.origin !== self.location.origin
    || hasNetworkOnlyPath(url.pathname)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticScannerAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
