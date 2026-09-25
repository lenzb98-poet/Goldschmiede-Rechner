// Einheiten: Gewicht und Länge in alle Richtungen.
const { test, expect, reiter, zahl } = require("./helfer");

const G = { mg: 0.001, pt: 0.002, ct: 0.2, dwt: 1.55517384, oz: 31.1034768, kg: 1000 };

const kachel = (page, label) => page.locator("#einheiten-ergebnis .result-item")
  .filter({ has: page.locator(".label", { hasText: new RegExp("^" + label + "$") }) });

// Angezeigte Zahl stimmt auf die angezeigten Nachkommastellen genau
async function zeigt(page, label, soll) {
  const text = (await kachel(page, label).locator(".value").textContent()).trim();
  const stellen = (text.match(/,(\d+)/) || ["", ""])[1].length;
  expect(Math.abs(zahl(text) - soll), `${label}: ${text}`).toBeLessThanOrEqual(0.5 * 10 ** -stellen + 1e-12);
}

test.beforeEach(async ({ page }) => {
  await reiter(page, "einheiten");
});

test("10 g in alle Gewichtseinheiten, aufsteigend, ohne die Ausgangseinheit", async ({ page }) => {
  await page.fill("#einheiten-wert", "10");
  await zeigt(page, "Milligramm", 10 / G.mg);
  await zeigt(page, "Punkt", 10 / G.pt);
  await zeigt(page, "Karat", 10 / G.ct);
  await zeigt(page, "Pennyweight", 10 / G.dwt);
  await zeigt(page, "Feinunze", 10 / G.oz);
  await zeigt(page, "Kilogramm", 10 / G.kg);
  expect(await page.locator("#einheiten-ergebnis .result-item .label").allInnerTexts())
    .toEqual(["Milligramm", "Punkt", "Karat", "Pennyweight", "Feinunze", "Kilogramm"]);
});

test("Ausgangseinheit Gramm ist voreingestellt, nicht die kleinste der Liste", async ({ page }) => {
  await expect(page.locator("#einheiten-von")).toHaveValue("g");
});

test("1 Feinunze in Gramm", async ({ page }) => {
  await page.selectOption("#einheiten-von", "oz");
  await page.fill("#einheiten-wert", "1");
  await zeigt(page, "Gramm", G.oz);
});

test("Länge: 100 mm, Kategoriewechsel setzt auf Millimeter", async ({ page }) => {
  await page.click('#einheiten-kategorie button[data-kategorie="laenge"]');
  await expect(page.locator("#einheiten-von")).toHaveValue("mm");
  await page.fill("#einheiten-wert", "100");
  await zeigt(page, "Zentimeter", 10);
  await zeigt(page, "Zoll", 100 / 25.4);
});

test("Kachel antippen macht sie zur Ausgangseinheit, Werte bleiben stimmig", async ({ page }) => {
  await page.fill("#einheiten-wert", "10");
  await kachel(page, "Karat").click();
  await expect(page.locator("#einheiten-von")).toHaveValue("ct");
  expect(zahl(await page.locator("#einheiten-wert").inputValue())).toBeCloseTo(50, 6);
  await zeigt(page, "Gramm", 10);
  await zeigt(page, "Kilogramm", 0.01);
});

test("auch mit der Tastatur", async ({ page }) => {
  await page.fill("#einheiten-wert", "5");
  await page.locator(".einheiten-kachel", { hasText: "Karat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#einheiten-von")).toHaveValue("ct");
});

test("leer und ungültig", async ({ page }) => {
  await page.fill("#einheiten-wert", "");
  await expect(page.locator("#einheiten-ergebnis .placeholder")).toHaveCount(1);
  await page.fill("#einheiten-wert", "abc");
  await expect(page.locator("#einheiten-ergebnis .hint")).toHaveCount(1);
});
