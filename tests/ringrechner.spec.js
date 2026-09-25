// Ringrechner: Zuschnittlänge und die Skizze der Anschrägung.
const { test, expect, de } = require("./helfer");

// Unabhängig nachgerechnet: DIN-6935-Startwert für k, begrenzt auf 0,3…0,5
function kAuto(D, s) {
  const k = (0.65 + 0.5 * Math.log10((D / 2) / s)) / 2;
  return Math.round(Math.min(0.5, Math.max(0.3, k)) * 100) / 100;
}
// Ohne Automatik rechnet der Ringrechner mit der Mitte, k = 0,50
function zuschnitt(U, s, mitDin = false) {
  const D = U / Math.PI;
  return Math.PI * (D + 2 * (mitDin ? kAuto(D, s) : 0.5) * s);
}

async function eingabe(page, U, s) {
  if (!(await page.locator("#ring-value-manual").isVisible())) await page.click("#ring-value-toggle");
  if (!(await page.locator("#ring-thickness-manual").isVisible())) await page.click("#ring-thickness-toggle");
  await page.fill("#ring-value", String(U));
  await page.fill("#ring-thickness", de(s, 3).replace(/,?0+$/, ""));
}

const linie = (page, sel) => page.locator(sel).evaluate((e) => ({
  x1: +e.getAttribute("x1"), y1: +e.getAttribute("y1"),
  x2: +e.getAttribute("x2"), y2: +e.getAttribute("y2")
}));
const punkte = async (page, sel) => (await page.locator(sel).getAttribute("points"))
  .trim().split(/\s+/).map((p) => p.split(",").map(Number));

test.describe("Zuschnittlänge", () => {
  for (const [U, s] of [[54, 1.5], [62, 2], [48, 3], [75, 1]]) {
    test(`U ${U} mm, Stärke ${de(s, 1)} mm`, async ({ page }) => {
      await eingabe(page, U, s);
      await expect(page.locator("#ring-output .result-main .value")).toHaveText(
        new RegExp("^" + de(zuschnitt(U, s), 2) + "\\s*mm$"));
    });
  }

  // Bei dicker Schiene im kleinen Ring greift DIN 6935 unter die Mitte
  test("mit DIN-Automatik: U 48 mm, Stärke 3 mm", async ({ page }) => {
    await eingabe(page, 48, 3);
    await page.check("#ring-k-auto");
    expect(kAuto(48 / Math.PI, 3)).toBeLessThan(0.5);
    await expect(page.locator("#ring-output .result-main .value")).toHaveText(
      new RegExp("^" + de(zuschnitt(48, 3, true), 2) + "\\s*mm$"));
  });
});

test.describe("Anschrägung", () => {
  test.beforeEach(async ({ page }) => {
    await page.click("#ring-bevel-on");
  });

  // Winkel der Schräglinie gegen die Senkrechte, aus den SVG-Koordinaten
  async function gezeichneterWinkel(page) {
    const senk = await linie(page, ".senkrechte");
    const schraeg = await linie(page, ".schraeglinie");
    const w = (l) => Math.atan2(l.x2 - l.x1, l.y1 - l.y2) * 180 / Math.PI;
    return Math.abs(w(schraeg) - w(senk));
  }

  for (const [U, s] of [[54, 1.5], [54, 4]]) {
    test(`Skizze stimmt mit der Rechnung überein (U ${U}, s ${de(s, 1)})`, async ({ page }) => {
      await eingabe(page, U, s);
      await page.waitForSelector("#ring-bevel .winkel-svg");
      const R = (U / Math.PI + s) / 2;
      const soll = s / R * 180 / Math.PI;

      await expect(page.locator(".winkel-wert")).toHaveText(de(soll, 1));
      expect(await gezeichneterWinkel(page)).toBeCloseTo(soll, 1);

      // zwei waagerechte Werkstückkanten, die an Spitze und Scheitel ansetzen
      const kanten = await page.locator(".werkstueck-kante").evaluateAll((els) => els.map((e) => ({
        x1: +e.getAttribute("x1"), y1: +e.getAttribute("y1"),
        x2: +e.getAttribute("x2"), y2: +e.getAttribute("y2")
      })));
      const senk = await linie(page, ".senkrechte");
      const schraeg = await linie(page, ".schraeglinie");
      expect(kanten).toHaveLength(2);
      expect(kanten[0].y1).toBe(kanten[0].y2);
      expect(kanten[1].y1).toBe(kanten[1].y2);
      expect(kanten[0].x2).toBeCloseTo(schraeg.x2, 2);
      expect(kanten[0].y2).toBeCloseTo(schraeg.y2, 2);
      expect(kanten[1].x2).toBeCloseTo(senk.x1, 2);
      expect(kanten[1].y2).toBeCloseTo(senk.y1, 2);

      await expect(page.locator(".winkel-bogen")).toHaveCount(1);
      await expect(page.locator(".winkel-leitlinie")).toHaveCount(1);

      // Werkstückfläche folgt der Schräge, der Abfallkeil teilt sie als Hypotenuse
      const koerper = await punkte(page, ".werkstueck-flaeche");
      expect(koerper[1][0]).toBeCloseTo(schraeg.x2, 2);
      expect(koerper[1][1]).toBeCloseTo(schraeg.y2, 2);
      expect(koerper[2][0]).toBeCloseTo(schraeg.x1, 2);
      expect(koerper[2][1]).toBeCloseTo(schraeg.y1, 2);
      const keil = await punkte(page, ".abfall-keil");
      expect(keil[0][0]).toBeCloseTo(schraeg.x2, 2);
      expect(keil[2][0]).toBeCloseTo(schraeg.x1, 2);
      expect(keil[1][0]).toBe(keil[2][0]);                 // rechter Winkel an der Senkrechten
    });
  }

  test("dickeres Material, größerer Winkel", async ({ page }) => {
    await eingabe(page, 54, 1.5);
    const a = parseFloat((await page.locator(".winkel-wert").textContent()).replace(",", "."));
    await eingabe(page, 54, 4);
    const b = parseFloat((await page.locator(".winkel-wert").textContent()).replace(",", "."));
    expect(b).toBeGreaterThan(a);
  });

  test("bei praktisch 0° weder Bogen noch Leitlinie noch Keil", async ({ page }) => {
    await eingabe(page, 60, 0.001);
    await expect(page.locator(".winkel-wert")).toHaveText("0,0");
    await expect(page.locator(".winkel-bogen")).toHaveCount(0);
    await expect(page.locator(".winkel-leitlinie")).toHaveCount(0);
    await expect(page.locator(".abfall-keil")).toHaveCount(0);
  });

  test("der Winkel steht in der Grafik, nicht doppelt darunter", async ({ page }) => {
    await eingabe(page, 54, 1.5);
    await expect(page.locator("#ring-bevel .result-main .value")).toHaveCount(0);
    await expect(page.locator("#ring-bevel .result-main .label")).toHaveCount(1);
  });
});
