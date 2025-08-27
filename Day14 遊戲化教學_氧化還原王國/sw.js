self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open('redox-v1').then(c=>c.addAll([
    './','./index.html','./assets/css/style.css','./assets/js/app.js',
    './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/maskable-512.png',
    './manifest.json'
  ])));
});
self.addEventListener('activate', e=>{e.waitUntil(self.clients.claim())});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
