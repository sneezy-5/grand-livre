// sw.js
// Service worker minimal : rend l'app installable et utilisable hors-ligne
// pour sa coquille statique, mais ne met JAMAIS en cache /api/* — l'intérêt
// de cette app est d'avoir des données à jour, pas une copie figée.

const CACHE_NAME = "grand-livre-v2";
const SHELL = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Réseau d'abord, cache seulement en secours (hors-ligne) : l'app est en
// développement actif, il ne faut jamais qu'une ancienne version de
// app.js/style.css reste servie depuis le cache alors qu'une nouvelle est
// disponible sur le serveur. Le cache est mis à jour à chaque requête
// réussie, donc la version hors-ligne reste quand même raisonnablement
// fraîche (le dernier chargement en ligne).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // toujours en direct, jamais en cache

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
