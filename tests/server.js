// Statischer Server für die Tests — liefert das Projektverzeichnis aus,
// ohne weitere Abhängigkeit. Aufruf: node tests/server.js [port]
const http = require("http");
const fs = require("fs");
const path = require("path");

const WURZEL = path.join(__dirname, "..");
const PORT = Number(process.argv[2]) || 8123;
const TYPEN = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

http.createServer(function (req, res) {
  const pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const datei = path.join(WURZEL, pfad === "/" ? "index.html" : pfad);
  if (!datei.startsWith(WURZEL + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(datei, function (err, inhalt) {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPEN[path.extname(datei)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(inhalt);
  });
}).listen(PORT);
