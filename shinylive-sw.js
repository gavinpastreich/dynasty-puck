// The old R/shinylive apps registered a service worker at this path. This stub replaces it and removes itself,
// so returning visitors aren't served stale cached pages.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(self.registration.unregister().then(function () { return self.clients.matchAll(); }).then(function (cs) {
    cs.forEach(function (c) { c.navigate(c.url); });
  }));
});
