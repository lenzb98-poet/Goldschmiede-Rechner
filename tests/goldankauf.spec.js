// Goldankauf: Metallwert der angekauften Posten × Ankaufsatz.
const { test, expect, KURSE, reiter, de, betrag } = require("./helfer");

const summe = (page) => page.locator("#goldankauf-summe");
const zeilen = async (page) =>
  (await page.locator("#ga-endkosten .ga-auf-zeile").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));

async function posten(page, legierung, feingehalt, gramm) {
  const z = page.locator(".ga-zeile").first();
  await z.locator(".ga-legierung").selectOption(legierung);
  await z.locator(".ga-feingehalt").selectOption(feingehalt);
  await z.locator(".ga-gramm").fill(gramm);
}

test.beforeEach(async ({ page }) => {
  await reiter(page, "goldankauf");
  await page.click("#goldankauf-haendler-knopf");
  await expect(page.locator("#ga-kurs-stand")).toContainText("Kurse abgerufen");
});

test("ohne Eingabe gilt Ankauf zu 65 %", async ({ page }) => {
  await posten(page, "gold", "585", "10");
  const metall = 10 * 0.585 * KURSE.XAU;
  await expect(page.locator("#ga-haendler-prozent")).toHaveValue("");
  await expect(page.locator("#ga-haendler-prozent")).toHaveAttribute("placeholder", "65");
  expect((await zeilen(page)).some((t) => /Ankauf zu 65 %/.test(t))).toBe(true);
  await expect(summe(page)).toHaveText(betrag(metall * 0.65));
});

test("eigener Ankaufsatz überschreibt, Leeren kehrt zur Vorgabe zurück", async ({ page }) => {
  await posten(page, "gold", "585", "10");
  const metall = 10 * 0.585 * KURSE.XAU;
  await page.fill("#ga-haendler-prozent", "90");
  await expect(summe(page)).toHaveText(betrag(metall * 0.9));
  await page.fill("#ga-haendler-prozent", "");
  await expect(summe(page)).toHaveText(betrag(metall * 0.65));
});

test("Weißgold: Palladium ab Werk nicht verrechnet, per Kästchen zuschaltbar", async ({ page }) => {
  await posten(page, "weissgold", "585", "10");
  const nurGold = 10 * 0.585 * KURSE.XAU;
  const mitPd = nurGold + 10 * 0.19 * KURSE.XPD;

  await expect(page.locator("#ga-pd-aktiv")).not.toBeChecked();
  expect((await zeilen(page)).some((t) => /Palladium/.test(t))).toBe(false);
  expect((await zeilen(page)).find((t) => /^Metallwert/.test(t))).toContain(de(nurGold, 2));
  await expect(summe(page)).toHaveText(betrag(nurGold * 0.65));

  await page.check("#ga-pd-aktiv");
  expect((await zeilen(page)).some((t) => /Palladium/.test(t))).toBe(true);
  await expect(summe(page)).toHaveText(betrag(mitPd * 0.65));

  await page.uncheck("#ga-pd-aktiv");
  await expect(summe(page)).toHaveText(betrag(nurGold * 0.65));
});

test("Silber zum Silberkurs", async ({ page }) => {
  await posten(page, "silber", "925", "100");
  await expect(summe(page)).toHaveText(betrag(100 * 0.925 * KURSE.XAG * 0.65));
});
