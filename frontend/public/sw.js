const CACHE = "codementor-shell-v1";
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/offline.html", "/icon-192.png", "/icon-512.png"]))); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("codementor-") && key !== CACHE).map(key => caches.delete(key))))); });
self.addEventListener("fetch", event => { if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html"))); });
