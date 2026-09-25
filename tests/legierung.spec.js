// Legierung: neu ansetzen und umlegieren (nur zugeben, nie entnehmen).
const { test, expect, reiter, de } = require("./helfer");

const PD = 0.19;
// Rezepte unabhängig nachgebaut: Basis nach Feingehalt, der Rest nach Zuschlag
const SORTEN = {
  gelb: { basis: "au", z: { ag: 0.5, cu: 0.5 } },
  rose: { basis: "au", z: { ag: 0.3, cu: 0.7 } },
  rot: { basis: "au", z: { ag: 0.1, cu: 0.9 } },
  gruen: { basis: "au", z: { ag: 1 } },
  weiss: { basis: "au", z: { ag: 1 }, pd: PD },
  silber: { basis: "ag", z: { cu: 1 } }
};
const NAMEN = { au: "Feingold", pd: "Palladium", ag: "Feinsilber", cu: "Kupfer" };

function anteile(id, promille) {
  const s = SORTEN[id], a = { au: 0, pd: 0, ag: 0, cu: 0 };
  a[s.basis] += promille / 1000;
  let rest = 1 - promille / 1000;
  if (s.pd) { const p = Math.min(s.pd, rest); a.pd += p; rest -= p; }
  for (const e in s.z) a[e] += rest * s.z[e];
  return a;
}

// Umlegieren: kleinste Endmenge, in der nichts vom Vorhandenen zu viel ist
function umlegieren(menge, ist, ziel) {
  let faktor = 1;
  for (const e in ist) {
    if (ist[e] > 1e-12 && ziel[e] < 1e-12) return null;      // müsste entnommen werden
    if (ist[e] > 1e-12) faktor = Math.max(faktor, ist[e] / ziel[e]);
  }
  const ende = menge * faktor, zugabe = {};
  for (const e in ziel) zugabe[e] = ende * ziel[e] - menge * ist[e];
  return { ende, zugabe };
}

const zeilen = (page) => page.locator("#leg-ergebnis .leg-zeile").evaluateAll((els) => els.map((e) => ({
  name: e.querySelector(".leg-name").textContent.trim(),
  gramm: e.querySelector(".leg-gramm").textContent.trim()
})));
const hauptwert = (page) => page.locator("#leg-ergebnis .result-main .value");
const gramm = (n) => new RegExp("^" + de(n, 2) + "\\s*g$");

test.beforeEach(async ({ page }) => {
  await reiter(page, "legierung");
});

test("Feingehalte folgen der Sorte", async ({ page }) => {
  await page.selectOption("#leg-sorte", "weiss");
  const wg = await page.locator("#leg-fein option").evaluateAll((o) => o.map((x) => x.value));
  expect(wg).not.toContain("999");
  await page.selectOption("#leg-sorte", "silber");
  const ag = await page.locator("#leg-fein option").evaluateAll((o) => o.map((x) => x.value));
  expect(ag).toContain("925");
});

test.describe("Ansetzen", () => {
  for (const [sorte, fein, menge] of [
    ["gelb", 585, 20], ["rose", 750, 15], ["rot", 333, 30],
    ["gruen", 585, 10], ["weiss", 585, 12], ["silber", 925, 50]
  ]) {
    test(`${menge} g ${sorte} ${fein}`, async ({ page }) => {
      await page.selectOption("#leg-sorte", sorte);
      await page.selectOption("#leg-fein", String(fein));
      await page.fill("#leg-menge", String(menge));
      await expect(hauptwert(page)).toHaveText(gramm(menge));

      const a = anteile(sorte, fein);
      const z = await zeilen(page);
      for (const e of Object.keys(NAMEN)) {
        const soll = menge * a[e];
        const zeile = z.find((x) => x.name === NAMEN[e]);
        if (soll < 0.0005) {
          expect(zeile, NAMEN[e] + " sollte fehlen").toBeUndefined();
        } else {
          expect(zeile.gramm, NAMEN[e]).toMatch(gramm(soll));
        }
      }
      expect(z[z.length - 1].gramm).toMatch(gramm(menge));
    });
  }

  test("Balken füllt genau 100 %", async ({ page }) => {
    await page.selectOption("#leg-sorte", "gelb");
    await page.selectOption("#leg-fein", "585");
    await page.fill("#leg-menge", "20");
    const breiten = await page.locator("#leg-ergebnis .leg-balken-teil")
      .evaluateAll((els) => els.map((e) => parseFloat(e.style.width)));
    expect(breiten.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
});

test.describe("Umlegieren", () => {
  async function stelle(page, istSorte, istFein, zielSorte, zielFein, menge = 10) {
    await page.click('#leg-mode button[data-mode="umlegieren"]');
    await page.fill("#leg-vorhanden", String(menge));
    await page.selectOption("#leg-ist-sorte", istSorte);
    await page.selectOption("#leg-ist-fein", String(istFein));
    await page.selectOption("#leg-sorte", zielSorte);
    await page.selectOption("#leg-fein", String(zielFein));
  }

  function zugabeZeilen(z) {
    return z.slice(0, z.findIndex((x) => /Zugabe zusammen/.test(x.name)));
  }

  test("hochlegieren 585 → 750 Gelbgold: nur Feingold dazu", async ({ page }) => {
    await stelle(page, "gelb", 585, "gelb", 750);
    const r = umlegieren(10, anteile("gelb", 585), anteile("gelb", 750));
    expect(r.ende).toBeCloseTo(10 * 415 / 250, 9);          // Zuschlag bleibt liegen
    await expect(hauptwert(page)).toHaveText(gramm(r.ende - 10));
    const zu = zugabeZeilen(await zeilen(page));
    expect(zu.map((x) => x.name)).toEqual(["Feingold"]);
  });

  test("abstrecken 750 → 585 Gelbgold: Silber und Kupfer dazu, Gegenprobe 585 ‰", async ({ page }) => {
    await stelle(page, "gelb", 750, "gelb", 585);
    const r = umlegieren(10, anteile("gelb", 750), anteile("gelb", 585));
    await expect(hauptwert(page)).toHaveText(gramm(r.ende - 10));
    const z = await zeilen(page);
    const zu = zugabeZeilen(z);
    expect(zu.find((x) => x.name === "Feingold")).toBeUndefined();
    expect(zu.find((x) => x.name === "Feinsilber").gramm).toMatch(gramm(r.zugabe.ag));
    expect(zu.find((x) => x.name === "Kupfer").gramm).toMatch(gramm(r.zugabe.cu));

    // Endmenge unten: Feingold / gesamt muss 585 ‰ ergeben
    const ende = z.slice(zu.length + 1);
    const n = (t) => parseFloat(t.replace(/[^\d,]/g, "").replace(",", "."));
    const au = n(ende.find((x) => x.name === "Feingold").gramm);
    const ges = n(ende[ende.length - 1].gramm);
    expect(au / ges * 1000).toBeCloseTo(585, 0);
  });

  test("gleiches Ziel wie Ist: nichts zuzugeben", async ({ page }) => {
    await stelle(page, "gelb", 585, "gelb", 585);
    await expect(hauptwert(page)).toHaveText(gramm(0));
  });

  test("Weißgold → Gelbgold ist unmöglich: Palladium müsste heraus", async ({ page }) => {
    await stelle(page, "weiss", 585, "gelb", 585);
    expect(umlegieren(10, anteile("weiss", 585), anteile("gelb", 585))).toBeNull();
    await expect(page.locator("#leg-ergebnis .hint")).toContainText("Palladium");
  });

  test("Gelbgold → Weißgold ist ebenso unmöglich: Kupfer müsste heraus", async ({ page }) => {
    await stelle(page, "gelb", 585, "weiss", 585);
    expect(umlegieren(10, anteile("gelb", 585), anteile("weiss", 585))).toBeNull();
    await expect(page.locator("#leg-ergebnis .hint")).toContainText("Kupfer");
  });

  test("Rotgold 585 → Roségold 585: Zugabe nach Handrechnung", async ({ page }) => {
    await stelle(page, "rot", 585, "rose", 585);
    const r = umlegieren(10, anteile("rot", 585), anteile("rose", 585));
    await expect(hauptwert(page)).toHaveText(gramm(r.ende - 10));
    const zu = zugabeZeilen(await zeilen(page));
    for (const e of ["au", "ag", "cu"]) {
      const zeile = zu.find((x) => x.name === NAMEN[e]);
      if (r.zugabe[e] > 0.0005) expect(zeile.gramm, NAMEN[e]).toMatch(gramm(r.zugabe[e]));
      else expect(zeile, NAMEN[e]).toBeUndefined();
    }
  });
});
