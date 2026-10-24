// Vorübergehend: prüft von GitHub Actions aus, welche Verlaufsquellen antworten.
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const QUELLEN = [
  ["LBMA (Browser-Kennung)", "https://prices.lbma.org.uk/json/gold_pm.json", BROWSER],
  ["Stooq XAUUSD", "https://stooq.com/q/d/l/?s=xauusd&i=d", BROWSER],
  ["Yahoo GC=F", "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5y&interval=1d", BROWSER],
  ["Yahoo SI=F", "https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=5y&interval=1d", BROWSER],
  ["Yahoo PL=F", "https://query1.finance.yahoo.com/v8/finance/chart/PL=F?range=5y&interval=1d", BROWSER],
  ["FreeGoldAPI", "https://freegoldapi.com/data/latest.json", BROWSER],
  ["Bundesbank Gold USD", "https://api.statistiken.bundesbank.de/rest/data/BBEX3/D.XAU.USD.EA.AC.C05?format=csv&lang=de&startPeriod=2026-09-01", BROWSER],
  ["gold-api History", "https://api.gold-api.com/history?symbol=XAU", BROWSER]
];
(async () => {
  for (const [name, url, ua] of QUELLEN) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua, "Accept": "*/*" } });
      const t = await r.text();
      console.log(`${name}: HTTP ${r.status} · ${t.length} Zeichen · ACAO=${r.headers.get("access-control-allow-origin")} · ${JSON.stringify(t.slice(0, 160))}`);
    } catch (e) { console.log(`${name}: FEHLER ${e.message}`); }
  }
})();
