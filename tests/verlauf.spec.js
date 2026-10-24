// Kursverlauf: kommt aus der eigenen Aufzeichnung unter verlauf/, die GitHub
// Actions werktags fortschreibt (werkzeuge/verlauf-holen.js). LBMA und Stooq
// sperren seit Oktober 2026 jede Abfrage und werden nicht mehr gefragt.
const { test, expect, reiter, de } = require("./helfer");
const UNZE = 31.1034768;

// Erzeugte Aufzeichnung: Werktage bis gestern, Euro steigt linear, Pfund leer
function aufzeichnung(tage, euroStart = 2400) {
  const out = [];
  const heute = new Date();
  for (let i = tage; i >= 1; i--) {
    const d = new Date(heute.getTime() - i * 864e5);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const eur = euroStart + (tage - i);
    out.push({ d: d.toISOString().slice(0, 10), v: [eur * 1.08, null, eur] });
  }
  return out;
}

async function oeffneVerlauf(page, metall = "XAU") {
  await reiter(page, "wert");
  await page.click(`.kurs-tile[data-metall="${metall}"]`);
  await expect(page.locator("#verlauf-box")).toBeVisible();
}

test("Verlauf kommt aus der eigenen Aufzeichnung, ohne fremde Server zu fragen", async ({ page, context }) => {
  const reihe = aufzeichnung(400);
  const fremd = [];
  page.on("request", (r) => { if (/lbma|stooq/.test(r.url())) fremd.push(r.url()); });
  await context.route("**/verlauf/XAU.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(reihe) }));

  await oeffneVerlauf(page);
  const fuss = page.locator("#verlauf-inhalt .verlauf-fuss");
  await expect(fuss).toContainText("Täglich aufgezeichnete Kurse (gold-api.com");
  await expect(fuss).toContainText("Polnischen Nationalbank");          // nur bei Gold

  // letzter Punkt: Euro je Unze aus der Aufzeichnung, umgerechnet auf Gramm
  await expect(page.locator("#verlauf-inhalt")).toContainText(de(reihe[reihe.length - 1].v[2] / UNZE, 2));
  expect(fremd).toEqual([]);
});

test("reicht die Aufzeichnung nicht so weit zurück, nennt die Fußzeile den Beginn", async ({ page, context }) => {
  const reihe = aufzeichnung(20);                                        // gut zwei Wochen
  await context.route("**/verlauf/XAG.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(reihe) }));
  await oeffneVerlauf(page, "XAG");
  await page.click('#verlauf-bereiche button[data-bereich="jahr"]');
  const beginn = new Date(reihe[0].d + "T12:00:00Z").toLocaleDateString("de-DE",
    { day: "2-digit", month: "2-digit", year: "numeric" });
  const fuss = page.locator("#verlauf-inhalt .verlauf-fuss");
  await expect(fuss).toContainText("Aufgezeichnet seit dem " + beginn);
  await expect(fuss).not.toContainText("Nationalbank");                 // gilt nur für Gold

  // bei "Gesamt" zeigt die Achse den Beginn, die Fußzeile wiederholt ihn nicht
  await page.click('#verlauf-bereiche button[data-bereich="gesamt"]');
  await expect(fuss).not.toContainText("Aufgezeichnet seit");
});

test("gerade erst begonnen: freundlicher Hinweis statt Fehler", async ({ page, context }) => {
  await context.route("**/verlauf/XPT.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify([{ d: "2026-10-23", v: [1558, null, 1340] }]) }));
  await oeffneVerlauf(page, "XPT");
  await expect(page.locator("#verlauf-inhalt")).toContainText(
    "Der Verlauf für Platin wird seit dem 23.10.2026 Tag für Tag aufgezeichnet");
  await expect(page.locator("#verlauf-inhalt")).not.toContainText("nicht abrufbar");
});

test("fehlt die Datei, sagt die Diagnose es", async ({ page, context }) => {
  await context.route("**/verlauf/*.json", (r) => r.fulfill({ status: 404, body: "" }));
  await oeffneVerlauf(page);
  await expect(page.locator("#verlauf-inhalt")).toContainText("Aufzeichnung: Server antwortet mit HTTP 404");
});
