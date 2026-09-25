// Umfang & Ø — und der rote Formel-Punkt an jedem Ergebnis aller Module.
const { test, expect, reiter, de } = require("./helfer");

test.describe("Umfang & Ø", () => {
  test.beforeEach(async ({ page }) => {
    await reiter(page, "umfang");
  });

  async function manuell(page, wert) {
    if (!(await page.locator("#umfang-value-manual").isVisible())) await page.click("#umfang-value-toggle");
    await page.fill("#umfang-value", wert);
  }

  test("Innenumfang 54 mm → Durchmesser", async ({ page }) => {
    await manuell(page, "54");
    await expect(page.locator("#umfang-output .result-main .value")).toHaveText(
      new RegExp("^" + de(54 / Math.PI, 2) + "\\s*mm$"));
  });

  test("Durchmesser 17 mm → Umfang", async ({ page }) => {
    await page.click('#umfang-mode button[data-mode="durchmesser"]');
    await manuell(page, "17");
    await expect(page.locator("#umfang-output .result-main .value")).toHaveText(
      new RegExp("^" + de(17 * Math.PI, 2) + "\\s*mm$"));
  });
});

test.describe("roter Formel-Punkt", () => {
  // Punkt da, Kasten zu → Klick öffnet mit Inhalt → Klick schließt
  async function pruefe(page, karte) {
    const knopf = page.locator(karte + " .formel-knopf").first();
    const box = page.locator(karte + " .formel-box").first();
    await expect(knopf, karte).toBeVisible();
    await expect(box).toBeHidden();
    await expect(knopf).toHaveAttribute("aria-expanded", "false");
    await knopf.click();
    await expect(box).toBeVisible();
    await expect(knopf).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator(karte + " .formel-zeile").count()).toBeGreaterThan(0);
    await knopf.click();
    await expect(box).toBeHidden();
  }

  test("Ringrechner", async ({ page }) => {
    await page.click("#ring-value-toggle");
    await page.fill("#ring-value", "54");
    await page.click("#ring-thickness-toggle");
    await page.fill("#ring-thickness", "1,5");
    await pruefe(page, "#ring-output");
    await page.click("#ring-bevel-on");
    await pruefe(page, "#ring-bevel");
  });

  test("Umfang & Ø", async ({ page }) => {
    await reiter(page, "umfang");
    await pruefe(page, "#umfang-output");
  });

  test("Materialwert: Gewicht, Blech, Weißgold", async ({ page }) => {
    await reiter(page, "wert");
    await page.fill("#wert-gewicht", "12,5");
    await pruefe(page, "#wert-ergebnis");
    await page.click('#wert-mode button[data-mode="blech"]');
    await pruefe(page, "#wert-ergebnis");
    await page.click('#wert-metall button[data-metall="XWG"]');
    await pruefe(page, "#wert-ergebnis");
  });

  test("Goldankauf: nur im Händlerbereich, weil der Rechenweg die Kurse zeigt", async ({ page }) => {
    await reiter(page, "goldankauf");
    await page.locator(".ga-zeile").first().locator(".ga-gramm").fill("10");
    await expect(page.locator("#panel-goldankauf .formel-knopf")).toBeHidden();
    await page.click("#goldankauf-haendler-knopf");
    await pruefe(page, ".ga-ergebnis-karte");
  });

  test("Metallkalkulation: im Händlermodus nur bei offenem Bereich", async ({ page }) => {
    await reiter(page, "metallkalk");
    const z = page.locator(".mk-posten-zeile").first();
    for (const [i, v] of [[0, "40"], [1, "25"], [2, "1,2"]]) await z.locator(".mk-mass-wert").nth(i).fill(v);
    await pruefe(page, ".mk-ergebnis-karte");
    await page.click("#mk-haendler-an");
    await expect(page.locator(".mk-ergebnis-karte .formel-knopf")).toBeHidden();
    await page.click("#mk-haendler-knopf");
    await pruefe(page, ".mk-ergebnis-karte");
  });

  test("Legierung: ansetzen und umlegieren", async ({ page }) => {
    await reiter(page, "legierung");
    await page.fill("#leg-menge", "20");
    await pruefe(page, "#leg-ergebnis");
    await page.click('#leg-mode button[data-mode="umlegieren"]');
    await page.fill("#leg-vorhanden", "10");
    await page.selectOption("#leg-fein", "750");
    await pruefe(page, "#leg-ergebnis");
  });

  test("Steingewicht: beide Richtungen, mit Rundistenzuschlag", async ({ page }) => {
    await reiter(page, "stein");
    await page.locator(".st-mass-wert").nth(0).fill("6,5");
    await page.locator(".st-mass-wert").nth(1).fill("4,0");
    await pruefe(page, "#st-ergebnis");
    await page.selectOption("#st-rundiste", "dick");
    await pruefe(page, "#st-ergebnis");
    await page.click('#st-mode button[data-mode="masse"]');
    await page.fill("#st-karat", "1,00");
    await pruefe(page, "#st-ergebnis");
  });

  test("Schliffformen", async ({ page }) => {
    await reiter(page, "schliff");
    await pruefe(page, "#sf-liste");
  });

  test("Einheiten", async ({ page }) => {
    await reiter(page, "einheiten");
    await page.fill("#einheiten-wert", "10");
    await pruefe(page, "#einheiten-ergebnis");
  });

  test("Mohshärte, mit und ohne Auswahl", async ({ page }) => {
    await reiter(page, "mohs");
    await pruefe(page, "#mh-detail");
    await page.locator(".mh-zeile").first().click();
    await pruefe(page, "#mh-detail");
  });

  test("Ring ändern, mit und ohne DIN", async ({ page }) => {
    await reiter(page, "verkleinern");
    await pruefe(page, "#rv-ergebnis");
    await page.check("#rv-k-auto");
    await pruefe(page, "#rv-ergebnis");
  });
});

test("kein Reiter ist mehr Platzhalter", async ({ page }) => {
  await expect(page.locator(".tab.pending")).toHaveCount(0);
  await expect(page.locator(".badge")).toHaveCount(0);
});
