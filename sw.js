// Dynasty Puck HQ offline copy. Network first for every file on this site, so the nightly data and new code show up
// right away; the copy saved on the device is used only when the network fails or takes more than 4 seconds (a rink
// with bad signal). Other sites (NHL headshots, Fantrax, the live score file) are never touched.
var CACHE = 'dp-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(function () {});
      return res;
    });
    return new Promise(function (resolve, reject) {
      var done = false, fin = function (r) { if (!done && r) { done = true; resolve(r); } };
      var timer = setTimeout(function () { cache.match(req).then(fin); }, 4000);
      net.then(function (r) { clearTimeout(timer); fin(r); }, function (err) {
        clearTimeout(timer);
        cache.match(req).then(function (r) { if (r) fin(r); else if (!done) { done = true; reject(err); } });
      });
    });
  }));
});
