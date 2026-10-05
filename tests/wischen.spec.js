// Wischen wechselt das Modul — mit echten Touch-Ereignissen über das
// DevTools-Protokoll, damit touch-action und Scrollen wie am Handy wirken.
const { test, expect, reiter } = require("./helfer");

test.use({ hasTouch: true, viewport: { width: 390, height: 800 } });

// Wischgeste von (x1, y1) nach (x2, y2) in einzelnen Schritten
async function wische(page, [x1, y1], [x2, y2], { schritte = 8, msJeSchritt = 16 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= schritte; i++) {
    const x = x1 + (x2 - x1) * i / schritte, y = y1 + (y2 - y1) * i / schritte;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(msJeSchritt);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
const nachLinks = (page, weg = 200, y = 450) => wische(page, [300, y], [300 - weg, y]);
const nachRechts = (page, weg = 200, y = 450) => wische(page, [80, y], [80 + weg, y]);
const aktiv = (page) => page.locator(".tab.active").getAttribute("data-tab");

test("nach links zum nächsten, nach rechts zum vorigen Modul", async ({ page }) => {
  await nachLinks(page);
  await expect.poll(() => aktiv(page)).toBe("umfang");
  await expect(page.locator("#panel-umfang")).toHaveClass(/active/);
  await nachLinks(page);
  await expect.poll(() => aktiv(page)).toBe("wert");
  await nachRechts(page);
  await expect.poll(() => aktiv(page)).toBe("umfang");
});

test("am Anfang und am Ende geht es nicht weiter", async ({ page }) => {
  await nachRechts(page);                                       // vor dem Ringrechner ist nichts
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("ring");

  await reiter(page, "mohs");                                   // letzter Reiter
  await nachLinks(page);
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("mohs");
});

test("ein kurzes, langsames Zucken wechselt nicht", async ({ page }) => {
  await wische(page, [250, 450], [215, 450], { schritte: 10, msJeSchritt: 40 });
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("ring");
  // und das Modul federt an seinen Platz zurück
  await expect.poll(() => page.locator("#panel-ring").evaluate((e) => e.style.transform)).toBe("");
});

test("ein schneller Schwung genügt auch auf kurzem Weg", async ({ page }) => {
  await wische(page, [250, 450], [190, 450], { schritte: 3, msJeSchritt: 10 });
  await expect.poll(() => aktiv(page)).toBe("umfang");
});

test("senkrechtes Wischen scrollt, wechselt aber nicht", async ({ page }) => {
  await wische(page, [200, 650], [230, 250]);
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("ring");
});

test("im Feld, in dem man gerade tippt, bleibt die Geste beim Feld", async ({ page }) => {
  await reiter(page, "wert");
  const feld = page.locator("#wert-gewicht");
  await feld.focus();
  const b = await feld.boundingBox();
  const y = b.y + b.height / 2;
  await wische(page, [b.x + b.width - 20, y], [b.x + 20, y]);
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("wert");
});

test("auf einem seitlich scrollenden Element bleibt die Geste beim Element", async ({ page }) => {
  // breite Tabelle in einem waagerecht scrollenden Behälter, wie im Umfang-Modul
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "breit";
    box.style.cssText = "overflow-x:auto;height:120px";
    box.innerHTML = '<div style="width:1200px;height:100px">breit</div>';
    document.querySelector("#panel-ring").prepend(box);
  });
  const b = await page.locator("#breit").boundingBox();
  await nachLinks(page, 200, b.y + 60);
  await page.waitForTimeout(300);
  expect(await aktiv(page)).toBe("ring");
});

test("gewischt wird wie getippt: gemerkt und angedockt", async ({ page }) => {
  await reiter(page, "umfang");
  await page.mouse.wheel(0, 1500);                             // Leiste angedockt
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await nachLinks(page, 200, 400);
  await expect.poll(() => aktiv(page)).toBe("wert");
  const leiste = await page.locator(".tab-leiste").boundingBox();
  expect(Math.round(leiste.y)).toBe(0);
  await page.reload();
  await expect(page.locator("#panel-wert")).toHaveClass(/active/);
});

test("Wischen über eine Zeile der Mohs-Liste wechselt, ohne sie anzutippen", async ({ page }) => {
  await reiter(page, "einheiten");
  await nachLinks(page);
  await expect.poll(() => aktiv(page)).toBe("verkleinern");
  await nachLinks(page);
  await expect.poll(() => aktiv(page)).toBe("mohs");
  const zeile = await page.locator(".mh-zeile").first().boundingBox();
  await nachRechts(page, 200, zeile.y + zeile.height / 2);
  await expect.poll(() => aktiv(page)).toBe("verkleinern");
  await reiter(page, "mohs");
  await expect(page.locator(".mh-zeile.aktiv")).toHaveCount(0);
});
