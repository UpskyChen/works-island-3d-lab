// 不規則島嶼的幾何：固定種子亂數、有機輪廓（海灣、岬角）、平滑曲線、點在多邊形內、島與島分開、步道曲線。
// 網站（layout.js、map.js）與產生器（tools/gen-islands.mjs）共用這一份，兩邊算出的形狀完全相同。

// ---------- 固定種子亂數 ----------
export function seedOf(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : seedOf(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// 從中心沿角度 a 走到矩形（半寬 hw、半高 hh）邊界的距離
export function boxExit(a, hw, hh) {
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return Math.min(c > 1e-9 ? hw / c : Infinity, s > 1e-9 ? hh / s : Infinity);
}

// 有機輪廓：以「包住內容框的圓角超橢圓」為底，加上起伏、海灣（內凹）與岬角（外凸）。
// 每個角度的半徑都不小於「內容框邊界＋留白的一半」，所以節點與文字一定在島上。
// 回傳以島中心為原點的點座標（整數）。
export function genOutline({ w, h, pad, seed, n = 56, bays = 2, capes = 2, wobble = 0.07 }) {
  const r = rng(seed);
  const hw = w / 2;
  const hh = h / 2;
  const e = 4; // 超橢圓指數：越大越方
  const k = Math.pow(2, 1 / e);
  const ax = hw * k + pad;
  const ay = hh * k + pad;
  const harm = [2, 3, 5, 7].map((f) => ({ f, ph: r() * Math.PI * 2, amp: wobble * (0.4 + r() * 0.6) / Math.sqrt(f / 2) }));
  const dent = (n, sign, depth) => Array.from({ length: n }, () => ({ at: r() * Math.PI * 2, width: 0.22 + r() * 0.25, depth: sign * depth * (0.6 + r() * 0.5) }));
  const feats = [...dent(bays, -1, 0.2), ...dent(capes, 1, 0.13)];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // 超橢圓半徑
    const base = 1 / Math.pow(Math.pow(Math.abs(c) / ax, e) + Math.pow(Math.abs(s) / ay, e), 1 / e);
    let m = 1;
    harm.forEach((hm) => { m += hm.amp * Math.sin(hm.f * a + hm.ph); });
    feats.forEach((f) => {
      let d = Math.abs(a - f.at) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      m += f.depth * Math.exp(-(d * d) / (2 * f.width * f.width));
    });
    const floor = boxExit(a, hw, hh) + pad * 0.55;
    const rad = Math.max(floor, base * m);
    pts.push([c * rad, s * rad]);
  }
  // 取樣點之間是直線，內容框的角可能剛好落在兩點之間；不夠就整體放大一點，直到框（含一點留白）完全在島內
  const box = { x: -hw - pad * 0.3, y: -hh - pad * 0.3, w: w + pad * 0.6, h: h + pad * 0.6 };
  let k2 = 1;
  while (k2 < 2 && !boxInPoly(box, pts.map(([x, y]) => [x * k2, y * k2]))) k2 *= 1.02;
  return pts.map(([x, y]) => [Math.round(x * k2), Math.round(y * k2)]);
}

// 小浮島、沙洲之類的小形狀
export function genBlob({ rx, ry, seed, n = 18, wobble = 0.16 }) {
  const r = rng(seed);
  const ph = [r() * 6.28, r() * 6.28];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = 1 + wobble * Math.sin(2 * a + ph[0]) * 0.6 + wobble * Math.sin(3 * a + ph[1]) * 0.4;
    pts.push([Math.round(Math.cos(a) * rx * m), Math.round(Math.sin(a) * ry * m)]);
  }
  return pts;
}

// 封閉的平滑曲線（Catmull-Rom 轉三次貝茲）；可平移、縮放、垂直壓縮
export function smoothPath(pts, { dx = 0, dy = 0, s = 1, sy = 1 } = {}) {
  const P = pts.map(([x, y]) => [dx + x * s, dy + y * s * sy]);
  const n = P.length;
  const f = (v) => v.toFixed(1);
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

export function pointInPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i];
    const [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 把島的相對輪廓換成絕對座標
export const absPts = (isl) => isl.pts.map(([x, y]) => [isl.cx + x * isl.s, isl.cy + y * isl.s]);

// 矩形是否完全在多邊形內（沿四邊取樣檢查）
export function boxInPoly(b, P, steps = 6) {
  for (let i = 0; i <= steps; i++) {
    const tx = b.x + (b.w * i) / steps;
    const ty = b.y + (b.h * i) / steps;
    if (!pointInPoly(tx, b.y, P) || !pointInPoly(tx, b.y + b.h, P)) return false;
    if (!pointInPoly(b.x, ty, P) || !pointInPoly(b.x + b.w, ty, P)) return false;
  }
  return true;
}

// 兩座島最近的兩個岸點與距離（重疊時距離為負）
export function closest(A, B) {
  let best = { d: Infinity, a: A[0], b: B[0] };
  for (const a of A) for (const b of B) {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < best.d) best = { d, a, b };
  }
  const overlap = A.some(([x, y]) => pointInPoly(x, y, B)) || B.some(([x, y]) => pointInPoly(x, y, A));
  if (overlap) best.d = -best.d;
  return best;
}

// 島與島至少隔 gap：重疊或太近就沿兩島中心連線推開（固定順序，結果固定）
export function separate(islands, gap, maxIter = 300) {
  for (let it = 0; it < maxIter; it++) {
    let movedAny = false;
    const abs = islands.map(absPts);
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const c = closest(abs[i], abs[j]);
        if (c.d >= gap) continue;
        const a = islands[i];
        const b = islands[j];
        let vx = b.cx - a.cx;
        let vy = b.cy - a.cy;
        const len = Math.hypot(vx, vy) || 1;
        vx /= len;
        vy /= len;
        const push = (gap - c.d) / 2 + 1;
        a.cx -= vx * push; a.cy -= vy * push;
        b.cx += vx * push; b.cy += vy * push;
        abs[i] = absPts(a);
        abs[j] = absPts(b);
        movedAny = true;
      }
    }
    if (!movedAny) return it;
  }
  return maxIter;
}

// 步道：兩島最近岸點往各自島內縮一點當端點，中間彎曲；rise 是拱起高度（只是裝飾）
export function walkwayGeom(A, B, ca, cb, { bend = 0, rise = 0, inset = 16, samples = 24 } = {}) {
  const c = closest(A, B);
  const into = (p, ctr) => {
    const vx = ctr[0] - p[0];
    const vy = ctr[1] - p[1];
    const l = Math.hypot(vx, vy) || 1;
    return [p[0] + (vx / l) * inset, p[1] + (vy / l) * inset];
  };
  const p0 = into(c.a, ca);
  const p2 = into(c.b, cb);
  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) || 1;
  const nx = -(p2[1] - p0[1]) / len;
  const ny = (p2[0] - p0[0]) / len;
  const p1 = [mx + nx * bend * len, my + ny * bend * len];
  const ground = [];
  const deck = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    ground.push([x, y]);
    deck.push([x, y - rise * Math.sin(Math.PI * t)]);
  }
  return { ground, deck, len };
}

// 把 smoothPath 的同一條平滑曲線取樣成折線（3D 地塊用，和 SVG 的輪廓完全重合）
export function smoothPoints(pts, { dx = 0, dy = 0, s = 1 } = {}, seg = 6) {
  const P = pts.map(([x, y]) => [dx + x * s, dy + y * s]);
  const n = P.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let j = 0; j < seg; j++) {
      const t = j / seg;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push([a * p1[0] + b * c1[0] + c * c2[0] + d * p2[0], a * p1[1] + b * c1[1] + c * c2[1] + d * p2[1]]);
    }
  }
  return out;
}

// 封閉折線往外（d>0）或往內（d<0）平移 d：每個點沿相鄰兩邊法線的平均方向移動
export function offsetPoly(P, d) {
  const n = P.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const sgn = area > 0 ? 1 : -1; // 讓法線朝外
  return P.map((p, i) => {
    const a = P[(i - 1 + n) % n];
    const b = P[(i + 1) % n];
    let nx = (b[1] - a[1]) * sgn;
    let ny = -(b[0] - a[0]) * sgn;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    return [p[0] + nx * d, p[1] + ny * d];
  });
}
