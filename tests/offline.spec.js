// Offline-Start über den Service Worker. Nur hier ist er zugelassen —
// die übrigen Tests blockieren ihn (siehe playwright.config.js).
const { test, expect } = require("@playwright/test");
const { keinNetz } = require("./helfer");

test.use({ serviceWorkers: "allow" });

async function wartenBisSwSteuert(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Beim allerersten Besuch steuert der Worker die Seite erst nach clients.claim()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

test("startet nach einem Besuch auch ohne Netz", async ({ page, context }) => {
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(e.message));
  await keinNetz(context);           // Kursquellen spielen hier keine Rolle
  await page.goto("/index.html");
  await wartenBisSwSteuert(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Goldschmiede-Rechner");

  // und rechnet: Ringrechner-Grundzustand, dann Schliffformen
  await page.click('.tab[data-tab="schliff"]');
  await expect(page.locator(".sf-zeile")).toHaveCount(10);

  // auch unter der Verzeichnisadresse, wie sie der Home-Bildschirm öffnet
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Goldschmiede-Rechner");

  // Icons fürs Home-Bildschirm-Symbol liegen ebenfalls im Speicher
  const icon = await page.evaluate(async () => (await fetch("icon-192.png")).status);
  expect(icon).toBe(200);
  expect(fehler).toEqual([]);
});

test("mit Netz kommt die Seite frisch vom Server, nicht aus dem Speicher", async ({ page, context }) => {
  await keinNetz(context);
  await page.goto("/index.html");
  await wartenBisSwSteuert(page);

  // Die gespeicherte Fassung heimlich verändern: käme die Seite aus dem
  // Speicher, stünde die Markierung nach dem Neuladen da.
  await page.evaluate(async () => {
    const c = await caches.open("goldschmiede-rechner-v1");
    await c.put("index.html", new Response("<h1>ALT</h1>", { headers: { "Content-Type": "text/html" } }));
  });
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Goldschmiede-Rechner");

  // …und der Speicher trägt danach wieder die echte Fassung
  const inhalt = await page.evaluate(async () => {
    const c = await caches.open("goldschmiede-rechner-v1");
    return (await (await c.match("index.html")).text()).length;
  });
  expect(inhalt).toBeGreaterThan(10000);
});

test("Kursabfragen an fremde Server laufen am Speicher vorbei", async ({ page, context }) => {
  await keinNetz(context);
  await page.goto("/index.html");
  await wartenBisSwSteuert(page);
  await page.click('.tab[data-tab="wert"]');
  await expect(page.locator("#kurs-stand")).toContainText("nicht abrufbar");

  const namen = await page.evaluate(async () => {
    const c = await caches.open("goldschmiede-rechner-v1");
    return (await c.keys()).map((r) => new URL(r.url).host);
  });
  expect(namen.every((h) => h === new URL(page.url()).host)).toBe(true);
});
