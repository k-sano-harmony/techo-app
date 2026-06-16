const CACHE_NAME = 'techo-cache-v1'
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './api.js',
  './manifest.json',
  './icon.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // GASへのAPIリクエストはキャッシュせずネットワークから直接取得する
  if (url.hostname.includes('script.google.com')) {
    return
  }

  // 静的アセットはキャッシュファースト
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((res) => {
        if (res.ok && event.request.method === 'GET') {
          const resClone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone))
        }
        return res
      })
    })
  )
})
