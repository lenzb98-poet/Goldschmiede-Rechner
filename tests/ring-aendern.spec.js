// Ring ändern: wie viel aus der Schiene heraus muss — gerechnet auf der
// neutralen Faser, angezeichnet außen.
const { test, expect, reiter, de } = require("./helfer");

function kAuto(D, s) {
  const k = (0.65 + 0.5 * Math.log10((D / 2) / s)) / 2;
  return Math.round(Math.min(0.5, Math.max(0.3, k)) * 100) / 100;
}
// Zuschnittlänge des Ringrechners
function zuschnitt(U, s, kAn) {
  const D = U / Math.PI;
  return Math.PI * (D + 2 * (kAn ? kAuto(D, s) : 0.5) * s);
}
// Unabhängig nachgebaut: jede Größe mit ihrem eigenen k
function soll(start, ziel, s, kAn) {
  const dS = start / Math.PI, dZ = ziel / Math.PI;
  const kS = kAn ? kAuto(dS, s) : 0.5, kZ = kAn ? kAuto(dZ, s) : 0.5;
  const neutral = Math.PI * (dS + 2 * kS * s) - Math.PI * (dZ + 2 * kZ * s);
  const theta = neutral / (dS / 2 + kS * s);
  return { neutral, theta, aussen: theta * (dS / 2 + s), innen: theta * dS / 2 };
}

const mm = (n) => new RegExp("^" + de(n, 2) + "\\s*mm$");
const kachel = (page, label) => page.locator("#rv-ergebnis .result-item")
  .filter({ has: page.locator(".label", { hasText: new RegExp("^" + label + "$") }) }).locator(".value");

async function stelle(page, start, ziel, s, kAn = false) {
  if ((await page.locator("#rv-k-auto").isChecked()) !== kAn) await page.click("#rv-k-auto");
  for (const [id, v] of [["rv-start", start], ["rv-ziel", ziel], ["rv-staerke", s]]) {
    if (!(await page.locator(`#${id}-manual`).isVisible())) await page.click(`#${id}-toggle`);
    await page.fill("#" + id, String(v).replace(".", ","));
  }
}

test.beforeEach(async ({ page }) => {
  await reiter(page, "verkleinern");
});

for (const [start, ziel, s, kAn] of [[62, 52, 1, false], [62, 52, 1, true], [62, 52, 3, true], [75, 48, 3, true]]) {
  test(`${start} → ${ziel} mm, Stärke ${s} mm, DIN ${kAn ? "an" : "aus"}`, async ({ page }) => {
    await stelle(page, start, ziel, s, kAn);
    const e = soll(start, ziel, s, kAn);
    await expect(page.locator("#rv-ergebnis .result-main .value")).toHaveText(mm(e.aussen));
    await expect(kachel(page, "auf der neutralen Faser")).toHaveText(mm(e.neutral));
    await expect(kachel(page, "an der Innenkante")).toHaveText(mm(e.innen));
    expect(e.aussen).toBeGreaterThan(e.neutral);
  });
}

test("neutrale Faser = Differenz der beiden Ringrechner-Zuschnitte", () => {
  for (const [a, b, s, kAn] of [[62, 52, 1, false], [62, 52, 3, true], [75, 48, 3, true]]) {
    expect(soll(a, b, s, kAn).neutral).toBeCloseTo(zuschnitt(a, s, kAn) - zuschnitt(b, s, kAn), 9);
  }
  // ohne DIN ist sie genau die Umfangsdifferenz, egal wie dick
  expect(soll(62, 52, 5, false).neutral).toBeCloseTo(10, 9);
});

test("dicke Schiene: Außenmaß weicht stärker von der Faser ab", () => {
  const duenn = soll(62, 52, 1, true), dick = soll(62, 52, 3, true);
  expect(dick.aussen - dick.neutral).toBeGreaterThan(duenn.aussen - duenn.neutral);
});

test.describe("Skizze", () => {
  for (const [start, ziel, s] of [[62, 52, 1], [60, 59, 0.3], [75, 48, 3]]) {
    test(`Bemaßung wie in der technischen Zeichnung (${start} → ${ziel}, ${s} mm)`, async ({ page }) => {
      await stelle(page, start, ziel, s);
      const attrs = (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => ({
        x1: +e.getAttribute("x1"), y1: +e.getAttribute("y1"),
        x2: +e.getAttribute("x2"), y2: +e.getAttribute("y2")
      })));
      const hilfs = await attrs(".rv-hilfslinie");
      const [mass] = await attrs(".rv-masslinie");
      expect(hilfs).toHaveLength(2);
      for (const h of hilfs) {
        expect(h.x1).toBeCloseTo(h.x2, 2);                  // senkrecht nach oben
        expect(h.y2).toBeCloseTo(mass.y1, 2);               // enden auf der Maßlinie
      }
      expect(mass.y1).toBeCloseTo(mass.y2, 2);              // Maßlinie waagerecht
      const labelY = +(await page.locator(".rv-mass-wert").getAttribute("y"));
      expect(labelY - 7).toBeGreaterThan(0);                // nicht oben abgeschnitten

      const e = soll(start, ziel, s, false);
      await expect(page.locator(".rv-mass-wert")).toHaveText(de(e.aussen, 2) + " mm");
      await expect(page.locator(".rv-band")).toHaveCount(2);
      await expect(page.locator(".rv-keil")).toHaveCount(1);
    });
  }
});
