'use strict';

const VERSION = '__SW_VERSION__';
const SHELL_CACHE = `shell-${VERSION}`;
const IMG_CACHE = `imgs-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/jszip.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await c.addAll(SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== SHELL_CACHE && k !== IMG_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isImage(url) {
  try { return new URL(url).pathname.startsWith('/img/'); }
  catch { return false; }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  if (isImage(url)) {
    e.respondWith((async () => {
      const c = await caches.open(IMG_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        return res;
      } catch {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match('./index.html')) || Response.error();
      }
    })());
  }
});

self.addEventListener('message', async e => {
  const data = e.data || {};
  if (data.type === 'precache' && Array.isArray(data.urls)) {
    const c = await caches.open(IMG_CACHE);
    const total = data.urls.length;
    let done = 0;
    const batch = 12;
    for (let i = 0; i < total; i += batch) {
      const slice = data.urls.slice(i, i + batch);
      await Promise.all(slice.map(async u => {
        try {
          if (await c.match(u)) return;
          const res = await fetch(u);
          if (res.ok) await c.put(u, res.clone());
        } catch {}
      }));
      done = Math.min(total, i + batch);
      e.source?.postMessage({ type: 'precache-progress', done, total });
    }
    e.source?.postMessage({ type: 'precache-done' });
  }
});
