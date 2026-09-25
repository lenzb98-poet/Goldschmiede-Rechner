// Tests für den Goldschmiede-Rechner: `npm install`, einmalig
// `npx playwright install chromium`, danach `npm test`.
const { defineConfig } = require("@playwright/test");

const PORT = 8123;

module.exports = defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:" + PORT,
    viewport: { width: 400, height: 1800 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    // Der Service Worker würde Abfragen an sich ziehen, an denen die
    // Kurs-Attrappen aus tests/helfer.js vorbeigingen. Nur offline.spec.js
    // lässt ihn zu — dort geht es genau um ihn.
    serviceWorkers: "block"
  },

  projects: [{ name: "chromium", use: { browserName: "chromium" } }],

  // Winziger eigener Server statt eines Pakets: die App ist eine statische
  // Datei, mehr braucht es nicht.
  webServer: {
    command: "node tests/server.js " + PORT,
    url: "http://localhost:" + PORT + "/index.html",
    reuseExistingServer: !process.env.CI
  }
});
