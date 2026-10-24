// Holt die LBMA-Fixings für Gold, Silber und Platin und legt sie unter
// verlauf/ neben die App. Läuft täglich in GitHub Actions (.github/workflows/
// verlauf.yml): auf dem Server gilt keine CORS-Sperre, und die App liest die
// Dateien dann von ihrer eigenen Adresse — das kann kein Anbieter blockieren.
//
// Format bleibt das der LBMA ([{ d: "JJJJ-MM-TT", v: [USD, GBP, EUR] }, …]),
// damit die App dieselbe Leseroutine benutzt wie für die LBMA direkt.
//
// Eine Antwort ersetzt die vorhandene Datei nur, wenn sie plausibel ist:
// genug Tage, Daten im erwarteten Aufbau, aktuell genug. Sonst bleibt die
// alte Kopie stehen und der Lauf schlägt fehl — sichtbar in GitHub Actions,
// statt still Unsinn auszuliefern.
//
// Aufruf: node werkzeuge/verlauf-holen.js [zielordner]
const fs = require("fs");
const path = require("path");

const QUELLEN = {
  XAU: "https://prices.lbma.org.uk/json/gold_pm.json",
  XAG: "https://prices.lbma.org.uk/json/silver.json",
  XPT: "https://prices.lbma.org.uk/json/platinum_pm.json"
};
const MINDEST_TAGE = 1000;
const HOECHSTENS_ALT_TAGE = 10;    // jüngster Eintrag; deckt Feiertage und lange Wochenenden ab

function pruefe(m, daten, heute = new Date()) {
  if (!Array.isArray(daten)) throw new Error(m + ": Antwort ist keine Liste");
  const gut = daten.filter((e) =>
    e && /^\d{4}-\d{2}-\d{2}$/.test(e.d) && Array.isArray(e.v) &&
    typeof e.v[0] === "number" && e.v[0] > 0);
  if (gut.length < MINDEST_TAGE) throw new Error(m + ": nur " + gut.length + " brauchbare Tage");
  gut.sort((a, b) => (a.d < b.d ? -1 : 1));
  const juengster = gut[gut.length - 1].d;
  const alter = (heute - new Date(juengster + "T00:00:00Z")) / 864e5;
  if (alter > HOECHSTENS_ALT_TAGE) throw new Error(m + ": jüngster Tag " + juengster + " ist " + Math.floor(alter) + " Tage alt");
  // Nur, was die App liest — hält die Dateien klein
  return gut.map((e) => ({ d: e.d, v: e.v.slice(0, 3) }));
}

async function hole(url) {
  const antwort = await fetch(url, {
    headers: { "User-Agent": "Goldschmiede-Rechner (GitHub Actions; Kursverlauf)", "Accept": "application/json" }
  });
  if (!antwort.ok) throw new Error(url + ": HTTP " + antwort.status);
  return antwort.json();
}

async function main() {
  const ziel = process.argv[2] || path.join(__dirname, "..", "verlauf");
  fs.mkdirSync(ziel, { recursive: true });
  let fehler = 0;
  for (const [m, url] of Object.entries(QUELLEN)) {
    try {
      const reihe = pruefe(m, await hole(url));
      fs.writeFileSync(path.join(ziel, m + ".json"), JSON.stringify(reihe));
      console.log(m + ": " + reihe.length + " Tage bis " + reihe[reihe.length - 1].d);
    } catch (e) {
      fehler++;
      console.error("FEHLER " + e.message + " — vorhandene Datei bleibt unverändert");
    }
  }
  if (fehler) process.exit(1);
}

if (require.main === module) main();
module.exports = { pruefe };
