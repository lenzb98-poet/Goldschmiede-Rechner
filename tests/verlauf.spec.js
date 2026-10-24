// Kursverlauf: kommt aus der eigenen Kopie der LBMA-Daten unter verlauf/,
// die GitHub Actions täglich auffrischt. LBMA und Stooq direkt sind nur
// noch Rückfall — sie beantworten Abfragen aus dem Browser nicht mehr (CORS).
const { test, expect, reiter, de } = require("./helfer");
const UNZE = 31.1034768;

// Erzeugte Reihe im LBMA-Format: Werktage bis gestern, Euro steigt linear
function lbmaReihe(tage, euroStart = 2400) {
  const out = [];
  const heute = new Date();
  for (let i = tage; i >= 1; i--) {
    const d = new Date(heute.getTime() - i * 864e5);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const eur = euroStart + (tage - i);
    out.push({ d: d.toISOString().slice(0, 10), v: [eur * 1.08, eur * 0.86, eur] });
  }
  return out;
}

test("Verlauf kommt aus der eigenen Kopie, ohne LBMA oder Stooq zu fragen", async ({ page, context }) => {
  const reihe = lbmaReihe(400);
  const fremd = [];
  page.on("request", (r) => { if (/lbma|stooq/.test(r.url())) fremd.push(r.url()); });
  await context.route("**/verlauf/XAU.json", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(reihe) }));

  await reiter(page, "wert");
  await page.click('.kurs-tile[data-metall="XAU"]');
  await expect(page.locator("#verlauf-box")).toBeVisible();
  await expect(page.locator("#verlauf-inhalt .verlauf-fuss")).toContainText("Amtliche Londoner Fixings (LBMA)");

  // letzter Punkt: Euro je Unze aus der Kopie, umgerechnet auf Gramm
  const letzter = reihe[reihe.length - 1].v[2] / UNZE;
  await expect(page.locator("#verlauf-inhalt")).toContainText(de(letzter, 2));
  expect(fremd).toEqual([]);
});

test("fehlt die Kopie, springen LBMA und Stooq ein", async ({ page, context }) => {
  const reihe = lbmaReihe(60);
  await context.route("**/verlauf/XAU.json", (r) => r.fulfill({ status: 404, body: "" }));
  await context.unroute("**/prices.lbma.org.uk/**");
  await context.route("**/prices.lbma.org.uk/**", (r) =>
    r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(reihe) }));

  await reiter(page, "wert");
  await page.click('.kurs-tile[data-metall="XAU"]');
  await expect(page.locator("#verlauf-inhalt .verlauf-fuss")).toContainText("LBMA");
  await expect(page.locator("#verlauf-inhalt")).toContainText(de(reihe[reihe.length - 1].v[2] / UNZE, 2));
});

test("ist gar nichts zu holen, nennt die Diagnose auch die Kopie", async ({ page, context }) => {
  await context.route("**/verlauf/*.json", (r) => r.fulfill({ status: 404, body: "" }));
  await reiter(page, "wert");
  await page.click('.kurs-tile[data-metall="XAU"]');
  await expect(page.locator("#verlauf-inhalt")).toContainText("LBMA-Kopie: Server antwortet mit HTTP 404");
});
