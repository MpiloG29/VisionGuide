const CACHE_NAME = 'visionguide-v3';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
];

// ── Install: cache the app shell ─────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: remove old caches ──────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: shell-first with network fallback ─────────────────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip cross-origin requests (Google Fonts, Maps, TensorFlow CDN)
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request)
                .then(response => {
                    // Cache successful same-origin responses
                    if (response.ok && url.origin === self.location.origin) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline fallback: return shell HTML for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
        })
    );
});

// ── Background sync placeholder ───────────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        // Future: sync community hazard reports to cloud
        event.waitUntil(Promise.resolve());
    }
});

// ── Push notifications placeholder ───────────────────────────
self.addEventListener('push', (event) => {
    const data = event.data?.json() || { title: 'VisionGuide', body: 'New safety alert.' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icons/icon-192.svg',
            badge: '/icons/icon-192.svg',
            vibrate: [200, 100, 200],
            tag: 'visionguide-alert',
        })
    );
});
