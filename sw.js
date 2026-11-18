// Zone US — Service Worker v1
// Stratégie : Cache First pour les assets statiques, Network First pour les données

const CACHE_NAME = 'zoneus-v1'
const CACHE_ASSETS = 'zoneus-assets-v1'

// Assets à pré-cacher au premier chargement
const PRECACHE = [
  '/',
  '/manifest.json',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
]

// Assets statiques : Cache First (images, scripts, fonts)
const CACHE_FIRST_PATTERNS = [
  /unpkg\.com/,
  /raw\.githubusercontent\.com/,
  /a\.espncdn\.com/,
  /cdn\.sanity\.io/,
  /img\.youtube\.com/,
]

// Données live : Network First (proxy Cloudflare, API ESPN/NHL)
const NETWORK_FIRST_PATTERNS = [
  /zoneus-proxy\.vivienfrappier\.workers\.dev/,
  /api-web\.nhle\.com/,
  /site\.api\.espn\.com/,
  /statsapi\.mlb\.com/,
]

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then((cache) => {
      // Pré-cache React en silence (si ça fail, pas grave)
      return Promise.allSettled(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            // Ignore les erreurs de pré-cache (cross-origin peut échouer)
          })
        )
      )
    }).then(() => self.skipWaiting())
  )
})

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== CACHE_ASSETS)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ─── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  // Ignore les requêtes non-GET
  if (request.method !== 'GET') return

  // Ignore les extensions Chrome et les requêtes internes
  if (url.startsWith('chrome-extension://') || url.startsWith('chrome://')) return

  // Network First pour les données live
  if (NETWORK_FIRST_PATTERNS.some((p) => p.test(url))) {
    event.respondWith(networkFirst(request))
    return
  }

  // Cache First pour les assets statiques connus
  if (CACHE_FIRST_PATTERNS.some((p) => p.test(url))) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Pour les pages HTML du site (SPA routing)
  const isSameOrigin = url.startsWith(self.location.origin)
  if (isSameOrigin) {
    const pathname = new URL(url).pathname
    // Pages HTML → Network First avec fallback cache
    if (!pathname.match(/\.(js|css|png|jpg|webp|svg|ico|json|woff2?)$/)) {
      event.respondWith(networkFirstWithFallback(request))
      return
    }
    // Assets statiques locaux → Cache First
    event.respondWith(cacheFirst(request))
  }
})

// ─── STRATÉGIES ──────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_ASSETS)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' })
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Fallback : retourne la page d'accueil depuis le cache (SPA)
    const cached = await caches.match(request)
    if (cached) return cached
    const root = await caches.match('/')
    return root || new Response('Zone US — offline', {
      status: 503,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    })
  }
}
