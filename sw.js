// Service worker: precache the complete app shell and serve it cache-first.
// Cached responses return immediately; same-origin updates refresh the cache
// in the background so weak or absent networks never delay an already-cached boot.
//
// DEPLOY RITUAL: bump CACHE below on every deploy. That installs a fresh
// precache, and the new service worker takes over on the next app launch.

// Keep in sync with APP_VERSION in js/main.js.
const CACHE = "treino-v7.3";

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/charts.js",
  "./js/config.js",
  "./js/db.js",
  "./js/fakedb.js",
  "./js/logic.js",
  "./js/main.js",
  "./js/seed.js",
  "./js/vendor/firebase-app.js",
  "./js/vendor/firebase-auth.js",
  "./js/vendor/firebase-firestore.js",
  "./icons/apple-touch-icon.png?v=2",
  "./icons/icon-192.png?v=2",
  "./icons/icon-512.png?v=2",
];

const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  const requests = PRECACHE.map(
    (path) => new Request(new URL(path, self.registration.scope), { cache: "reload" })
  );
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function fetchAndCache(request, cacheKey = request) {
  const response = await fetch(new Request(request, { cache: "reload" }));
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";
  const cacheKey = isNavigation ? INDEX_URL : request;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const revalidationRequest = isNavigation ? INDEX_URL : request;
        event.waitUntil(fetchAndCache(revalidationRequest, cacheKey).catch(() => {}));
        return cached;
      }
      return fetchAndCache(request, cacheKey);
    })
  );
});
