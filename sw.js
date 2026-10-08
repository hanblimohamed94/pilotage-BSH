// Service worker minimal : rend le site installable comme application.
// Il ne met RIEN en cache (toujours la dernière version du site et des données).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { e.respondWith(fetch(e.request)); });
