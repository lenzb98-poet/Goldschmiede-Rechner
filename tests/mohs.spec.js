// Mohshärte: Skala als Leiter, Suche, Vergleich über die Liste, Alltagsurteil.
const { test, expect, reiter } = require("./helfer");

// y-Lage einer Härte auf der Leiter (10 oben) — unabhängig nachgebaut
const Y = (h) => 16 + (10 - h) * 25;

const zeile = (page, name) => page.locator(".mh-zeile")
  .filter({ has: page.locator(".mh-zeile-name", { hasText: new RegExp("^" + name + "(Skala|organisch|Alltag)?$", "i") }) });
const namen = (page) => page.locator(".mh-zeile-name").evaluateAll((els) =>
  els.map((e) => e.firstChild.textContent.trim()));

test.beforeEach(async ({ page }) => {
  await reiter(page, "mohs");
});

test("ohne Auswahl: die zehn Stufen der Skala, noch kein Stein", async ({ page }) => {
  await expect(page.locator(".mh-name")).toHaveText("Mohsskala");
  expect(await page.locator(".mh-mineral").allTextContents()).toEqual(
    ["Talk", "Gips", "Calcit", "Fluorit", "Apatit", "Orthoklas", "Quarz", "Topas", "Korund", "Diamant"]);
  await expect(page.locator(".mh-band")).toHaveCount(0);
  await expect(page.locator(".mh-urteil")).toHaveCount(0);
  await expect(page.locator(".mh-grenze-text")).toHaveText("ab 7 ringtauglich");
});

test("Stein antippen: Name, Härte, Balken an der richtigen Stelle, Referenz hervorgehoben", async ({ page }) => {
  await zeile(page, "Smaragd").click();
  await expect(page.locator(".mh-name")).toHaveText("Smaragd");
  await expect(page.locator(".mh-wert")).toHaveText("7,5–8");
  await expect(zeile(page, "Smaragd")).toHaveAttribute("aria-pressed", "true");

  const band = page.locator(".mh-band");
  expect(+(await band.getAttribute("y"))).toBeCloseTo(Y(8) - 6, 5);
  expect(+(await band.getAttribute("y")) + +(await band.getAttribute("height"))).toBeCloseTo(Y(7.5) + 6, 5);
  await expect(page.locator(".mh-mineral.treffer")).toHaveText(["Topas"]);

  // Etikett ist auf die Textbreite gezogen, nicht beim Vorgabewert geblieben
  const breite = +(await page.locator(".mh-etikett-grund").getAttribute("width"));
  const text = await page.locator(".mh-etikett").evaluate((e) => e.getBBox().width);
  expect(breite).toBeCloseTo(text + 22, 0);
});

test("Liste vergleicht jeden Eintrag mit der Auswahl", async ({ page }) => {
  await zeile(page, "Saphir").click();
  await expect(zeile(page, "Diamant").locator(".mh-rel")).toHaveText("▲ ritzt Saphir");
  await expect(zeile(page, "Topas").locator(".mh-rel")).toHaveText("▼ wird von Saphir geritzt");
  await expect(zeile(page, "Rubin").locator(".mh-rel")).toHaveText("≈ etwa gleich hart");
  await expect(zeile(page, "Saphir").locator(".mh-rel")).toHaveCount(0);

  // Spannen ehrlich: Zirkon (6,5–7,5) gegen Quarz (7) überlappt
  await zeile(page, "Quarz").click();
  await expect(zeile(page, "Zirkon").locator(".mh-rel")).toHaveText("≈ etwa gleich hart");
  await expect(zeile(page, "Smaragd").locator(".mh-rel")).toHaveText("▲ ritzt Quarz");
});

test("nochmal antippen hebt die Auswahl auf", async ({ page }) => {
  await zeile(page, "Opal").click();
  await expect(page.locator(".mh-name")).toHaveText("Opal");
  await zeile(page, "Opal").click();
  await expect(page.locator(".mh-name")).toHaveText("Mohsskala");
  await expect(page.locator(".mh-rel")).toHaveCount(0);
});

test.describe("Alltagsurteil an der Grenze 7", () => {
  for (const [name, stufe, titel] of [
    ["Saphir", "gut", "Alltagstauglich, auch im Ring"],
    ["Amethyst", "gut", "Alltagstauglich, auch im Ring"],       // genau 7
    ["Tansanit", "mittel", "Bedingt alltagstauglich"],          // 6–7: untere Grenze zählt
    ["Opal", "mittel", "Bedingt alltagstauglich"],
    ["Türkis", "weich", "Empfindlich"],
    ["Perle", "weich", "Empfindlich"]
  ]) {
    test(`${name}: ${titel}`, async ({ page }) => {
      await zeile(page, name).click();
      await expect(page.locator(".mh-urteil")).toHaveText(titel);
      await expect(page.locator(".mh-urteil")).toHaveClass(new RegExp("mh-urteil-" + stufe));
    });
  }

  test("Vergleichsgegenstände bekommen kein Urteil", async ({ page }) => {
    await zeile(page, "Stahlfeile").click();
    await expect(page.locator(".mh-urteil")).toHaveCount(0);
    await expect(page.locator(".mh-hinweis")).toContainText("Glas");
  });
});

test("Werkstatt-Hinweis nur, wo es einen gibt", async ({ page }) => {
  await zeile(page, "Topas").click();
  await expect(page.locator(".mh-hinweis")).toContainText("spaltbar");
  await zeile(page, "Spinell").click();
  await expect(page.locator(".mh-hinweis")).toHaveCount(0);
});

test.describe("Suche", () => {
  test("findet auch über den Mineralnamen", async ({ page }) => {
    await page.fill("#mh-suche", "beryll");
    // die drei Berylle über "auch", Chrysoberyll über den eigenen Namen
    expect((await namen(page)).sort()).toEqual(["Aquamarin", "Chrysoberyll", "Morganit", "Smaragd"]);
  });

  test("ohne Rücksicht auf Umlaute", async ({ page }) => {
    await page.fill("#mh-suche", "turkis");
    expect(await namen(page)).toEqual(["Türkis"]);
  });

  test("eine Zahl sucht nach Härte", async ({ page }) => {
    await page.fill("#mh-suche", "9");
    expect((await namen(page)).sort()).toEqual(["Korund", "Rubin", "Saphir"]);
    await page.fill("#mh-suche", "6,5");
    const n = await namen(page);
    expect(n).toContain("Granat");          // 6,5–7,5
    expect(n).toContain("Stahlfeile");      // 6,5
    expect(n).not.toContain("Quarz");
  });

  test("nichts gefunden", async ({ page }) => {
    await page.fill("#mh-suche", "Kryptonit");
    await expect(page.locator("#mh-liste .placeholder")).toHaveText("Nichts gefunden.");
  });
});

test("Filter und Sortierung", async ({ page }) => {
  const alle = await namen(page);
  expect(alle[0]).toBe("Diamant");
  expect(alle[alle.length - 1]).toBe("Talk");

  await page.click('#mh-filter button[data-filter="stein"]');
  let n = await namen(page);
  expect(n).toContain("Perle");
  expect(n).not.toContain("Hausstaub");
  expect(n).not.toContain("Talk");

  await page.click('#mh-filter button[data-filter="alltag"]');
  n = await namen(page);
  expect(n).toContain("Feingold");
  expect(n).not.toContain("Saphir");

  await page.click('#mh-filter button[data-filter="alle"]');
  await page.click('#mh-sortierung button[data-sort="name"]');
  n = await namen(page);
  expect(n).toEqual([...n].sort((a, b) => a.localeCompare(b, "de")));
});

test("Mini-Skala jeder Zeile zeigt die Spanne an der richtigen Stelle", async ({ page }) => {
  const spur = zeile(page, "Granat").locator(".mh-spur");
  const band = spur.locator(".mh-spur-band");
  const s = await spur.boundingBox(), b = await band.boundingBox();
  const px = (h) => s.x + (h - 1) / 9 * s.width;
  expect(b.x + 3).toBeCloseTo(px(6.5), 0);
  expect(b.x + b.width - 3).toBeCloseTo(px(7.5), 0);
});
