// Vorübergehend: prüft von GitHub Actions aus, welche Verlaufsquellen antworten.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
async function hole(url, opt = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", ...(opt.headers || {}) } });
  return { status: r.status, acao: r.headers.get("access-control-allow-origin"), text: await r.text() };
}
const zeig = (name, a, wieviel = 300) =>
  console.log(`\n### ${name}: HTTP ${a.status} · ${a.text.length} Z · ACAO=${a.acao}\n${a.text.slice(0, wieviel)}`);
(async () => {
  try {
    const a = await hole("https://freegoldapi.com/data/latest.json");
    const d = JSON.parse(a.text);
    console.log("\n### FreeGoldAPI: " + d.length + " Einträge");
    console.log("letzte 8:", JSON.stringify(d.slice(-8)));
    const seit = d.filter((e) => e.date >= "2021-01-01");
    console.log("ab 2021:", seit.length, "Einträge; Quellen:", [...new Set(seit.map((e) => e.source))].join(" | "));
  } catch (e) { console.log("FreeGoldAPI FEHLER", e.message); }

  for (const k of ["BBEX3/D.XAU.USD.EA.AC.C04", "BBEX3/D.XAU.USD.EA.AC.C05", "BBEX3/D.XAG.USD.EA.AC.C04", "BBEX3/D.XPT.USD.EA.AC.C04", "BBK01/WT5021", "BBK01/WT5023"]) {
    try { zeig("Bundesbank " + k, await hole("https://api.statistiken.bundesbank.de/rest/data/" + k + "?format=sdmx_csv&lastNObservations=3"), 400); }
    catch (e) { console.log("Bundesbank " + k + " FEHLER " + e.message); }
  }
  for (const [n, u] of [
    ["NBP Gold", "https://api.nbp.pl/api/cenyzlota/last/3?format=json"],
    ["Yahoo q2 GC=F", "https://query2.finance.yahoo.com/v8/finance/chart/GC=F?range=1mo&interval=1d"],
    ["Yahoo q2 SI=F", "https://query2.finance.yahoo.com/v8/finance/chart/SI=F?range=1mo&interval=1d"],
    ["metals.live", "https://api.metals.live/v1/spot"],
    ["gold-api XAG Preis", "https://api.gold-api.com/price/XAG"],
    ["gold-api XPT Preis", "https://api.gold-api.com/price/XPT"]
  ]) {
    try { zeig(n, await hole(u), 300); } catch (e) { console.log(n + " FEHLER " + e.message); }
  }
})();
