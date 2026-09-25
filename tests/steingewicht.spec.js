// Steingewicht aus den Maßen und umgekehrt — und die Schliffformen-Tafel,
// die dieselben Formen und dieselbe Rückrechnung benutzt.
const { test, expect, reiter, de } = require("./helfer");

// Formfaktor, Länge:Breite, Tiefe:Breite — unabhängig aus der Spezifikation
const FORM = {
  rund: [0.3466, 1.00, 0.615], oval: [0.3523, 1.40, 0.62], kissen: [0.4631, 1.10, 0.65],
  prinzess: [0.4716, 1.00, 0.72], smaragd: [0.4545, 1.40, 0.65], baguette: [0.5199, 2.00, 0.60],
  tropfen: [0.3494, 1.50, 0.60], navette: [0.3210, 2.00, 0.58], herz: [0.3352, 1.00, 0.60],
  trillant: [0.3239, 1.00, 0.48]
};
const SG = { diamant: 3.52, zirkonia: 5.75, saphir: 4.00, smaragd: 2.72 };
const karat = (l, b, t, form, stein) => l * b * t * FORM[form][0] * SG[stein] / 200;
function masseAus(ct, form, stein) {
  const [f, lb, tb] = FORM[form];
  const b = Math.cbrt(ct * 200 / (lb * tb * f * SG[stein]));
  return { b, l: b * lb, t: b * tb };
}

const ct = (n) => new RegExp("^" + de(n, 2) + "\\s*ct$");

test.describe("Steingewicht", () => {
  test.beforeEach(async ({ page }) => {
    await reiter(page, "stein");
  });

  async function masse(page, werte) {
    for (let i = 0; i < werte.length; i++) {
      await page.locator(".st-mass-wert").nth(i).fill(String(werte[i]).replace(".", ","));
    }
  }
  const wert = (page) => page.locator("#st-ergebnis .result-main .value");

  test("passt zu bekannten Handelsgrößen", async ({ page }) => {
    // Faustregeln des Handels: Ø6,5 ≈ 1 ct, Ø5,2 ≈ 0,5 ct, Ø3,0 ≈ 0,1 ct
    for (const [d, t, handel, toleranz] of [[6.5, 4.0, 1.0, 0.05], [5.2, 3.2, 0.5, 0.035], [3.0, 1.85, 0.1, 0.01]]) {
      await masse(page, [d, t]);
      const angezeigt = parseFloat((await wert(page).textContent()).replace(",", "."));
      expect(Math.abs(angezeigt - handel), `Ø${d}`).toBeLessThanOrEqual(toleranz);
    }
  });

  for (const [form, m, stein] of [
    ["rund", [6.5, 4.0], "diamant"], ["oval", [7, 5, 3.1], "diamant"], ["kissen", [6, 5.5, 3.6], "saphir"],
    ["prinzess", [5, 5, 3.6], "diamant"], ["smaragd", [7, 5, 3.3], "smaragd"], ["baguette", [4, 2, 1.2], "diamant"],
    ["tropfen", [8, 5.3, 3.2], "diamant"], ["navette", [10, 5, 2.9], "diamant"], ["herz", [6, 6, 3.6], "diamant"],
    ["trillant", [6, 6, 2.9], "zirkonia"]
  ]) {
    test(`${form} ${m.join(" × ")} ${stein}`, async ({ page }) => {
      await page.selectOption("#st-form", form);
      await page.selectOption("#st-stein", stein);
      await masse(page, m);
      const [l, b, t] = m.length === 2 ? [m[0], m[0], m[1]] : m;
      await expect(wert(page)).toHaveText(ct(karat(l, b, t, form, stein)));
    });
  }

  test("dicke Rundiste schlägt prozentual auf", async ({ page }) => {
    await masse(page, [6.5, 4.0]);
    await page.selectOption("#st-rundiste", "dick");            // +2 %
    await expect(wert(page)).toHaveText(ct(karat(6.5, 6.5, 4, "rund", "diamant") * 1.02));
  });

  test("umgekehrt: Maße aus dem Gewicht, und zurück ergibt dasselbe Gewicht", async ({ page }) => {
    await page.click('#st-mode button[data-mode="masse"]');
    await page.selectOption("#st-form", "oval");
    await page.fill("#st-karat", "1");
    const z = masseAus(1, "oval", "diamant");
    await expect(wert(page)).toHaveText(new RegExp("^" + de(z.l, 1) + " × " + de(z.b, 1) + "\\s*mm$"));
    expect(karat(z.l, z.b, z.t, "oval", "diamant")).toBeCloseTo(1, 9);
    await expect(page.locator("#st-rundiste-feld")).toBeHidden();
  });

  test("1 ct Brillant ≈ Ø 6,4 mm", async ({ page }) => {
    await page.click('#st-mode button[data-mode="masse"]');
    await page.fill("#st-karat", "1");
    await expect(wert(page)).toHaveText(/^6,4\s*mm$/);
  });
});

test.describe("Schliffformen", () => {
  test.beforeEach(async ({ page }) => {
    await reiter(page, "schliff");
  });

  test("alle zehn Formen mit Umriss, Namen und Fass-Hinweis", async ({ page }) => {
    const zeilen = page.locator(".sf-zeile");
    await expect(zeilen).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      const z = zeilen.nth(i);
      await expect(z.locator("svg.st-umriss")).toHaveCount(1);
      await expect(z.locator(".sf-name")).not.toBeEmpty();
      await expect(z.locator(".sf-fassen")).not.toBeEmpty();
    }
    // gleiche Reihenfolge und Namen wie im Steingewicht
    const namen = await page.locator(".sf-name").allInnerTexts();
    const stein = await page.locator("#st-form option").allInnerTexts();
    expect(namen).toEqual(stein);
  });

  test("Umriss in den üblichen Proportionen der Form", async ({ page }) => {
    for (const form of ["navette", "baguette", "oval", "rund"]) {
      const svg = page.locator(`.sf-zeile[data-form="${form}"] svg`);
      const w = +(await svg.getAttribute("width")), h = +(await svg.getAttribute("height"));
      expect(w / h, form).toBeCloseTo(FORM[form][1], 2);
    }
  });

  test("Maße je Form für 1 ct Diamant — dieselbe Rechnung wie im Steingewicht", async ({ page }) => {
    for (const form of Object.keys(FORM)) {
      const z = masseAus(1, form, "diamant");
      const soll = form === "rund" ? "Ø " + de(z.b, 1) + " mm" : de(z.l, 1) + " × " + de(z.b, 1) + " mm";
      await expect(page.locator(`.sf-zeile[data-form="${form}"] .sf-masse`), form)
        .toHaveText(soll + " · Tiefe " + de(z.t, 1) + " mm");
    }
  });

  test("Gewicht und Steinart umstellen rechnet alle Zeilen neu", async ({ page }) => {
    await page.selectOption("#sf-karat", "0.5");
    await page.selectOption("#sf-stein", "zirkonia");
    const z = masseAus(0.5, "navette", "zirkonia");
    await expect(page.locator('.sf-zeile[data-form="navette"] .sf-masse'))
      .toHaveText(de(z.l, 1) + " × " + de(z.b, 1) + " mm · Tiefe " + de(z.t, 1) + " mm");
  });

  test("„Gewicht schätzen“ öffnet das Steingewicht mit Form und Steinart", async ({ page }) => {
    await page.selectOption("#sf-stein", "saphir");
    await page.click('.sf-zeile[data-form="tropfen"] .sf-zum-stein');
    await expect(page.locator("#panel-stein")).toHaveClass(/active/);
    await expect(page.locator("#st-form")).toHaveValue("tropfen");
    await expect(page.locator("#st-stein")).toHaveValue("saphir");
    await expect(page.locator(".st-mass-wert")).toHaveCount(3);
    await expect(page.locator(".st-mass-wert").first()).toBeFocused();
    await expect(page.locator("#st-gewicht-felder")).toBeVisible();
  });

  test("Rechenweg klappt oben in der Karte auf", async ({ page }) => {
    const box = page.locator("#sf-liste .formel-box");
    await expect(box).toBeHidden();
    await page.click("#sf-liste .formel-knopf");
    await expect(box).toBeVisible();
    await expect(box).toContainText("1,00");
    const boxOben = (await box.boundingBox()).y;
    const ersteZeile = (await page.locator(".sf-zeile").first().boundingBox()).y;
    expect(boxOben).toBeLessThan(ersteZeile);
  });
});
