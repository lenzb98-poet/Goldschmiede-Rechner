// Zeichnet den Kursverlauf für Gold, Silber und Platin selbst auf und legt ihn
// unter verlauf/ neben die App. Läuft werktags in GitHub Actions
// (.github/workflows/verlauf.yml); die App liest die Dateien von ihrer
// eigenen Adresse, das kann kein Anbieter per CORS blockieren.
//
// Warum selbst aufzeichnen: LBMA und Stooq sperren seit Oktober 2026 jede
// Abfrage, auch von GitHubs Servern; eine freie Quelle mit fertiger
// Historie für alle drei Metalle gibt es nicht mehr. Deshalb:
//
//   1. Jeden Werktag ein Eintrag aus gold-api.com — dieselbe Quelle wie die
//      Kacheln der App —, mit dem EZB-Referenzkurs desselben Tages in Euro.
//   2. Für Gold einmalig die Historie ab 2013 von der Polnischen
//      Nationalbank (NBP, Złoty je Gramm Feingold), Tag für Tag mit den
//      EZB-Kursen umgerechnet. Silber und Platin wachsen ab dem Start.
//
// Format wie bisher bei der LBMA: [{ d: "JJJJ-MM-TT", v: [USD, null, EUR] }],
// jeweils je Feinunze. Die mittlere Spalte (Pfund) gibt es hier nicht.
//
// Schutz vor Unsinn: Ein Tageswert, der mehr als MAX_SPRUNG vom letzten
// gespeicherten abweicht, wird nicht geschrieben — der Lauf schlägt dann
// sichtbar fehl, die Datei bleibt, wie sie war.
//
// Aufruf: node werkzeuge/verlauf-holen.js [zielordner]
const fs = require("fs");
const path = require("path");

const UNZE = 31.1034768;
const METALLE = ["XAU", "XAG", "XPT"];
const MAX_SPRUNG = 0.25;
const NBP_START = "2013-01-02";          // ab hier liefert die NBP Goldpreise
const FX = "https://api.frankfurter.dev/v1/";

async function holeJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Goldschmiede-Rechner (GitHub Actions; Kursverlauf)" } });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return r.json();
}

function isoTag(d) { return d.toISOString().slice(0, 10); }
function letzterFreitag(iso) {
  const d = new Date(iso + "T12:00:00Z");
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return isoTag(d);
}
function istWerktag(iso) { const t = new Date(iso + "T12:00:00Z").getUTCDay(); return t !== 0 && t !== 6; }
const runde = (x) => Math.round(x * 100) / 100;

// --- Tageseintrag aus gold-api.com ---------------------------------------
async function tagesEintrag(m, eurJeUsd) {
  const d = await holeJson("https://api.gold-api.com/price/" + m);
  const usd = typeof d.price === "string" ? parseFloat(d.price) : d.price;
  if (!(usd > 0)) throw new Error(m + ": Preis fehlt in der Antwort");
  const tag = (d.updatedAt || new Date().toISOString()).slice(0, 10);
  return { d: tag, v: [runde(usd), null, runde(usd * eurJeUsd)] };
}

// --- Goldhistorie der NBP, in Euro und Dollar je Unze ---------------------
// fx: sortierte Liste { d, pln, usd } je Euro (EZB). Für jeden NBP-Tag gilt
// der letzte EZB-Kurs bis zu diesem Tag.
function nbpInUnzen(nbp, fx) {
  const out = [];
  let i = 0, letzter = null;
  for (const e of nbp) {
    while (i < fx.length && fx[i].d <= e.data) letzter = fx[i++];
    if (!letzter || !(e.cena > 0)) continue;
    const eur = e.cena * UNZE / letzter.pln;
    out.push({ d: e.data, v: [runde(eur * letzter.usd), null, runde(eur)] });
  }
  return out;
}

async function goldHistorie(bis) {
  // NBP erlaubt höchstens 367 Tage je Abfrage
  const nbp = [];
  for (let jahr = Number(NBP_START.slice(0, 4)); jahr <= Number(bis.slice(0, 4)); jahr++) {
    const von = jahr === 2013 ? NBP_START : jahr + "-01-01";
    const ende = jahr + "-12-31" < bis ? jahr + "-12-31" : bis;
    if (von > ende) break;
    try {
      nbp.push(...await holeJson("https://api.nbp.pl/api/cenyzlota/" + von + "/" + ende + "?format=json"));
    } catch (e) {
      if (!/HTTP 404/.test(e.message)) throw e;   // 404 = keine Daten im Zeitraum
    }
  }
  const fx = [];
  for (let jahr = 2012; jahr <= Number(bis.slice(0, 4)); jahr++) {
    const r = await holeJson(FX + jahr + "-01-01.." + jahr + "-12-31?base=EUR&symbols=PLN,USD");
    for (const [d, k] of Object.entries(r.rates || {})) if (k.PLN > 0 && k.USD > 0) fx.push({ d, pln: k.PLN, usd: k.USD });
  }
  fx.sort((a, b) => (a.d < b.d ? -1 : 1));
  nbp.sort((a, b) => (a.data < b.data ? -1 : 1));
  return nbpInUnzen(nbp, fx);
}

// --- Zusammenführen und prüfen -------------------------------------------
// Vorhandenes bleibt, ein Eintrag desselben Tages wird ersetzt, eigene
// Aufzeichnungen gehen der NBP-Historie vor.
function fuegeEin(reihe, eintrag) {
  const ohne = reihe.filter((e) => e.d !== eintrag.d);
  ohne.push(eintrag);
  return ohne.sort((a, b) => (a.d < b.d ? -1 : 1));
}

function pruefeSprung(m, reihe, eintrag) {
  const vorher = reihe.filter((e) => e.d < eintrag.d).pop();
  if (!vorher) return;
  const sprung = Math.abs(eintrag.v[2] / vorher.v[2] - 1);
  if (sprung > MAX_SPRUNG) {
    throw new Error(m + ": " + eintrag.d + " weicht um " + Math.round(sprung * 100) +
                    " % vom " + vorher.d + " ab — nicht gespeichert");
  }
}

async function main() {
  const ziel = process.argv[2] || path.join(__dirname, "..", "verlauf");
  fs.mkdirSync(ziel, { recursive: true });
  const heute = isoTag(new Date());
  const fx = await holeJson(FX + "latest?base=USD&symbols=EUR");
  const eurJeUsd = fx.rates && fx.rates.EUR;
  if (!(eurJeUsd > 0)) throw new Error("EZB-Kurs fehlt");

  let fehler = 0;
  for (const m of METALLE) {
    const datei = path.join(ziel, m + ".json");
    try {
      let reihe = fs.existsSync(datei) ? JSON.parse(fs.readFileSync(datei, "utf8")) : [];

      if (m === "XAU" && !reihe.some((e) => e.d < "2014-01-01")) {
        const historie = await goldHistorie(heute);
        console.log("XAU: NBP-Historie " + historie.length + " Tage, " +
                    (historie[0] || {}).d + " bis " + (historie[historie.length - 1] || {}).d);
        const eigene = new Set(reihe.map((e) => e.d));
        reihe = reihe.concat(historie.filter((e) => !eigene.has(e.d)))
                     .sort((a, b) => (a.d < b.d ? -1 : 1));
      }

      const eintrag = await tagesEintrag(m, eurJeUsd);
      // Am Wochenende steht bei gold-api.com der Freitagsschluss mit dem
      // Datum von Samstag oder Sonntag: er gehört zum Freitag — aber nur,
      // wenn der Freitag nicht schon aufgezeichnet ist.
      if (!istWerktag(eintrag.d)) eintrag.d = letzterFreitag(eintrag.d);
      if (reihe.some((e) => e.d === eintrag.d) && eintrag.d !== heute) {
        console.log(m + ": " + eintrag.d + " ist schon aufgezeichnet");
      } else {
        pruefeSprung(m, reihe, eintrag);
        reihe = fuegeEin(reihe, eintrag);
        console.log(m + ": " + eintrag.d + " · " + eintrag.v[0] + " USD · " + eintrag.v[2] + " EUR je Unze");
      }
      fs.writeFileSync(datei, JSON.stringify(reihe));
      console.log(m + ": " + reihe.length + " Tage gespeichert");
    } catch (e) {
      fehler++;
      console.error("FEHLER " + e.message + " — Datei bleibt unverändert");
    }
  }
  if (fehler) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error("FEHLER " + e.message); process.exit(1); });
module.exports = { nbpInUnzen, fuegeEin, pruefeSprung, istWerktag, letzterFreitag };
