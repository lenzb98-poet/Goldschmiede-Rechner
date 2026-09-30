// Metallkalkulation: Halbzeug nach Form und Maßen, Händlermodus mit
// Faktor und Aufschlag, der den Einkaufspreis nicht preisgibt.
const { test, expect, KURSE, reiter, de, betrag } = require("./helfer");

const DICHTE = {
  XAG: { 925: 10.36 },
  XAU: { 585: 13.10 },
  XWG: { 585: 14.60 },
  XPT: { 950: 20.70 }
};
const PD = 0.19;

// Volumenformeln unabhängig nachgebaut, mm³
const VOL = {
  blech: (m) => m[0] * m[1] * m[2],
  runddraht: (m) => Math.PI * (m[0] / 2) ** 2 * m[1],
  vierkant: (m) => m[0] * m[0] * m[1],
  halbrund: (m) => Math.PI * (m[0] / 2) ** 2 / 2 * m[1],
  kugel: (m) => 4 / 3 * Math.PI * (m[0] / 2) ** 3
};

const zeile = (page, i = 0) => page.locator(".mk-posten-zeile").nth(i);
const summe = (page) => page.locator("#mk-summe");

async function posten(page, i, { form, material = "XAU", fein = "585", masse, name }) {
  const z = zeile(page, i);
  if (form) await z.locator(".mk-form").selectOption(form);
  await z.locator(".mk-material").selectOption(material);
  await z.locator(".mk-feingehalt").selectOption(fein);
  // Maße als Liste (Reihenfolge der Felder) oder als { Kennung: Wert }
  const felder = Array.isArray(masse) ? masse.map((v, k) => [k, v]) : Object.entries(masse);
  for (const [k, v] of felder) {
    const feld = typeof k === "number" ? z.locator(".mk-mass-wert").nth(k) : z.locator(`[data-mass="${k}"]`);
    await feld.fill(String(v).replace(".", ","));
  }
  if (name) await z.locator(".mk-name").fill(name);
}

test.beforeEach(async ({ page }) => {
  await reiter(page, "metallkalk");
  await expect(page.locator("#mk-kurs-XAU")).toHaveAttribute("placeholder", de(KURSE.XAU, 2));
});

test.describe("Formen", () => {
  for (const [form, masse] of [
    ["blech", [40, 25, 1.2]], ["runddraht", [1.5, 80]], ["vierkant", [1.5, 80]],
    ["halbrund", [3, 60]], ["kugel", [4]]
  ]) {
    test(`${form} ${masse.join(" × ")} in Gold 585`, async ({ page }) => {
      await posten(page, 0, { form, masse });
      const g = VOL[form](masse) / 1000 * DICHTE.XAU[585];
      await expect(zeile(page).locator(".mk-zeile-gewicht")).toHaveText(de(g, 2) + " g");
      await expect(zeile(page).locator(".mk-zeile-wert")).toHaveText(betrag(g * 0.585 * KURSE.XAU));
    });
  }

  test("Gewicht direkt, ohne Dichte, mit einem Feld in g", async ({ page }) => {
    await posten(page, 0, { form: "gewicht", masse: [5] });
    await expect(zeile(page).locator(".mk-mass-wert")).toHaveCount(1);
    await expect(zeile(page).locator(".mk-mass-einheit")).toHaveText("g");
    await expect(zeile(page).locator(".mk-zeile-wert")).toHaveText(betrag(5 * 0.585 * KURSE.XAU));
  });

  test("Dichte folgt Material und Feingehalt", async ({ page }) => {
    for (const [material, fein] of [["XAG", "925"], ["XPT", "950"], ["XWG", "585"]]) {
      await posten(page, 0, { form: "blech", material, fein, masse: [40, 25, 1.2] });
      const g = 40 * 25 * 1.2 / 1000 * DICHTE[material][fein];
      await expect(zeile(page).locator(".mk-zeile-gewicht")).toHaveText(de(g, 2) + " g");
    }
  });

  test("Weißgold: Palladiumanteil kommt zum Goldwert dazu", async ({ page }) => {
    await posten(page, 0, { form: "blech", material: "XWG", masse: [40, 25, 1.2] });
    const g = 40 * 25 * 1.2 / 1000 * DICHTE.XWG[585];
    await expect(zeile(page).locator(".mk-zeile-wert"))
      .toHaveText(betrag(g * 0.585 * KURSE.XAU + g * PD * KURSE.XPD));
  });

  test("Formwechsel baut die Maßfelder neu und leer auf", async ({ page }) => {
    await posten(page, 0, { form: "blech", masse: [40, 25, 1.2] });
    await zeile(page).locator(".mk-form").selectOption("kugel");
    await expect(zeile(page).locator(".mk-mass-wert")).toHaveCount(1);
    await expect(zeile(page).locator(".mk-mass-wert")).toHaveValue("");
    await zeile(page).locator(".mk-form").selectOption("rohr");
    await expect(zeile(page).locator(".mk-mass-wert")).toHaveCount(5);
  });

  test("unmögliches Rohr (Wand ≥ Radius) meldet sich, statt zu rechnen", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 4, w: 2, l: 20 } });
    await expect(zeile(page).locator(".mk-zeile-gewicht")).toContainText("kein");
    await expect(summe(page)).toHaveText(/^—\s*€$/);
  });

  test("halb ausgefüllt zählt nicht", async ({ page }) => {
    await zeile(page).locator(".mk-form").selectOption("blech");
    await zeile(page).locator(".mk-mass-wert").first().fill("40");
    await expect(zeile(page).locator(".mk-zeile-gewicht")).toHaveText("—");
  });
});

test.describe("Rohr: zwei beliebige Querschnittsmaße genügen", () => {
  // Unabhängig nachgerechnet: V = π/4 · (Da² − Di²) · L
  const rohrGramm = (da, di, l) => Math.PI / 4 * (da * da - di * di) * l / 1000 * DICHTE.XAU[585];
  const feld = (page, id) => zeile(page).locator(`[data-mass="${id}"]`);
  const gewicht = (page) => zeile(page).locator(".mk-zeile-gewicht");

  // Jede Paarung der vier Maße für dasselbe Rohr: Ø 6 außen, Ø 5 innen, Wand 0,5
  for (const [name, masse] of [
    ["Ø außen + Wand", { d: 6, w: 0.5 }],
    ["Ø außen + Ø innen", { d: 6, di: 5 }],
    ["Ø innen + Wand", { di: 5, w: 0.5 }],
    ["Innenumfang + Wand", { ui: 5 * Math.PI, w: 0.5 }],
    ["Innenumfang + Ø außen", { ui: 5 * Math.PI, d: 6 }]
  ]) {
    test(name, async ({ page }) => {
      await posten(page, 0, { form: "rohr", masse: { ...masse, l: 20 } });
      await expect(gewicht(page)).toHaveText(de(rohrGramm(6, 5, 20), 2) + " g");
    });
  }

  test("die fehlenden Maße erscheinen im leeren Feld", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 6, w: 0.5 } });
    await expect(feld(page, "di")).toHaveAttribute("placeholder", "5");
    await expect(feld(page, "ui")).toHaveAttribute("placeholder", de(5 * Math.PI, 2));
    await expect(feld(page, "di")).toHaveClass(/abgeleitet/);
    await expect(feld(page, "di")).toHaveValue("");               // nur angezeigt, nicht eingetragen
    await expect(feld(page, "d")).not.toHaveClass(/abgeleitet/);
    // Länge fehlt noch: Maße schon ergänzt, aber noch kein Gewicht
    await expect(gewicht(page)).toHaveText("—");
  });

  test("ohne zwei Maße keine Ergänzung, Beispielwerte bleiben", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 6, l: 20 } });
    await expect(feld(page, "di")).toHaveAttribute("placeholder", "5");   // Beispielwert
    await expect(feld(page, "di")).not.toHaveClass(/abgeleitet/);
    await expect(gewicht(page)).toHaveText("—");
  });

  test("ein zusätzlicher, gerundeter Umfang wird nur geprüft — gerechnet wird mit den Durchmessern", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 6, w: 0.5, ui: "15,7", l: 20 } });
    await expect(gewicht(page)).toHaveText(de(rohrGramm(6, 5, 20), 2) + " g");
  });

  test("widersprüchliche Maße werden gemeldet statt gerechnet", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 6, di: 4, w: 0.5, l: 20 } });
    await expect(gewicht(page)).toHaveText("Ø außen, Ø innen und Wand widersprechen sich");
    await expect(summe(page)).toHaveText(/^—\s*€$/);

    await posten(page, 0, { form: "rohr", masse: { d: "", di: 5, w: "", ui: 17, l: 20 } });
    await expect(gewicht(page)).toHaveText("Ø innen und Innenumfang passen nicht zusammen");

    await posten(page, 0, { form: "rohr", masse: { d: 6, di: "", w: 0.5, ui: 17, l: 20 } });
    await expect(gewicht(page)).toHaveText("Innenumfang passt nicht zu Ø außen und Wand");
  });

  test("Aufschlüsselung und Rechenweg nennen die Rohrmaße", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { ui: 5 * Math.PI, w: 0.5, l: 20 } });
    await expect(page.locator("#mk-aufschluesselung")).toContainText("Rohr Ø 6 × 0,5 Wand × 20 mm");
    await page.click(".mk-ergebnis-karte .formel-knopf");
    await expect(page.locator(".mk-ergebnis-karte .formel-box")).toContainText("Ø innen 5,00");
  });

  test("übersteht das Neuladen, errechnete Maße inklusive", async ({ page }) => {
    await posten(page, 0, { form: "rohr", masse: { d: 6, ui: 5 * Math.PI, l: 20 } });
    await page.reload();
    await reiter(page, "metallkalk");
    await expect(feld(page, "d")).toHaveValue("6");
    await expect(feld(page, "w")).toHaveAttribute("placeholder", "0,5");
    await expect(feld(page, "w")).toHaveClass(/abgeleitet/);
    await expect(gewicht(page)).toHaveText(de(rohrGramm(6, 5, 20), 2) + " g");
  });
});

test("Summe über mehrere Posten, Entfernen rechnet neu", async ({ page }) => {
  await posten(page, 0, { form: "blech", masse: [40, 25, 1.2], name: "Ringschiene" });
  await page.click("#mk-hinzufuegen");
  await posten(page, 1, { form: "runddraht", material: "XAG", fein: "925", masse: [1.5, 80], name: "Draht" });
  const w1 = 40 * 25 * 1.2 / 1000 * DICHTE.XAU[585] * 0.585 * KURSE.XAU;
  const w2 = VOL.runddraht([1.5, 80]) / 1000 * DICHTE.XAG[925] * 0.925 * KURSE.XAG;
  await expect(summe(page)).toHaveText(betrag(w1 + w2));
  await expect(page.locator("#mk-summe-note")).toContainText("2 Posten");

  await zeile(page, 1).locator(".zeile-entfernen").click();
  await expect(summe(page)).toHaveText(betrag(w1));
});

test("Postennamen werden als Text gezeigt, nicht als HTML", async ({ page }) => {
  await posten(page, 0, { form: "blech", masse: [40, 25, 1.2], name: "<b>fett</b>" });
  await expect(page.locator("#mk-aufschluesselung b")).toHaveCount(0);
  await expect(page.locator("#mk-aufschluesselung")).toContainText("<b>fett</b>");
});

test.describe("Händlermodus", () => {
  // Posten 1: Gold 585 40×25×1,2 — Posten 2: Weißgold 585 20×10×1
  const g1 = 40 * 25 * 1.2 / 1000 * DICHTE.XAU[585];
  const ek1 = g1 * 0.585 * KURSE.XAU;
  const g2 = 20 * 10 * 1 / 1000 * DICHTE.XWG[585];
  const ek2gold = g2 * 0.585 * KURSE.XAU, ek2pd = g2 * PD * KURSE.XPD;
  const ek = ek1 + ek2gold + ek2pd;
  const FAKTOR = 2.5, AUFSCHLAG = 15;
  const endpreis = ek * FAKTOR + AUFSCHLAG;

  test.beforeEach(async ({ page }) => {
    await posten(page, 0, { form: "blech", masse: [40, 25, 1.2], name: "Ringschiene" });
    await page.click("#mk-hinzufuegen");
    await posten(page, 1, { form: "blech", material: "XWG", masse: [20, 10, 1], name: "Kopf" });
    await expect(summe(page)).toHaveText(betrag(ek));
    await page.click("#mk-haendler-an");
    await page.click("#mk-haendler-knopf");
    await page.fill("#mk-faktor", "2,5");
    await page.fill("#mk-aufschlag", "15");
  });

  test("Posten stehen faktoriert da, der Aufschlag steckt still in der Summe", async ({ page }) => {
    await expect(summe(page)).toHaveText(betrag(endpreis));
    const werte = await page.locator(".mk-zeile-wert").allInnerTexts();
    expect(werte[0]).toMatch(betrag(ek1 * FAKTOR));
    expect(werte[1]).toMatch(betrag((ek2gold + ek2pd) * FAKTOR));
    await expect(page.locator("#mk-summe-label")).toHaveText("Endpreis");
    await expect(page.locator("#mk-kursstand")).toHaveText("");
  });

  test("zugeklappt ist nirgends ein Einkaufspreis zu sehen", async ({ page }) => {
    await page.click("#mk-haendler-knopf");                   // Händlerbereich zu
    await expect(page.locator("#mk-haendler-bereich")).toBeHidden();
    const text = await page.locator("#panel-metallkalk").innerText();
    for (const verboten of [ek, ek1, ek2gold, ek2pd, ek * FAKTOR]) {
      expect(text, "EK " + de(verboten, 2) + " sichtbar").not.toContain(de(verboten, 2));
    }
    expect(text).not.toMatch(/Rohmaterial|Aufschlag/);
    expect(text).toContain(de(endpreis, 2));
  });

  test("im Händlerbereich bleibt die Kette einsehbar, Abschlag heißt Abschlag", async ({ page }) => {
    const kette = await page.locator("#mk-endkosten .mk-auf-zeile").allInnerTexts();
    expect(kette.some((t) => t.includes(de(ek, 2)))).toBe(true);
    await page.fill("#mk-aufschlag", "-20");
    await expect(summe(page)).toHaveText(betrag(ek * FAKTOR - 20));
    expect((await page.locator("#mk-endkosten .mk-auf-zeile").allInnerTexts())
      .some((t) => /Abschlag/.test(t))).toBe(true);
  });

  test("eigener Goldkurs wirkt nur hier, nicht im Materialwert", async ({ page }) => {
    await page.fill("#mk-kurs-XAU", "60");
    const ekEigen = g1 * 0.585 * 60 + g2 * 0.585 * 60 + ek2pd;
    await expect(summe(page)).toHaveText(betrag(ekEigen * FAKTOR + AUFSCHLAG));
    await reiter(page, "wert");
    await expect(page.locator("#kurs-XAU")).toHaveText(de(KURSE.XAU, 2));
  });

  test("übersteht das Neuladen", async ({ page }) => {
    await page.fill("#mk-kurs-XAU", "60");
    const vorher = await summe(page).textContent();
    await page.reload();
    await reiter(page, "metallkalk");
    await expect(page.locator(".mk-posten-zeile")).toHaveCount(2);
    await expect(zeile(page).locator(".mk-name")).toHaveValue("Ringschiene");
    expect(await zeile(page).locator(".mk-mass-wert").evaluateAll((e) => e.map((x) => x.value)))
      .toEqual(["40", "25", "1,2"]);
    await expect(zeile(page, 1).locator(".mk-material")).toHaveValue("XWG");
    await expect(page.locator("#mk-haendler-an")).toBeChecked();
    await expect(page.locator("#mk-faktor")).toHaveValue("2,5");
    await expect(page.locator("#mk-kurs-XAU")).toHaveValue("60");
    await expect(summe(page)).toHaveText(vorher);
  });

  test("ausgeschaltet ist alles wie vorher", async ({ page }) => {
    await page.click("#mk-haendler-an");
    await expect(page.locator("#mk-haendler-knopf")).toBeHidden();
    await expect(summe(page)).toHaveText(betrag(ek));
    await expect(page.locator("#mk-summe-label")).toHaveText("Rohmaterial gesamt");
    await expect(page.locator("#mk-kursstand")).toContainText("Gerechnet mit");
  });
});
