/* Service Worker: macht den Rechner offline startbar.
 *
 * Erst Netz, dann Speicher. Mit Netz kommt immer die aktuelle Fassung von
 * GitHub Pages — ein Update muss hier also nichts hochzählen. Ohne Netz
 * (oder wenn es länger als NETZ_GEDULD braucht, etwa im Keller mit einem
 * Balken) kommt die zuletzt geladene Fassung aus dem Speicher.
 *
 * Nur Anfragen an die eigene Seite laufen hierüber. Die Kursabfragen gehen
 * an fremde Server und bleiben unberührt — ob ein Kurs alt ist, entscheidet
 * die App selbst und schreibt es dazu.
 */
var SPEICHER = "goldschmiede-rechner-v1";
var NETZ_GEDULD = 4000;   // ms

var GRUNDBESTAND = [
  "./",
  "index.html",
  "manifest.json",
  "icon-152.png",
  "icon-167.png",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SPEICHER)
      .then(function (c) { return c.addAll(GRUNDBESTAND); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (namen) {
      return Promise.all(namen.filter(function (n) { return n !== SPEICHER; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function ausDemNetz(anfrage) {
  return new Promise(function (erfuellt, abgelehnt) {
    var uhr = setTimeout(function () { abgelehnt(new Error("zu langsam")); }, NETZ_GEDULD);
    fetch(anfrage).then(function (antwort) {
      clearTimeout(uhr);
      if (!antwort.ok) { abgelehnt(new Error("HTTP " + antwort.status)); return; }
      // Kopie für den nächsten Start ohne Netz
      var kopie = antwort.clone();
      caches.open(SPEICHER).then(function (c) { return c.put(anfrage, kopie); });
      erfuellt(antwort);
    }, function (fehler) {
      clearTimeout(uhr);
      abgelehnt(fehler);
    });
  });
}

self.addEventListener("fetch", function (e) {
  var anfrage = e.request;
  if (anfrage.method !== "GET") return;
  if (new URL(anfrage.url).origin !== self.location.origin) return;

  e.respondWith(
    ausDemNetz(anfrage).catch(function () {
      // ignoreSearch: ein Aufruf mit ?irgendwas findet so trotzdem die Seite
      return caches.match(anfrage, { ignoreSearch: true }).then(function (treffer) {
        if (treffer) return treffer;
        // Seitenaufruf unter anderer Adresse (z. B. "./" statt "index.html")
        if (anfrage.mode === "navigate") return caches.match("index.html");
      }).then(function (antwort) {
        return antwort || Response.error();
      });
    })
  );
});
