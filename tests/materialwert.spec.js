// Materialwert: Gewicht oder Blechmaße × Feingehalt × Tageskurs,
// Weißgold mit Palladiumanteil.
const { test, expect, KURSE, reiter, de, betrag } = require("./helfer");

const DICHTE = { XAU: { 585: 13.10, 750: 15.45 }, XWG: { 375: 12.90, 585: 14.60, 750: 16.40 } };
const PD_ANTEIL = 0.19;

const wert = (page) => page.locator("#wert-ergebnis .result-main .value");
const kachel = (page, label) => page.locator("#wert-ergebnis .result-item")
  .filter({ has: page.locator(".label", { hasText: new RegExp("^" + label + "$") }) })
  .locator(".value");

test.beforeEach(async ({ page }) => {
  await reiter(page, "wert");
  await expect(page.locator("#kurs-XAU")).toHaveText(de(KURSE.XAU, 2));
});

test("Kacheln zeigen die Tageskurse, Palladium klein an der Weißgold-Taste", async ({ page }) => {
  await expect(page.locator("#kurs-XAG")).toHaveText(de(KURSE.XAG, 3));   // unter 10 €/g drei Stellen
  await expect(page.locator("#kurs-XPT")).toHaveText(de(KURSE.XPT, 2));
  await expect(page.locator("#kurs-XPD")).toHaveCount(0);                 // keine eigene Kachel
  await expect(page.locator("#wert-pd-kurs")).toHaveText("Pd " + de(KURSE.XPD, 2) + " €/g");
});

for (const [m, f] of [["XAU", "585"], ["XAG", "925"], ["XPT", "950"]]) {
  test(`Gewicht: 10 g ${m} ${f}`, async ({ page }) => {
    await page.click(`#wert-metall button[data-metall="${m}"]`);
    await page.selectOption("#wert-feingehalt", f);
    await page.fill("#wert-gewicht", "10");
    await expect(wert(page)).toHaveText(betrag(10 * (+f / 1000) * KURSE[m]));
    await expect(kachel(page, "Palladium")).toHaveCount(0);
  });
}

test("Weißgold: Feingold zum Goldkurs plus Palladiumanteil zum Palladiumkurs", async ({ page }) => {
  await page.click('#wert-metall button[data-metall="XWG"]');
  const stempel = await page.locator("#wert-feingehalt option").evaluateAll((o) => o.map((x) => x.value));
  expect(stempel).toEqual(["375", "585", "750"]);
  await expect(page.locator("#wert-feingehalt")).toHaveValue("585");

  await page.fill("#wert-gewicht", "10");
  const au = 10 * 0.585, pd = 10 * PD_ANTEIL;
  await expect(wert(page)).toHaveText(betrag(au * KURSE.XAU + pd * KURSE.XPD));
  await expect(kachel(page, "Feingold")).toHaveText(de(au, 2) + " g");
  await expect(kachel(page, "Palladium")).toHaveText(de(pd, 2) + " g");
});

test.describe("Blech", () => {
  test.beforeEach(async ({ page }) => {
    await page.click('#wert-mode button[data-mode="blech"]');
  });

  test("Auswahllisten statt Tippfeldern, lückenlos in festen Schritten", async ({ page }) => {
    const werte = (id) => page.locator(`#${id} option`).evaluateAll((o) => o.map((x) => +x.value));
    for (const [id, min, max, schritt, anzahl] of [
      ["wert-blech-x", 1, 100, 1, 100],
      ["wert-blech-y", 1, 100, 1, 100],
      ["wert-blech-s", 0.1, 5, 0.1, 50]
    ]) {
      const v = await werte(id);
      expect(v).toHaveLength(anzahl);
      expect(v[0]).toBeCloseTo(min, 9);
      expect(v[v.length - 1]).toBeCloseTo(max, 9);
      v.slice(1).forEach((x, i) => expect(x - v[i]).toBeCloseTo(schritt, 9));
      expect(await page.locator("#" + id).evaluate((e) => e.tagName)).toBe("SELECT");
    }
    await expect(page.locator("#wert-blech-s option").nth(2)).toHaveText("0,3 mm");
  });

  test("Länge neben Breite, Stärke darunter über die volle Breite", async ({ page }) => {
    const x = await page.locator("#wert-blech-x").boundingBox();
    const y = await page.locator("#wert-blech-y").boundingBox();
    const s = await page.locator("#wert-blech-s").boundingBox();
    expect(Math.abs(x.y - y.y)).toBeLessThan(2);
    expect(x.x).toBeLessThan(y.x);
    expect(Math.abs(x.width - y.width)).toBeLessThan(2);
    expect(s.y).toBeGreaterThan(x.y + x.height - 2);
    expect(s.width).toBeGreaterThan(x.width * 1.8);
  });

  for (const [lx, ly, st] of [[40, 25, 1.2], [1, 1, 0.1], [100, 100, 5]]) {
    test(`${lx} × ${ly} × ${de(st, 1)} mm Gold 585 über Volumen und Dichte`, async ({ page }) => {
      await page.selectOption("#wert-blech-x", String(lx));
      await page.selectOption("#wert-blech-y", String(ly));
      await page.selectOption("#wert-blech-s", String(st));
      const gramm = lx * ly * st / 1000 * DICHTE.XAU[585];
      await expect(wert(page)).toHaveText(betrag(gramm * 0.585 * KURSE.XAU));
    });
  }

  test("Weißgold-Blech: jede Legierung mit ihrer eigenen Dichte", async ({ page }) => {
    await page.click('#wert-metall button[data-metall="XWG"]');
    await page.selectOption("#wert-blech-x", "40");
    await page.selectOption("#wert-blech-y", "25");
    await page.selectOption("#wert-blech-s", "1.2");
    for (const f of [375, 585, 750]) {
      await page.selectOption("#wert-feingehalt", String(f));
      const g = 40 * 25 * 1.2 / 1000 * DICHTE.XWG[f];
      await expect(wert(page)).toHaveText(betrag(g * f / 1000 * KURSE.XAU + g * PD_ANTEIL * KURSE.XPD));
    }
  });
});
