// Bedienung über alle Module: Reiterleiste, Abstände, Lage des Formel-Punkts.
const { test, expect, reiter } = require("./helfer");

test.describe("Reiterleiste", () => {
  test.use({ viewport: { width: 390, height: 700 } });     // echte Handyhöhe, damit es etwas zu scrollen gibt

  test("bleibt beim Scrollen oben stehen", async ({ page }) => {
    await reiter(page, "umfang");                       // lange Ringgrößentabelle
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const leiste = await page.locator(".tab-leiste").boundingBox();
    expect(Math.abs(leiste.y)).toBeLessThan(1);
    await expect(page.locator('.tab[data-tab="mohs"]')).toBeAttached();
  });

  test("Wechsel zeigt das neue Modul von oben", async ({ page }) => {
    await reiter(page, "umfang");
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    await page.click('.tab[data-tab="einheiten"]');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("gewählter Reiter rückt ins Bild", async ({ page }) => {
    await reiter(page, "mohs");                          // ganz rechts in der Leiste
    await expect.poll(async () => {
      const leiste = await page.locator("#tabs").boundingBox();
      const tab = await page.locator('.tab[data-tab="mohs"]').boundingBox();
      return tab.x >= leiste.x - 1 && tab.x + tab.width <= leiste.x + leiste.width + 1;
    }).toBe(true);
    await expect(page.locator("#tabs")).toHaveClass(/mehr-links/);
  });

  test("weicher Rand nur, wo es weitergeht", async ({ page }) => {
    await expect(page.locator("#tabs")).toHaveClass(/mehr-rechts/);
    await expect(page.locator("#tabs")).not.toHaveClass(/mehr-links/);
  });

  test("merkt sich den zuletzt offenen Reiter", async ({ page }) => {
    await reiter(page, "legierung");
    await page.reload();
    await expect(page.locator("#panel-legierung")).toHaveClass(/active/);
    await expect(page.locator('.tab[data-tab="legierung"]')).toHaveClass(/active/);
  });

  test("Materialwert als letzter Reiter fragt beim Start gleich die Kurse ab", async ({ page }) => {
    await reiter(page, "wert");
    await page.reload();
    await expect(page.locator("#kurs-stand")).toHaveText(/^Stand: /);
  });
});

test.describe("Abstände", () => {
  // Zwischen einem Feld und der nächsten Beschriftung bleibt Luft
  async function luft(page, feld, beschriftung) {
    const a = await page.locator(feld).boundingBox();
    const b = await page.locator(beschriftung).boundingBox();
    return b.y - (a.y + a.height);
  }

  test("Legierung: Zielmenge klebt nicht an der Legierung", async ({ page }) => {
    await reiter(page, "legierung");
    expect(await luft(page, "#leg-menge", 'label[for="leg-sorte"]')).toBeGreaterThan(10);
  });

  test("Steingewicht: Maße kleben nicht an der Steinart", async ({ page }) => {
    await reiter(page, "stein");
    expect(await luft(page, ".st-mass-wert >> nth=0", 'label[for="st-stein"]')).toBeGreaterThan(10);
  });

  test("Materialwert: „erneut abfragen“ klebt nicht an der Handeingabe", async ({ page }) => {
    await reiter(page, "wert");
    await expect(page.locator("#kurs-retry")).toBeVisible();
    expect(await luft(page, "#kurs-retry", "#kurs-hand-box summary")).toBeGreaterThan(8);
  });

  test("Steingewicht: allein stehende Auswahlfelder sind gleich breit", async ({ page }) => {
    await reiter(page, "stein");
    const breiten = await Promise.all(["#st-form", "#st-stein", "#st-rundiste"].map(
      async (id) => Math.round((await page.locator(id).boundingBox()).width)));
    expect(new Set(breiten).size).toBe(1);
  });
});

test.describe("Formel-Punkt liegt frei", () => {
  function ueberlappt(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  test("Einheiten: nicht auf einer Kachel", async ({ page }) => {
    await reiter(page, "einheiten");
    await page.fill("#einheiten-wert", "10");
    await expect(page.locator(".einheiten-kopf")).toHaveText("10 g entsprechen");
    const punkt = await page.locator("#einheiten-ergebnis .formel-knopf").boundingBox();
    for (const kachel of await page.locator(".einheiten-kachel").all()) {
      expect(ueberlappt(punkt, await kachel.boundingBox())).toBe(false);
    }
    // und die Kacheln bleiben in der Karte
    const karte = await page.locator("#einheiten-ergebnis").boundingBox();
    for (const kachel of await page.locator(".einheiten-kachel").all()) {
      const k = await kachel.boundingBox();
      expect(k.x + k.width).toBeLessThanOrEqual(karte.x + karte.width);
    }
  });

  test("Metallkalkulation: ohne Händlermodus in der Ecke, mit daneben", async ({ page }) => {
    await reiter(page, "metallkalk");
    const z = page.locator(".mk-posten-zeile").first();
    for (const [i, v] of [[0, "40"], [1, "25"], [2, "1,2"]]) await z.locator(".mk-mass-wert").nth(i).fill(v);
    const karte = await page.locator(".mk-ergebnis-karte").boundingBox();
    const punkt = await page.locator(".mk-ergebnis-karte .formel-knopf").boundingBox();
    expect(karte.x + karte.width - (punkt.x + punkt.width)).toBeLessThan(20);

    await page.click("#mk-haendler-an");
    await page.click("#mk-haendler-knopf");
    const punkt2 = await page.locator(".mk-ergebnis-karte .formel-knopf").boundingBox();
    const haendler = await page.locator("#mk-haendler-knopf").boundingBox();
    expect(ueberlappt(punkt2, haendler)).toBe(false);
  });
});
