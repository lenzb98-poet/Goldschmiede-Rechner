// Gemeinsame Bausteine der Tests.
//
// Die App fragt Metallkurse in USD je Unze und den Wechselkurs USD→EUR ab.
// Die Attrappe setzt den Wechselkurs auf 1 und liefert je Metall genau
// (Euro je Gramm) · Unze — dann kommen in der App glatte Grammpreise an,
// und die erwarteten Werte in den Tests lassen sich im Kopf nachrechnen.
const { test: basis, expect } = require("@playwright/test");

const UNZE = 31.1034768;

// Euro je Gramm, wie sie in der App ankommen sollen
const KURSE = { XAG: 1.0, XAU: 80.0, XPT: 30.0, XPD: 25.0 };

async function kurseAttrappe(ziel, kurse = KURSE) {
  await ziel.route("**/api.frankfurter.dev/**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ rates: { EUR: 1.0 } }) }));
  await ziel.route("**/api.frankfurter.app/**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ rates: { EUR: 1.0 } }) }));
  await ziel.route("**/api.gold-api.com/price/*", (r) => {
    const symbol = r.request().url().split("/").pop();
    if (kurse[symbol] == null) return r.abort();
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ price: kurse[symbol] * UNZE }) });
  });
  // Kursverlauf: in den Tests nicht gebraucht, soll aber auch nicht ins Netz
  await ziel.route("**/prices.lbma.org.uk/**", (r) => r.abort());
  await ziel.route("**/stooq.com/**", (r) => r.abort());
}

// Alle Kursquellen tot — wie in der Werkstatt ohne Netz
async function keinNetz(ziel) {
  for (const muster of ["**/api.frankfurter.dev/**", "**/api.frankfurter.app/**",
    "**/api.gold-api.com/**", "**/prices.lbma.org.uk/**", "**/stooq.com/**"]) {
    await ziel.route(muster, (r) => r.abort());
  }
}

// Deutsche Zahl aus einem Anzeigetext ziehen: "1.234,56 €" -> 1234.56
function zahl(text) {
  const t = String(text).match(/-?[\d.]+(?:,\d+)?/);
  if (!t) return NaN;
  return parseFloat(t[0].replace(/\./g, "").replace(",", "."));
}

// Zahl so, wie die App sie anzeigt
function de(n, stellen) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

// Muster für einen angezeigten Eurobetrag, egal ob mit oder ohne Leerzeichen vor "€"
function betrag(n, stellen = 2) {
  return new RegExp("^\\s*" + de(n, stellen).replace(/\./g, "\\.") + "\\s*€\\s*$");
}

// Test mit Kurs-Attrappe und geöffneter App; Seitenfehler lassen den Test scheitern.
const test = basis.extend({
  page: async ({ page, context }, use) => {
    const fehler = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    await kurseAttrappe(context);
    await page.goto("/index.html");
    await use(page);
    expect(fehler, "JavaScript-Fehler auf der Seite").toEqual([]);
  }
});

async function reiter(page, name) {
  await page.click(`.tab[data-tab="${name}"]`);
  await expect(page.locator(`#panel-${name}`)).toHaveClass(/active/);
}

module.exports = { test, expect, UNZE, KURSE, kurseAttrappe, keinNetz, zahl, de, betrag, reiter };
