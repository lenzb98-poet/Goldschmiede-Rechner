// Werkzeug, kein Bestandteil der App: index.html bleibt eine einzige Datei.
// Erzeugt den SVG-Pfad der Spirale, falls die Bildmarke je nachjustiert
// werden soll.  Aufruf:  node logo-spirale.js
// Das Ergebnis (Feld "d") ersetzt das d="..." der <svg class="mark"> in index.html.
//
// Generator für die Spirale des "Feuer und Flamme"-Logos.
// Archimedische Spirale (gleichmäßige Lücke zwischen den Windungen),
// vertikal gestaucht. Am Ende bricht der Radius aus -> die Fahne fliegt
// nach rechts weg, ohne Knick, weil die Tangente stetig bleibt.

const PI = Math.PI;
const P = {
  cx: 690, cy: 270,
  r0: 70, rk: 33,            // Grundspirale: r = r0 + rk*theta
  ys: 0.45,                  // vertikale Stauchung
  h0: 26, hk: 2.3,           // Halbbreite h = h0 + hk*theta
  thetaMax: 4.12 * PI,
  flareFrom: 3.70 * PI,       // ab hier bricht der Radius aus
  flare: 88,                 // Stärke des Ausbruchs (quadratisch)
  taperFrom: 3.86 * PI,      // ab hier läuft die Breite auf 0 aus
  taperPow: 1.2,
  steps: 300,
};

function radius(t) {
  const over = Math.max(0, t - P.flareFrom);
  return P.r0 + P.rk * t + P.flare * over * over;
}
function pt(t) {
  const r = radius(t);
  return [P.cx + r * Math.cos(t), P.cy + r * Math.sin(t) * P.ys];
}
function halfWidth(t) {
  const base = P.h0 + P.hk * t;
  if (t <= P.taperFrom) return base;
  const u = (t - P.taperFrom) / (P.thetaMax - P.taperFrom);
  return base * Math.pow(1 - u, P.taperPow);
}

// --- Mittellinie: [x, y, h] ---
const line = [];
for (let i = 0; i <= P.steps; i++) {
  const t = (P.thetaMax * i) / P.steps;
  const [x, y] = pt(t);
  line.push([x, y, halfWidth(t)]);
}

// --- Band aus der Mittellinie aufbauen ---
const n = line.map((p, i) => {
  const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
});

const left  = line.map((p, i) => [p[0] + n[i][0] * p[2], p[1] + n[i][1] * p[2]]);
const right = line.map((p, i) => [p[0] - n[i][0] * p[2], p[1] - n[i][1] * p[2]]);

// runde Kappe am inneren Ende (der "Kopf"): vom rechten Rand über die
// Rückseite der Tangente zurück zum linken Rand
const cap = [];
{
  const [x, y, h] = line[0];
  const a0 = Math.atan2(n[0][1], n[0][0]);
  for (let i = 1; i < 14; i++) {
    const a = a0 + PI - (PI * i) / 14;
    cap.push([x + Math.cos(a) * h, y + Math.sin(a) * h]);
  }
}

const outline = [...left, ...right.slice().reverse(), ...cap];

// --- auf viewBox normieren (Breite = 100) ---
const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const S = 100 / (maxX - minX);

const d = 'M' + outline
  .map(p => `${((p[0] - minX) * S).toFixed(2)} ${((p[1] - minY) * S).toFixed(2)}`)
  .join('L') + 'Z';

const vbH = ((maxY - minY) * S).toFixed(2);
console.error(`viewBox 0 0 100 ${vbH}   Punkte: ${outline.length}   d-Länge: ${d.length}`);
console.log(JSON.stringify({ viewBox: `0 0 100 ${vbH}`, d }));
