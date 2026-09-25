// Zuletzt bekannte Tageskurse: Materialwert und Metallkalkulation sollen
// ohne Netz mit dem letzten Stand weiterrechnen — und ihn als alt kenntlich
// machen, nie als aktuell ausgeben.
const { test: basis } = require("@playwright/test");
const { test, expect, KURSE, kurseAttrappe, keinNetz, reiter, de, betrag } = require("./helfer");

const SPEICHER = "tageskurse-v1";
const DAMALS = "2026-09-20T12:20:00.000Z";          // 14:20 Uhr in Berlin
const DAMALS_TEXT = "20.09.26, 14:20 Uhr";
const ALT = { XAG: 0.9, XAU: 70.0, XPT: 28.0, XPD: 22.0 };

function gespeichert(kurse = ALT) {
  const zeit = {};
  for (const m of Object.keys(kurse)) zeit[m] = DAMALS;
  return JSON.stringify({ kurse, zeit });
}

async function mitSpeicher(context, inhalt) {
  await context.addInitScript(([schluessel, wert]) => {
    // nur beim ersten Laden setzen, damit ein Neuladen sieht, was die App schrieb
    if (!sessionStorage.getItem("gesaet")) {
      localStorage.setItem(schluessel, wert);
      sessionStorage.setItem("gesaet", "1");
    }
  }, [SPEICHER, inhalt]);
}

const wert = (page) => page.locator("#wert-ergebnis .result-main .value");

test("frische Abfrage wird gespeichert und als aktuell ausgewiesen", async ({ page }) => {
  await reiter(page, "wert");
  await expect(page.locator("#kurs-XAU")).toHaveText(de(KURSE.XAU, 2));
  await expect(page.locator("#kurs-stand")).toHaveText(/^Stand: \d\d:\d\d Uhr$/);

  const roh = await page.evaluate((k) => localStorage.getItem(k), SPEICHER);
  const d = JSON.parse(roh);
  expect(d.kurse.XAU).toBeCloseTo(KURSE.XAU, 9);
  expect(d.kurse.XPD).toBeCloseTo(KURSE.XPD, 9);
  expect(new Date(d.zeit.XAU).getTime()).toBeGreaterThan(Date.now() - 60000);
});

basis.describe("ohne Netz", () => {
  basis("rechnet mit den zuletzt bekannten Kursen und nennt deren Datum", async ({ page, context }) => {
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    await keinNetz(context);
    await mitSpeicher(context, gespeichert());
    await page.goto("/index.html");

    // Schon vor dem Öffnen des Reiters eingesetzt, ohne "Kein Netz" —
    // es wurde ja noch gar nicht abgefragt.
    await expect(page.locator("#kurs-stand")).toHaveText("Zuletzt bekannte Kurse vom " + DAMALS_TEXT);

    await reiter(page, "wert");
    await expect(page.locator("#kurs-stand")).toHaveText("Kein Netz — zuletzt bekannte Kurse vom " + DAMALS_TEXT);
    await expect(page.locator("#kurs-stand")).toHaveClass(/fehler/);
    await expect(page.locator("#kurs-diagnose")).toBeHidden();      // Standzeile reicht
    await expect(page.locator("#kurs-XAU")).toHaveText(de(ALT.XAU, 2));
    await expect(page.locator("#kurs-XAG")).toHaveText(de(ALT.XAG, 3));
    await expect(page.locator("#wert-pd-kurs")).toHaveText("Pd " + de(ALT.XPD, 2) + " €/g");

    // und die Rechnung läuft damit: 10 g Gold 585 × 70 €/g
    await page.fill("#wert-gewicht", "10");
    await expect(wert(page)).toHaveText(betrag(10 * 0.585 * ALT.XAU));

    // Metallkalkulation: rechnet mit, sagt aber, dass der Kurs alt ist
    await reiter(page, "metallkalk");
    await page.locator(".mk-form").first().selectOption("gewicht");
    await page.locator(".mk-mass-wert").first().fill("10");
    await expect(page.locator(".mk-zeile-wert").first()).toHaveText(betrag(10 * 0.585 * ALT.XAU));
    await expect(page.locator("#mk-kursstand")).toContainText("Zuletzt bekannte Kurse vom " + DAMALS_TEXT);

    expect(fehler).toEqual([]);
  });

  basis("eine Handeingabe gilt nicht als alter Kurs", async ({ page, context }) => {
    await keinNetz(context);
    await mitSpeicher(context, gespeichert({ XAU: 70 }));
    await page.goto("/index.html");
    await reiter(page, "wert");
    await expect(page.locator("#kurs-stand")).toContainText("zuletzt bekannte Kurse");
    await page.locator("#kurs-hand-box summary").click();
    await page.fill("#hand-XAU", "75");
    await expect(page.locator("#kurs-XAU")).toHaveText("75,00");
    await page.fill("#wert-gewicht", "10");
    await expect(wert(page)).toHaveText(betrag(10 * 0.585 * 75));
  });

  basis("kaputter Speicherinhalt wird ignoriert", async ({ page, context }) => {
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    await keinNetz(context);
    await mitSpeicher(context, "{kaputt");
    await page.goto("/index.html");
    await reiter(page, "wert");
    await expect(page.locator("#kurs-stand")).toContainText("Kurse nicht abrufbar");
    await expect(page.locator("#kurs-XAU")).toHaveText("—");
    expect(fehler).toEqual([]);
  });
});

basis("teilweise erreichbar: frische Uhrzeit und altes Datum getrennt", async ({ page, context }) => {
  const ohnePlatin = { ...KURSE };
  delete ohnePlatin.XPT;
  await kurseAttrappe(context, ohnePlatin);
  await mitSpeicher(context, gespeichert());
  await page.goto("/index.html");
  await reiter(page, "wert");

  await expect(page.locator("#kurs-stand")).toHaveText(
    new RegExp("^Stand: \\d\\d:\\d\\d Uhr · Platin zuletzt bekannt vom " + DAMALS_TEXT + "$"));
  await expect(page.locator("#kurs-XAU")).toHaveText(de(KURSE.XAU, 2));   // frisch
  await expect(page.locator("#kurs-XPT")).toHaveText(de(ALT.XPT, 2));     // alt, aber da

  // Der alte Platinkurs bleibt mit seinem alten Zeitpunkt gespeichert
  const d = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SPEICHER));
  expect(d.zeit.XPT).toBe(DAMALS);
  expect(d.kurse.XAU).toBeCloseTo(KURSE.XAU, 9);
});
