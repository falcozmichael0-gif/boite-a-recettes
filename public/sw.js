// Service worker : appli disponible hors connexion + réception du bouton « Partager » d'Android.
const VERSION = "__VERSION__";
const CACHE = "boite-" + VERSION;
const COQUILLE = ["./", "index.html", "app.js", "style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const PARTAGE = "boite-partage";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("boite-") && k !== CACHE && k !== PARTAGE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // Firebase, Claude, polices : réseau direct
  if (url.pathname.endsWith("/version.json")) return;   // toujours la version en ligne, jamais le cache

  // Partage depuis une autre appli : on range le contenu puis on ouvre l'écran « Ajouter »
  if (e.request.method === "POST" && url.pathname.endsWith("/partage")) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const cache = await caches.open(PARTAGE);
      for (const k of await cache.keys()) await cache.delete(k);
      const infos = { title: form.get("title") || "", text: form.get("text") || "", url: form.get("url") || "", images: 0 };
      const fichiers = form.getAll("images").filter(f => f && f.size);
      for (let i = 0; i < fichiers.length; i++) {
        await cache.put(`partage/image-${i}`, new Response(fichiers[i], { headers: { "content-type": fichiers[i].type || "image/jpeg" } }));
      }
      infos.images = fichiers.length;
      await cache.put("partage/infos", new Response(JSON.stringify(infos), { headers: { "content-type": "application/json" } }));
      return Response.redirect("./?partage=1#ajouter", 303);
    })());
    return;
  }

  if (e.request.method !== "GET") return;
  // Fichiers de l'appli : réponse du cache tout de suite, mise à jour en arrière-plan
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cle = e.request.mode === "navigate" ? "index.html" : e.request;
    const enCache = await cache.match(cle);
    const reseau = fetch(e.request).then(r => { if (r.ok && e.request.mode !== "navigate") cache.put(e.request, r.clone()); return r; }).catch(() => null);
    if (e.request.mode === "navigate") return (await reseau) || enCache;
    return enCache || (await reseau) || new Response("", { status: 504 });
  })());
});
