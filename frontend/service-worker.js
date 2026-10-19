const CACHE_NAME = "foodway-shell-v2";
const APP_SHELL = [
  "/customer/index.html",
  "/offline.html",
  "/assets/css/style.css",
  "/assets/css/foodway-theme.css",
  "/assets/js/common.js",
  "/assets/js/restaurants.js",
  "/assets/js/pwa.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith("foodway-shell-") && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return caches.match("/offline.html");
    return Response.error();
  }));
});
