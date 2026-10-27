// 島嶼地圖（2.5D）：不規則輪廓的島（頂面、岸線、側面厚度、水面倒影）、沙洲／礁石／小浮島、
// 高低彎度不同的步道、景物與地標（依 y 值排序前後遮擋）、分區標籤、空地告示牌、已逛完章、插圖資產槽，
// 以及鏡頭（平滑聚焦並微調傾角、拖曳、雙指縮放）。
//
// 3D 視覺實驗版：有 opts.underlay（Three.js 畫布）時，地形、裝飾、步道、景物改由 3D 場景畫在 SVG 下層，
// SVG 只留文字、節點、連線、印章與透明的點擊範圍（.has-3d）；每次更新 viewBox 都經 opts.onView 通知 3D 場景對齊鏡頭。
// 瀏覽器不支援 WebGL 時沒有 underlay，整張地圖照舊是 2.5D SVG。
//
// 圖層：ground（平貼在地面、跟著傾角壓縮：倒影、裝飾、步道、島、作品連線）
//      upright（直立物：景物、地標、告示牌，依底部 y 值排序）→ titles（標籤）→ stamps → nodes
// 直立物與文字不會被傾角壓扁，只會跟著地面移動位置。
import { svg, textUnits, reducedMotion, emit } from './util.js';
import { t } from './text.js';
import { rng, smoothPath, pointInPoly, walkwayGeom } from './terrain.js';

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });
const f1 = (v) => v.toFixed(1);
const polyline = (pts) => pts.map(([x, y], i) => (i ? 'L' : 'M') + f1(x) + ' ' + f1(y)).join('');

export function createMap(stage, host, opts) {
  const svgEl = svg('svg', { class: 'island-map', role: 'group', 'aria-label': opts.label, preserveAspectRatio: 'xMinYMin meet' });
  // 鏡頭補間用的外層：transform 加在這個 div 上（加在 <svg> 本身會讓整張地圖每格重新排版）
  const camEl = document.createElement('div');
  camEl.className = 'cam-layer';
  if (opts.underlay) camEl.appendChild(opts.underlay);
  camEl.appendChild(svgEl);
  host.appendChild(camEl);
  const has3d = !!opts.underlay;
  // 傾角：2.5D 版全景 1、聚焦 1.1（地面稍微拉高）；3D 版是真實俯角的 sin
  const TILT_PANO = opts.tilts ? opts.tilts.pano : 1;
  const TILT_FOCUS = opts.tilts ? opts.tilts.focus : 1.1;

  let layout = null;
  let cam = { vx: 0, vy: 0, k: 1 };
  let tilt = TILT_PANO;
  let pivot = 0;
  let W = 1;
  let H = 1;
  let target = { type: 'pano' };
  let tween = null;
  let lastDragged = false;
  let uprightEls = [];
  const layers = {};
  const labelBoxes = {};
  let props3d = [];

  const P = (y, tt = tilt) => pivot + (y - pivot) * tt;

  // ---------- 繪製 ----------
  function build(model, lay, propsDoc, { intro } = {}) {
    layout = lay;
    pivot = lay.height / 2;
    const m = lay.m;
    const names = lay.mode === 'names';
    const cfg = lay.config;
    const D = m.depth;
    svgEl.textContent = '';
    svgEl.setAttribute('class', 'island-map nodes-' + lay.mode + (has3d ? ' has-3d' : '') + (intro && !reducedMotion() ? ' intro' : ''));
    props3d = [];

    layers.ground = svg('g', { class: 'ground' });
    layers.shadows = svg('g', { class: 'shadows', 'aria-hidden': 'true' });
    const gDecor = svg('g', { class: 'decor', 'aria-hidden': 'true' });
    const gWalk = svg('g', { class: 'walkways', 'aria-hidden': 'true' });
    const gIslands = svg('g', { class: 'islands' });
    layers.links = svg('g', { class: 'links' });
    layers.upright = svg('g', { class: 'upright' });
    layers.titles = svg('g', { class: 'titles' });
    layers.stamps = svg('g', { class: 'stamps' });
    layers.nodes = svg('g', { class: 'nodes' });
    const byZone = Object.fromEntries(lay.islands.map((isl) => [isl.zone.id, isl]));
    const uprights = [];
    const addUpright = (node, x, y) => {
      node.setAttribute('data-ax', f1(x));
      node.setAttribute('data-ay', f1(y));
      uprights.push(node);
      return node;
    };

    // 裝飾：沙洲、礁石、小浮島
    lay.decor.forEach((d, i) => {
      if (d.type === 'sandbar') {
        const tr = `translate(${f1(d.x)} ${f1(d.y)}) rotate(${d.rot || 0})`;
        gDecor.appendChild(svg('g', { class: 'sandbar', transform: tr }, [
          svg('path', { class: 'sb-foam', d: smoothPath(d.pts), 'stroke-width': names ? 6 : 4 }),
          svg('path', { class: 'sb-sand', d: smoothPath(d.pts) })
        ]));
      } else if (d.type === 'reef') {
        gDecor.appendChild(svg('g', { class: 'reef', transform: `translate(${f1(d.x)} ${f1(d.y)})` },
          d.rocks.flatMap(([x, y, r]) => [
            svg('circle', { class: 'reef-foam', cx: x, cy: y + r * 0.3, r: r * 1.7 }),
            svg('ellipse', { class: 'reef-rock', cx: x, cy: y, rx: r, ry: r * 0.75 })
          ])));
      } else if (d.type === 'islet') {
        const dd = D * 0.45;
        layers.shadows.appendChild(svg('path', { class: 'island-shadow', d: smoothPath(d.pts, { dx: d.x + dd * 0.6, dy: d.y + dd * 1.6 }) }));
        gDecor.appendChild(svg('g', { class: 'islet' }, [
          svg('path', { class: 'foam', d: smoothPath(d.pts, { dx: d.x, dy: d.y + dd }), 'stroke-width': names ? 6 : 4 }),
          svg('path', { class: 'side', d: smoothPath(d.pts, { dx: d.x, dy: d.y + dd }) }),
          svg('path', { class: 'shore', d: smoothPath(d.pts, { dx: d.x, dy: d.y }) }),
          svg('path', { class: 'top', d: smoothPath(d.pts, { dx: d.x, dy: d.y, s: 0.8 }) })
        ]));
        if (d.prop) {
          const size = (names ? 30 : 18);
          props3d.push({ name: d.prop, x: d.x, y: d.y + 2, size, islet: true });
          if (propsDoc) addUpright(placeProp(propsDoc, d.prop, size), d.x, d.y + 2).classList.add('scenery');
        }
      }
    });

    // 步道：中性木色、高低彎度各不相同的拱橋或棧道（只是裝飾，不代表作品關聯）
    lay.walkways.forEach((wk) => {
      const A = byZone[wk.from];
      const B = byZone[wk.to];
      const g = walkwayGeom(A.abs, B.abs, [A.cx, A.cy], [B.cx, B.cy], { bend: wk.bend, rise: wk.rise, inset: names ? 22 : 12 });
      const width = names ? 12 : 7;
      const parts = [
        svg('path', { class: 'wk-shadow', d: polyline(g.ground.map(([x, y]) => [x + 3, y + width * 0.5 + 2])), 'stroke-width': width })
      ];
      // 橋墩／木樁：從橋面垂到水面
      const step = wk.kind === 'arch' ? 4 : 3;
      for (let i = step; i < g.deck.length - step; i += step) {
        const [x, y] = g.deck[i];
        const gy = g.ground[i][1] + width * 0.45;
        parts.push(svg('path', { class: 'wk-post', d: `M${f1(x)} ${f1(y + width * 0.3)} L${f1(x)} ${f1(gy)}`, 'stroke-width': names ? 2.4 : 1.6 }));
      }
      const deck = polyline(g.deck);
      parts.push(
        svg('path', { class: 'wk-edge', d: deck, 'stroke-width': width + 3 }),
        svg('path', { class: 'wk-deck', d: deck, 'stroke-width': width }),
        svg('path', { class: 'wk-planks', d: deck, 'stroke-width': width - 2, 'stroke-dasharray': names ? '2 4' : '1.5 3' })
      );
      gWalk.appendChild(svg('g', { class: 'walkway wk-' + wk.kind }, parts));
    });

    // 島：由後往前畫（依中心 y），前面的島會擋住後面的
    lay.islands.slice().sort((a, b) => a.cy - b.cy).forEach((isl, i) => {
      const z = isl.zone;
      const o = { dx: isl.cx, dy: isl.cy, s: isl.s };
      const pts = isl.pts;
      const g = svg('g', { class: 'island zone-' + z.id, 'data-zone': z.id, style: { animationDelay: i * 0.12 + 's' } });
      const shadow = svg('path', { class: 'island-shadow', d: smoothPath(pts, { ...o, dx: o.dx + D * 0.6, dy: o.dy + D * 1.5 }) });
      layers.shadows.appendChild(shadow);
      g.appendChild(svg('path', { class: 'foam', d: smoothPath(pts, { ...o, dy: o.dy + D }), 'stroke-width': D * 1.1 }));
      g.appendChild(svg('path', { class: 'side side-low', d: smoothPath(pts, { ...o, dy: o.dy + D }) }));
      g.appendChild(svg('path', { class: 'side', d: smoothPath(pts, { ...o, dy: o.dy + D * 0.6 }) }));
      g.appendChild(svg('path', { class: 'side side-high', d: smoothPath(pts, { ...o, dy: o.dy + D * 0.25 }) }));
      g.appendChild(svg('path', { class: 'shore', d: smoothPath(pts, o) }));
      g.appendChild(svg('path', { class: 'top', d: smoothPath(pts, { ...o, s: o.s * 0.965 }) }));
      g.appendChild(svg('path', { class: 'top-light', d: smoothPath(pts, { ...o, dy: o.dy - 4, s: o.s * 0.8 }) }));

      // 子區：地塊染色；空子區是空地
      isl.cells.forEach((b) => {
        g.appendChild(svg('rect', { class: b.cell.works.length ? 'cell-tint' : 'cell-lot', x: b.x - 4, y: b.y - 2, width: b.w + 8, height: b.h + 4, rx: 16 }));
      });

      // 版面上已被佔用的位置（節點、標籤、告示牌），景物不放在這些地方
      const busy = [];
      model.worksInZone(z.id).forEach((w) => {
        const p = lay.pos[w.id];
        if (!p) return;
        busy.push(grow({ x: p.x - p.w / 2, y: p.y - 15, w: p.w, h: 30 }, 8));
        if (w.relationLabel) busy.push({ x: p.x - 80, y: p.y + 14, w: 160, h: 26 });
      });

      // 分區標籤：色點＋區名（不顯示件數，避免和作品編號混淆）
      const labelH = names ? 28 : 24;
      const font = names ? 15 : 12;
      const dotR = names ? 5 : 4;
      const nameX = labelH / 2 + dotR + 6;
      const labelW = nameX + textUnits(z.name) * font + 12;
      const lx = isl.x;
      const ly = isl.y + (m.head - labelH) / 2 - 4;
      labelBoxes[z.id] = { x: lx, y: ly, w: labelW, h: labelH };
      busy.push(grow({ x: lx, y: ly, w: labelW + (names ? 60 : 26), h: labelH }, 6));
      const label = svg('g', { class: 'zone-label zone-' + z.id, 'data-zone': z.id }, [
        svg('rect', { class: 'zl-body', x: 0, y: 0, width: labelW, height: labelH, rx: labelH / 2 }),
        svg('circle', { class: 'zl-badge', cx: labelH / 2, cy: labelH / 2, r: dotR }),
        svg('text', { class: 'zl-name', x: nameX, y: labelH / 2, dy: '0.35em', 'font-size': font, text: z.name })
      ]);
      layers.titles.appendChild(addUpright(label, lx, ly));

      // 標題列右側的小插畫
      const props = (cfg.props || {})[z.id] || [];
      const ps = m.propSize;
      const room = isl.x + isl.w - (lx + labelW + (names ? 64 : 30));
      const n = Math.min(props.length, Math.max(0, Math.floor(room / (ps + 4))), names ? 3 : 1);
      for (let j = 0; j < n; j++) {
        const px = isl.x + isl.w - (j + 1) * (ps + 4) + 4;
        const py = isl.y + (m.head - ps) / 2 - 1;
        addUpright(placeProp(propsDoc, props[j], ps, z.id), px + ps / 2, py + ps);
        busy.push(grow({ x: px, y: py, w: ps, h: ps }, 4));
      }

      isl.cells.forEach((b) => {
        const c = b.cell;
        const cf = names ? 14 : 11;
        busy.push({ x: b.x, y: b.y, w: b.w, h: m.cellHead });
        if (!c.works.length) busy.push(b);
        const cname = svg('text', { class: 'cell-name', 'data-zone': z.id, x: 0, y: 0, 'font-size': cf, text: c.name });
        layers.titles.appendChild(addUpright(cname, b.x + 10, b.y + (names ? 21 : 17)));
        const pname = (cfg.subzoneProps || {})[c.name];
        const cp = m.cellProp;
        if (pname && cp && b.w > textUnits(c.name) * cf + 40 + cp) {
          addUpright(placeProp(propsDoc, pname, cp, z.id), b.x + b.w - cp / 2 - 6, b.y + 3 + cp);
        }
        if (!c.works.length) {
          const sign = signpost(b, m, lay.mode, z.id);
          addUpright(sign.g, sign.ax, sign.ay);
        }
      });

      // 景物與地標：放在島上空著的地方
      scenery(propsDoc, (cfg.scenery || {})[z.id], isl, busy, names).forEach((s) => {
        props3d.push({ name: s.name, x: s.x, y: s.y, size: s.size, zone: z.id });
        if (s.node) addUpright(s.node, s.x, s.y).classList.add('scenery');
      });

      // 插圖資產槽：設定了圖片且載入成功才取代 SVG 地塊；節點與文字永遠在 SVG 上層
      const art = (cfg.art || {})[z.id];
      if (art) {
        const xs = isl.abs.map((p) => p[0]);
        const ys = isl.abs.map((p) => p[1]);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        const img = svg('image', { class: 'zone-art', href: art, x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 + D, preserveAspectRatio: 'xMidYMid meet' });
        img.addEventListener('load', () => { g.classList.add('has-art'); shadow.remove(); });
        img.addEventListener('error', () => img.remove());
        g.insertBefore(img, g.firstChild);
      }
      gIslands.appendChild(g);
    });

    // 直立物依底部 y 值排序：後面的先畫，前面的蓋住後面的
    uprights.filter((u) => !u.parentNode).sort((a, b) => parseFloat(a.dataset.ay) - parseFloat(b.dataset.ay)).forEach((u) => layers.upright.appendChild(u));

    layers.ground.append(layers.shadows, gDecor, gWalk, gIslands, layers.links);
    svgEl.append(layers.ground, layers.upright, layers.titles, layers.stamps, layers.nodes);
    if (intro && !reducedMotion()) {
      const done = () => svgEl.classList.remove('intro');
      setTimeout(done, 1700);
      stage.addEventListener('pointerdown', done, { once: true });
      window.addEventListener('keydown', done, { once: true });
    }
    measure();
    return layers;
  }

  // 景物：在島內以固定順序找空位（不碰節點、標籤、告示牌，也不超出島的邊緣）
  function scenery(propsDoc, conf, isl, busy, names) {
    const out = [];
    if (!conf) return out;
    const want = [conf.landmark ? 'l-' + conf.landmark.replace(/^l-/, '') : null, ...(conf.items || [])].filter(Boolean);
    const limit = names ? want.length : Math.min(want.length, 3);
    const P0 = isl.abs;
    const xs = P0.map((p) => p[0]);
    const ys = P0.map((p) => p[1]);
    const stepPx = names ? 12 : 8;
    const cand = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += stepPx) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += stepPx) cand.push([x, y]);
    }
    const R = rng('scenery:' + isl.zone.id + ':' + layout.key);
    cand.forEach((c) => { c.push(R()); });
    cand.sort((a, b) => a[2] - b[2]);
    const placed = [];
    for (let k = 0; k < limit; k++) {
      const big = want[k].startsWith('l-');
      const size = (big ? 58 : 34) * (names ? 1 : 0.6);
      const spot = cand.find(([x, y]) => {
        const box = { x: x - size / 2, y: y - size * 0.92, w: size, h: size * 0.95 };
        const inset = names ? 10 : 6;
        if (![[box.x - inset, y], [box.x + box.w + inset, y], [x, box.y], [box.x, y - size * 0.4], [box.x + box.w, y - size * 0.4]].every(([px, py]) => pointInPoly(px, py, P0))) return false;
        if (!pointInPoly(x, y + inset, P0)) return false;
        if (busy.some((b) => hit(box, b))) return false;
        return placed.every((p) => Math.hypot(p.x - x, p.y - y) > (size + p.size) * 0.55);
      });
      if (!spot) continue;
      placed.push({ x: spot[0], y: spot[1], size });
      out.push({ node: propsDoc ? placeProp(propsDoc, want[k], size, isl.zone.id) : null, name: want[k], size, x: spot[0], y: spot[1] });
    }
    return out;
  }

  // 空子區的告示牌：文字完全照資料檔 note。錨點是木柱底部
  function signpost(b, m, mode, zoneId) {
    const c = b.cell;
    const lineH = m.noteFont + 4;
    const bw = c.boardW;
    const bh = c.noteLines.length * lineH + 12;
    const ax = b.x + b.w / 2;
    const ay = b.y + m.cellHead + 2 + bh + 16;
    const top = -(bh + 16);
    const g = svg('g', { class: 'sign', 'data-zone': zoneId });
    g.appendChild(svg('ellipse', { class: 'sign-shadow', cx: 2, cy: 0, rx: 8, ry: 2.5 }));
    g.appendChild(svg('rect', { class: 'sign-post', x: -2, y: top + bh - 2, width: 4, height: 18, rx: 1 }));
    g.appendChild(svg('rect', { class: 'sign-board', x: -bw / 2, y: top, width: bw, height: bh, rx: 4 }));
    c.noteLines.forEach((line, i) => {
      g.appendChild(svg('text', { class: 'sign-text', x: 0, y: top + 8 + lineH * i + m.noteFont * 0.85, 'font-size': m.noteFont, text: line }));
    });
    if (mode === 'numbers') g.setAttribute('aria-hidden', 'true');
    return { g, ax, ay };
  }

  // 直立的小插畫：錨點是底部中央
  function placeProp(propsDoc, name, size, zoneId) {
    const wrap = svg('g', { class: 'prop prop-' + name, 'aria-hidden': 'true', 'data-zone': zoneId || null });
    const inner = svg('g', { transform: `translate(${f1(-size / 2)} ${f1(-size)}) scale(${(size / 40).toFixed(3)})` });
    const src = propsDoc && propsDoc.getElementById('p-' + name);
    if (src) {
      const g = document.importNode(src, true);
      g.removeAttribute('id');
      inner.appendChild(g);
    }
    wrap.appendChild(inner);
    return wrap;
  }

  // 「已逛完」章：蓋在分區標籤右側
  function setStamps(doneZones) {
    if (!layers.stamps) return;
    layers.stamps.textContent = '';
    const names = layout.mode === 'names';
    doneZones.forEach((zid) => {
      const lb = labelBoxes[zid];
      if (!lb) return;
      const r = names ? 24 : 11;
      const g = svg('g', { class: 'stamp' });
      const inner = svg('g', { transform: 'rotate(-12)' }, [
        svg('circle', { class: 'stamp-ring', r }),
        svg('circle', { class: 'stamp-ring2', r: r - 3 })
      ]);
      if (names) inner.appendChild(svg('text', { class: 'stamp-text', y: 0, dy: '0.35em', text: t('map.doneStamp') }));
      else inner.appendChild(svg('path', { class: 'stamp-check', d: 'M-5 0 L-1.5 3.5 L5 -3.5' }));
      g.append(inner, svg('title', { text: t('map.doneStamp') }));
      g.setAttribute('data-ax', f1(lb.x + lb.w + r + 4));
      g.setAttribute('data-ay', f1(lb.y + lb.h / 2));
      layers.stamps.appendChild(g);
    });
    refreshUprights();
  }

  // ---------- 直立物與文字跟著傾角移動位置（不壓扁） ----------
  function refreshUprights() {
    uprightEls = [...svgEl.querySelectorAll('[data-ax]')].map((n) => ({ n, x: parseFloat(n.dataset.ax), y: parseFloat(n.dataset.ay) }));
    placeUprights();
  }
  function placeUprights() {
    layers.ground.setAttribute('transform', tilt === 1 ? '' : `translate(0 ${f1(pivot)}) scale(1 ${tilt.toFixed(4)}) translate(0 ${f1(-pivot)})`);
    uprightEls.forEach((u) => u.n.setAttribute('transform', `translate(${f1(u.x)} ${f1(P(u.y))})`));
  }

  // ---------- 鏡頭 ----------
  function measure() {
    const r = svgEl.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
  }
  function apply() {
    svgEl.setAttribute('viewBox', `${cam.vx.toFixed(2)} ${cam.vy.toFixed(2)} ${(W / cam.k).toFixed(2)} ${(H / cam.k).toFixed(2)}`);
    if (opts.onView) opts.onView({ vx: cam.vx, vy: cam.vy, k: cam.k, W, H, tilt, pivot });
  }
  function safeRect() {
    const ins = opts.insets();
    return {
      x: ins.left, y: ins.top,
      w: Math.max(120, W - ins.left - ins.right), h: Math.max(120, H - ins.top - ins.bottom)
    };
  }
  // 地面座標的矩形換成畫面座標（套用傾角）
  const projRect = (r, tt) => ({ x: r.x, y: P(r.y, tt), w: r.w, h: r.h * tt });
  function panoRect() { return { x: 0, y: 0, w: layout.width, h: layout.height }; }
  function camFor(rect, maxK) {
    const S = safeRect();
    let k = Math.min(S.w / rect.w, S.h / rect.h);
    if (maxK) k = Math.min(k, maxK);
    return { k, vx: rect.x + rect.w / 2 - (S.x + S.w / 2) / k, vy: rect.y + rect.h / 2 - (S.y + S.h / 2) / k };
  }
  const kPano = () => camFor(panoRect()).k;

  function clamp(c) {
    const kp = kPano();
    const k = Math.min(kp * 5, Math.max(kp * 0.6, c.k));
    const cx = Math.min(layout.width, Math.max(0, c.vx + W / (2 * c.k)));
    const cy = Math.min(P(layout.height), Math.max(P(0), c.vy + H / (2 * c.k)));
    return { k, vx: cx - W / (2 * k), vy: cy - H / (2 * k) };
  }

  function moving(onOff) { stage.classList.toggle('cam-moving', onOff); }

  // 鏡頭補間。縮放幅度大時（全景⇄聚焦），補間期間不重畫 SVG：先用視野較大的那一端畫好，
  // 再用 CSS transform 平移縮放（交給 GPU 合成，iPad 上比較順），傾角也換算成垂直縮放；
  // 結束時拿掉 transform，畫面位置完全接得上。只是平移或小幅縮放時，照常逐格更新 viewBox。
  function stopTween() {
    if (!tween) return;
    cancelAnimationFrame(tween.raf);
    const now = tween.now;
    tween = null;
    camEl.style.transform = '';
    if (now) { cam = now.cam; tilt = now.tilt; placeUprights(); apply(); }
    moving(false);
  }
  function tweenTo(next, nextTilt = tilt, animate = true) {
    stopTween();
    if (!animate || reducedMotion()) {
      cam = next;
      tilt = nextTilt;
      placeUprights();
      apply();
      return;
    }
    const S = safeRect();
    const sx = S.x + S.w / 2;
    const sy = S.y + S.h / 2;
    const from = { k: cam.k, cx: cam.vx + sx / cam.k, cy: cam.vy + sy / cam.k, t: tilt };
    const to = { k: next.k, cx: next.vx + sx / next.k, cy: next.vy + sy / next.k, t: nextTilt };
    const ratio = to.k / from.k;
    const composite = ratio > 1.25 || ratio < 0.8;
    // 合成模式的底圖：視野較大（k 較小）的那一端
    if (composite && ratio < 1) { cam = next; tilt = nextTilt; placeUprights(); apply(); }
    const base = { cam: { ...cam }, tilt };
    const t0 = performance.now();
    const dur = 560;
    moving(true);
        const frame = (c, tt) => {
      if (!composite) {
        cam = c;
        if (tt !== tilt) { tilt = tt; placeUprights(); }
        apply();
        return;
      }
      const r = tt / base.tilt;
      const a = c.k / base.cam.k;
      const tx = (base.cam.vx - c.vx) * c.k;
      const ty = (pivot + (base.cam.vy - pivot) * r - c.vy) * c.k;
      camEl.style.transform = `matrix(${a.toFixed(5)}, 0, 0, ${(a * r).toFixed(5)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`;
    };
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const k = from.k * Math.pow(to.k / from.k, e);
      const cx = from.cx + (to.cx - from.cx) * e;
      const cy = from.cy + (to.cy - from.cy) * e;
      const c = { k, vx: cx - sx / k, vy: cy - sy / k };
      const tt = from.t + (to.t - from.t) * e;
      if (p < 1) {
        frame(c, tt);
        tween = { raf: requestAnimationFrame(step), now: { cam: c, tilt: tt } };
      } else {
        tween = null;
        camEl.style.transform = '';
        cam = next;
        tilt = nextTilt;
        placeUprights();
        apply();
        moving(false);
      }
    };
    // 第一格：畫面維持在出發位置（底圖若已換成目標，就用 transform 拉回出發位置）
    frame({ k: from.k, vx: from.cx - sx / from.k, vy: from.cy - sy / from.k }, from.t);
    tween = { raf: requestAnimationFrame(step), now: null };
  }

  function fitPanorama(animate = true) {
    target = { type: 'pano' };
    tweenTo(camFor(projRect(panoRect(), TILT_PANO)), TILT_PANO, animate);
  }
  function focusRect(rect, animate = true) {
    target = { type: 'rect', rect };
    tweenTo(camFor(projRect(rect, TILT_FOCUS), kPano() * 3.2), TILT_FOCUS, animate);
  }
  function zoneRect(zoneId) {
    const isl = layout.islands.find((i) => i.zone.id === zoneId);
    if (!isl) return null;
    const xs = isl.abs.map((p) => p[0]);
    const ys = isl.abs.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: x0 - 16, y: y0 - 16, w: Math.max(...xs) - x0 + 32, h: Math.max(...ys) - y0 + layout.m.depth + 32 };
  }
  // 聚焦某件作品：有子區時聚焦子區（放大一點），否則聚焦整個分區
  function rectForWork(id) {
    const p = layout.pos[id];
    if (!p) return null;
    for (const isl of layout.islands) {
      const cell = isl.cells.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
      if (cell) {
        const minW = layout.mode === 'names' ? 440 : 200;
        const minH = layout.mode === 'names' ? 260 : 150;
        const maxW = layout.mode === 'names' ? 480 : 240;
        const w = Math.min(Math.max(cell.w + 40, minW), maxW);
        const h = Math.max(cell.h + 40, minH);
        // 子區比聚焦範圍寬時，以作品本身為中心
        const cx = cell.w + 40 > maxW ? p.x : cell.x + cell.w / 2;
        return { x: cx - w / 2, y: cell.y + cell.h / 2 - h / 2, w, h };
      }
      if (pointInPoly(p.x, p.y, isl.abs)) return zoneRect(isl.zone.id);
    }
    return { x: p.x - 150, y: p.y - 100, w: 300, h: 200 };
  }
  function focusWork(id, animate = true) {
    const rect = rectForWork(id);
    if (rect) focusRect(rect, animate);
  }
  function focusZone(zoneId, animate = true) {
    const rect = zoneRect(zoneId);
    if (rect) focusRect(rect, animate);
  }
  function zoomBy(fk) {
    const S = safeRect();
    const sx = S.x + S.w / 2;
    const sy = S.y + S.h / 2;
    const wx = cam.vx + sx / cam.k;
    const wy = cam.vy + sy / cam.k;
    const k = cam.k * fk;
    target = null;
    tweenTo(clamp({ k, vx: wx - sx / k, vy: wy - sy / k }));
  }
  // 視窗大小或面板開合改變時，重新套用目前的鏡頭目標
  function refit(animate = false) {
    measure();
    if (!layout) return;
    if (!target) { cam = clamp(cam); apply(); return; }
    if (target.type === 'pano') fitPanorama(animate);
    else focusRect(target.rect, animate);
  }

  // ---------- 滑過分區（滑鼠） ----------
  const zoneOf = (el) => {
    if (!el || !el.closest) return null;
    const n = el.closest('.node');
    if (n) return n.getAttribute('data-zone');
    const z = el.closest('[data-zone]');
    return z ? z.getAttribute('data-zone') : null;
  };
  svgEl.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || pointers.size) return;
    opts.onZoneHover(zoneOf(e.target), e);
  });
  svgEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') opts.onZoneHover(null, e);
  });

  // ---------- 手勢：拖曳平移、雙指縮放、觸控板縮放 ----------
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let moved = false;
  const local = (e) => {
    const r = svgEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  svgEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (tween) stopTween();
    pointers.set(e.pointerId, local(e));
    emit('user-interact');
    if (pointers.size === 1) {
      moved = false;
      lastDragged = false;
      drag = { start: local(e), cam: { ...cam } };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: { ...cam } };
      drag = null;
    }
  });
  svgEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = pinch.cam.k * (dist / pinch.dist);
      const wx = pinch.cam.vx + pinch.mid.x / pinch.cam.k;
      const wy = pinch.cam.vy + pinch.mid.y / pinch.cam.k;
      cam = clamp({ k, vx: wx - mid.x / k, vy: wy - mid.y / k });
      target = null;
      moved = true;
      moving(true);
      apply();
    } else if (drag) {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (!moved && Math.hypot(dx, dy) > 6) {
        moved = true;
        moving(true);
        svgEl.setPointerCapture(e.pointerId);
      }
      if (moved) {
        cam = clamp({ k: drag.cam.k, vx: drag.cam.vx - dx / drag.cam.k, vy: drag.cam.vy - dy / drag.cam.k });
        target = null;
        apply();
        if (opts.onDrag) opts.onDrag(dx, dy);
      }
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      // 雙指放開一指：以剩下那一指繼續拖曳，避免跳動
      const rest = [...pointers.values()][0];
      pinch = null;
      drag = { start: rest, cam: { ...cam } };
      return;
    }
    if (pointers.size === 0) {
      lastDragged = moved;
      if (opts.onDrag) opts.onDrag(0, 0, true);
      if (!moved && e.type === 'pointerup' && !(e.target.closest && e.target.closest('.node'))) {
        // 點島上空地＝選這個分區；點水面＝回到全景
        const z = zoneOf(e.target);
        if (z) opts.onZone(z);
        else opts.onBackground();
      }
      drag = null;
      pinch = null;
      moving(false);
    }
  };
  svgEl.addEventListener('pointerup', end);
  svgEl.addEventListener('pointercancel', end);
  svgEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // 一般滾輪留給頁面捲動；觸控板雙指縮放會帶 ctrlKey
    e.preventDefault();
    const p = local(e);
    const k = cam.k * Math.exp(-e.deltaY * 0.01);
    const wx = cam.vx + p.x / cam.k;
    const wy = cam.vy + p.y / cam.k;
    cam = clamp({ k, vx: wx - p.x / k, vy: wy - p.y / k });
    target = null;
    apply();
  }, { passive: false });

  return {
    svg: svgEl, camLayer: camEl, build, fitPanorama, focusWork, focusZone, zoomBy, refit, setStamps, refreshUprights,
    wasDragged: () => lastDragged,
    get cam() { return cam; },
    get tilt() { return tilt; },
    get layout() { return layout; },
    get layers() { return layers; },
    get props3d() { return props3d; }
  };
}

