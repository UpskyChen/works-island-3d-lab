// 3D 視覺實驗版的地圖本體（Three.js）：五座島的立體地塊（崖面厚度、岸線、投影）、深海與微光波紋、
// 沙洲／礁石／小浮島、木造步道、樹木與地標、一艘輕晃的小船、緩慢飄移的雲影。
// 全部用幾何基元與 Canvas 程序紋理拼出來，不下載任何模型、圖片或音效檔。
//
// 這裡只負責「畫」：文字、節點、連線、點擊都還在上層的 SVG（map.js）。
// 座標：x＝版面 x，z＝版面 y，y＝高度；島的頂面在 y=0（和 SVG 的地面同一個平面），海面在 y=-厚度。
// 鏡頭：map.js 每次更新 viewBox 都呼叫 setView()，這裡用正交相機換算成同一個畫面位置，兩層永遠對齊。
import * as THREE from 'three';
import { smoothPoints, offsetPoly, rng, walkwayGeom, pointInPoly } from './terrain.js';
import { reducedMotion } from './util.js';
import { palette, onThemeChange, RENDER, TILT } from './theme3d.js';

const PAD = 24; // 畫布四周多畫一點：視差讓整張地圖平移幾 px 時，邊緣不會露出底色
const X_AXIS = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

// 景物的固定配色（深色模式整體乘上 palette().dim）
const C = {
  trunk: '#8a5e3b', leaf: '#3f9e4c', leaf2: '#74c95a', pine: '#2c7a4b', pine2: '#3f9361', snowLeaf: '#5f8f80', snow: '#f4fbff',
  bush: '#4fae55', bush2: '#86d46a', pink: '#f28fa0', yellow: '#f6c84c', white: '#ffffff', metal: '#56616b', glow: '#ffe39a',
  stone: '#a3abb1', stone2: '#7f8a91', wall: '#fff4e2', wall2: '#e9dfcc', door: '#8a5e3b', glass: '#5fb3d6',
  roofRed: '#d2552f', flag: '#e86a4f', roofGreen: '#2f8f5a', column: '#ffffff', arcade: '#ffe7f1', dome: '#7a4fd6',
  sign: '#ffd34d', arcadeDoor: '#4a2f7a', shop: '#eef3f7', roofBlue: '#2f78b7', chimney: '#7d8a94', ice: '#e6f3fb', iceDoor: '#3d5f78',
  wood: '#c08d58', woodDark: '#86603a', hull: '#8a5a3c', hull2: '#6d4329', sail: '#fffaf0', sail2: '#f2c3a7'
};

export function createScene3D() {
  const canvas = document.createElement('canvas');
  canvas.className = 'scene3d';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' });
  } catch (e) {
    console.warn('[3D] 這個瀏覽器無法建立 WebGL，改用 2.5D 版地圖', e);
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // 島與景物不會動：陰影只在建好場景（與開場浮出）時算
  const maxDpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDpr);
  const dprSteps = [maxDpr, ...RENDER.dprSteps.filter((r) => r < maxDpr)];
  let dprLevel = 0;
  renderer.setPixelRatio(dprSteps[0]);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  scene.add(hemi, sun, sun.target);

  let world = null;
  let last = null;
  let view = null;
  let size = { w: 0, h: 0 };
  let parallax = { x: 0, y: 0 };
  let seaMat = null;
  let boat = null;
  let clouds = [];
  let intro = null;
  let visible = true;
  let raf = 0;
  let dirty = true;
  let lastDraw = 0;
  let lastTick = 0;
  let clock = 0; // 動畫時間（秒）；「減少動態效果」時停在 0
  const gov = { n: 0, sum: 0, fast: 0 };

  // ---------- 鏡頭：和 SVG 的 viewBox＋傾角對齊 ----------
  // SVG 地面座標 (x, y) 的畫面位置＝(x, pivot + (y - pivot)·tilt)；相機俯角 θ＝asin(tilt) 時，
  // 世界點 (x, h, z) 在相機上方向的座標＝h·cosθ − z·sinθ。兩者只差一個常數 pivot·(1 − tilt)，算進視窗上下界即可。
  function setView(v) {
    view = v;
    if (v.W !== size.w || v.H !== size.h) {
      size = { w: v.W, h: v.H };
      renderer.setSize(v.W + PAD * 2, v.H + PAD * 2, false);
      canvas.style.width = v.W + PAD * 2 + 'px';
      canvas.style.height = v.H + PAD * 2 + 'px';
    }
    const th = Math.asin(Math.min(0.999, Math.max(0.2, v.tilt)));
    const d = 4000;
    camera.position.set(0, d * Math.sin(th), d * Math.cos(th));
    camera.up.copy(UP);
    camera.lookAt(0, 0, 0);
    const off = v.pivot * (1 - v.tilt);
    const pad = PAD / v.k;
    camera.left = v.vx - pad;
    camera.right = v.vx + v.W / v.k + pad;
    camera.top = off - v.vy + pad;
    camera.bottom = off - v.vy - v.H / v.k - pad;
    camera.near = 1;
    camera.far = 9000;
    camera.updateProjectionMatrix();
    requestRender();
  }

  // 視差：整張地圖（畫布＋SVG）已由 parallax.js 平移；這裡讓水面的波紋再反向偏一點，做出水面在下層的感覺
  function setParallax(x, y) {
    parallax = { x, y };
    if (seaMat) requestRender();
  }

  // ---------- 建場景 ----------
  function build(lay, props, { intro: withIntro = false } = {}) {
    last = { lay, props };
    clearWorld();
    const pal = palette();
    const dim = pal.dim;
    const col = (hex) => new THREE.Color(hex).multiplyScalar(dim);
    const names = lay.mode === 'names';
    const T = lay.m.depth * RENDER.thick;
    const seaY = -T;
    world = new THREE.Group();
    scene.add(world);
    setupLights(pal, lay);

    const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const G = unitGeometries();
    const outlines = [];
    const zoneGroups = [];

    // 五座島：依中心 y 由後往前（開場浮出的順序和 2.5D 版相同）
    lay.islands.slice().sort((a, b) => a.cy - b.cy).forEach((isl) => {
      const zc = pal.zones[isl.zone.id] || pal.fallbackZone;
      const P = smoothPoints(isl.pts, { dx: isl.cx, dy: isl.cy, s: isl.s }, 8);
      outlines.push(P);
      const g = new THREE.Group();
      g.add(slab(P, T, 0, zc, dim, isl.zone.id));
      g.add(flat(offsetPoly(P, names ? 5 : 3), seaY + 0.4, col(pal.beach)));
      const m = new Merge();
      props.filter((p) => p.zone === isl.zone.id).forEach((p) => addProp(m, G, p, 0, col));
      if (m.count) g.add(m.mesh(propMat));
      zoneGroups.push(g);
      world.add(g);
    });

    // 裝飾：沙洲、礁石、小浮島（＋島上的小景物）
    const misc = new THREE.Group();
    world.add(misc);
    const decorShapes = [];
    const mm = new Merge();
    const isletTop = seaY + T * 0.5;
    lay.decor.forEach((d) => {
      if (d.type === 'sandbar') {
        const a = ((d.rot || 0) * Math.PI) / 180;
        const pts = d.pts.map(([x, y]) => [d.x + x * Math.cos(a) - y * Math.sin(a), d.y + x * Math.sin(a) + y * Math.cos(a)]);
        const P = smoothPoints(pts, {}, 4);
        decorShapes.push(P);
        misc.add(flat(P, seaY + 0.8, col(pal.beach)));
      } else if (d.type === 'reef') {
        d.rocks.forEach(([x, y, r], i) => {
          put(mm, G.dodeca, col(i % 2 ? C.stone2 : pal.rock), d.x + x, seaY + r * 0.15, d.y + y, { s: [r * 1.9, r * 1.1, r * 1.6], ry: i * 1.3 });
          decorShapes.push(circle(d.x + x, d.y + y, r * 1.2));
        });
      } else if (d.type === 'islet') {
        const P = smoothPoints(d.pts, { dx: d.x, dy: d.y }, 6);
        decorShapes.push(P);
        misc.add(slab(P, T * 0.5, isletTop, pal.islet, dim, 'islet'));
      }
    });
    props.filter((p) => p.islet).forEach((p) => addProp(mm, G, p, isletTop, col));

    // 步道：木色棧道／拱橋（只是裝飾）
    const byZone = Object.fromEntries(lay.islands.map((i) => [i.zone.id, i]));
    lay.walkways.forEach((wk) => {
      const A = byZone[wk.from];
      const B = byZone[wk.to];
      const g = walkwayGeom(A.abs, B.abs, [A.cx, A.cy], [B.cx, B.cy], { bend: wk.bend, rise: wk.rise, inset: names ? 22 : 12 });
      walkway(mm, G, g, A.abs, B.abs, names ? 12 : 7, seaY, col);
    });
    if (mm.count) misc.add(mm.mesh(propMat));

    // 海面＋水面的淺灘、投影、浪花遮罩
    const sunDir = new THREE.Vector3(...pal.sun.dir).normalize();
    const shadowOff = [(-sunDir.x / sunDir.y) * T, (-sunDir.z / sunDir.y) * T];
    world.add(seaMesh(lay, outlines, decorShapes, shadowOff, seaY, pal));

    // 小船與雲影
    boat = makeBoat(lay, G, outlines, decorShapes, seaY, names, col);
    if (boat) world.add(boat.group);
    clouds = makeClouds(lay, pal, names);
    clouds.forEach((c) => world.add(c.mesh));

    Object.values(G).forEach((g) => g.dispose());
    renderer.shadowMap.needsUpdate = true;
    intro = null;
    if (withIntro && !reducedMotion()) {
      const t0 = performance.now();
      intro = { t0, items: [...zoneGroups.map((g, i) => ({ g, delay: i * 120 })), { g: misc, delay: 560 }], drop: T * 2.4 };
      stepIntro(t0);
    }
    requestRender();
  }

  function clearWorld() {
    if (!world) return;
    world.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => {
        ['map', 'alphaMap'].forEach((k) => m[k] && m[k].dispose());
        if (m.uniforms && m.uniforms.uMask) m.uniforms.uMask.value.dispose();
        m.dispose();
      });
    });
    scene.remove(world);
    world = null;
    seaMat = null;
    boat = null;
    clouds = [];
  }

  function setupLights(pal, lay) {
    hemi.color.set(pal.hemi.sky);
    hemi.groundColor.set(pal.hemi.ground);
    hemi.intensity = pal.hemi.intensity;
    sun.color.set(pal.sun.color);
    sun.intensity = pal.sun.intensity;
    const c = new THREE.Vector3(lay.width / 2, 0, lay.height / 2);
    const dir = new THREE.Vector3(...pal.sun.dir).normalize();
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(dir, 2000);
    sun.target.updateMatrixWorld();
    const r = Math.hypot(lay.width, lay.height) / 2 + 40;
    const sc = sun.shadow.camera;
    Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 10, far: 4200 });
    sc.updateProjectionMatrix();
    const ms = RENDER.shadowMap[lay.mode] || 1024;
    if (sun.shadow.mapSize.x !== ms) {
      sun.shadow.mapSize.set(ms, ms);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.8;
    sun.shadow.radius = 2.5;
  }

  // ---------- 地塊：擠出的立體島（頂面紋理＋崖面分層紋理，頂緣圓角） ----------
  function slab(P, T, topY, zc, dim, key) {
    const shape = new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, -y)));
    const bevel = Math.min(4, T * 0.16);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: T, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 1
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, topY - (T + bevel), 0);
    // 自己算 UV：頂面依世界座標鋪紋理；崖面的 v 是高度（0＝水面，1＝頂緣）
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const lid = geo.groups.find((g) => g.materialIndex === 0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const isLid = i >= lid.start && i < lid.start + lid.count;
      if (isLid) uv.setXY(i, x / 140, z / 140);
      else uv.setXY(i, (x + z) / 70, Math.min(1, Math.max(0, (y - (topY - T)) / T)));
    }
    const lip = Math.min(0.5, (bevel * 1.5) / T);
    const top = new THREE.MeshLambertMaterial({ map: topTexture(zc.top, key) });
    const side = new THREE.MeshLambertMaterial({ map: cliffTexture(zc.top, zc.cliff, lip, key) });
    top.color.setScalar(dim);
    side.color.setScalar(dim);
    const mesh = new THREE.Mesh(geo, [top, side]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function flat(P, y, color) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z))), 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- 海面：深藍漸層、近岸淺灘、島的投影、岸邊浪花、微光波紋 ----------
  function seaMesh(lay, outlines, decorShapes, shadowOff, seaY, pal) {
    const margin = 280;
    const rect = { x: -margin, z: -margin, w: lay.width + margin * 2, h: lay.height + margin * 2 };
    const mask = seaMaskTexture(rect, outlines, decorShapes, shadowOff, lay.mode === 'names');
    const span = Math.max(lay.width, lay.height) * 10;
    const geo = new THREE.PlaneGeometry(span, span);
    geo.rotateX(-Math.PI / 2);
    geo.translate(lay.width / 2, seaY, lay.height / 2);
    seaMat = new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: mask },
        uRect: { value: new THREE.Vector4(rect.x, rect.z, rect.w, rect.h) },
        uCenter: { value: new THREE.Vector2(lay.width / 2, lay.height / 2) },
        uRadius: { value: Math.hypot(lay.width, lay.height) / 2 },
        uDeep: { value: new THREE.Color(pal.sea.deep) },
        uShallow: { value: new THREE.Color(pal.sea.shallow) },
        uFoam: { value: new THREE.Color(pal.sea.foam) },
        uGlint: { value: pal.sea.glint },
        uShade: { value: pal.sea.shadow },
        uTime: { value: 0 },
        uShift: { value: new THREE.Vector2() }
      },
      vertexShader: `
        varying vec2 vXZ;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D uMask;
        uniform vec4 uRect;
        uniform vec2 uCenter;
        uniform float uRadius;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform float uGlint;
        uniform float uShade;
        uniform float uTime;
        uniform vec2 uShift;
        varying vec2 vXZ;
        void main() {
          vec2 uv = (vXZ - uRect.xy) / uRect.zw;
          vec3 m = vec3(0.0);
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) m = texture2D(uMask, uv).rgb;
          float far = smoothstep(0.3, 1.35, length((vXZ - uCenter) / uRadius));
          float shallow = clamp(m.r * 1.1 + (1.0 - far) * 0.3, 0.0, 1.0);
          vec3 col = mix(uDeep, uShallow, shallow);
          vec2 p = vXZ + uShift;
          // 微光：兩組慢慢流動的正弦相乘，只留最亮的小點；再加一層很淡的大浪起伏
          float w1 = sin(p.x * 0.07 + uTime * 0.8 + sin(p.y * 0.05 + uTime * 0.4) * 1.8);
          float w2 = sin(p.y * 0.1 - uTime * 0.6 + sin(p.x * 0.045 - uTime * 0.3) * 1.5);
          col += smoothstep(0.88, 1.0, w1 * w2) * uGlint;
          col *= 0.95 + 0.07 * sin(p.x * 0.011 + p.y * 0.017 + uTime * 0.25);
          float foam = m.b * (0.78 + 0.22 * sin(uTime * 1.3 + (vXZ.x + vXZ.y) * 0.05));
          col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);
          col *= 1.0 - m.g * uShade;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(geo, seaMat);
    mesh.renderOrder = -1;
    return mesh;
  }

  // 一張低解析度的遮罩：R＝近岸淺灘（模糊的島形）、G＝島的投影、B＝岸邊浪花。
  // 用 shadowBlur 做模糊（舊版 iPad Safari 也支援），本體畫在畫布外、只留下陰影
  function seaMaskTexture(rect, outlines, decorShapes, shadowOff, names) {
    const sc = Math.min(1, 1024 / Math.max(rect.w, rect.h));
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(rect.w * sc);
    cv.height = Math.ceil(rect.h * sc);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    const OFF = cv.width + 400;
    const path = (P, dx = 0, dz = 0) => {
      ctx.beginPath();
      P.forEach(([x, z], i) => ctx[i ? 'lineTo' : 'moveTo']((x + dx - rect.x) * sc - OFF, (z + dz - rect.z) * sc));
      ctx.closePath();
    };
    const glow = (P, color, blur, { stroke = 0, dx = 0, dz = 0 } = {}) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * sc;
      ctx.shadowOffsetX = OFF;
      path(P, dx, dz);
      if (stroke) {
        ctx.lineWidth = stroke * sc;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    };
    outlines.forEach((P) => {
      glow(P, 'rgb(150,0,0)', 120);
      glow(P, 'rgb(170,0,0)', 34);
      glow(P, 'rgb(0,190,0)', 16, { dx: shadowOff[0], dz: shadowOff[1] });
      glow(P, 'rgb(0,0,255)', names ? 7 : 5, { stroke: names ? 6 : 4 });
    });
    decorShapes.forEach((P) => {
      glow(P, 'rgb(110,0,0)', 26);
      glow(P, 'rgb(0,0,200)', 5, { stroke: names ? 4 : 3 });
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // ---------- 程序紋理 ----------
  function topTexture(hex, key) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 128, 128);
    const R = rng('top:' + key);
    const base = new THREE.Color(hex);
    for (let i = 0; i < 900; i++) {
      const c = base.clone().offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.08, (R() - 0.5) * 0.12);
      ctx.fillStyle = '#' + c.getHexString();
      ctx.globalAlpha = 0.35 + R() * 0.4;
      const x = R() * 128;
      const y = R() * 128;
      const r = 1 + R() * 2.6;
      // 邊界附近畫兩次，接縫處才連續
      for (const [ox, oy] of [[0, 0], [x < 4 ? 128 : x > 124 ? -128 : 0, 0], [0, y < 4 ? 128 : y > 124 ? -128 : 0]]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.7, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    return canvasTex(cv, true);
  }

  function cliffTexture(topHex, cliffHex, lip, key) {
    const w = 64;
    const h = 128;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    const cliff = new THREE.Color(cliffHex);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#' + cliff.clone().offsetHSL(0, 0, 0.06).getHexString());
    grad.addColorStop(0.75, '#' + cliff.getHexString());
    grad.addColorStop(1, '#' + cliff.clone().offsetHSL(0, -0.05, -0.12).getHexString());
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const R = rng('cliff:' + key);
    // 岩層：幾條深淺不同、微微起伏的橫紋
    for (let b = 0; b < 5; b++) {
      const y0 = h * (lip + 0.08 + (b / 5) * (0.8 - lip)) + R() * 6;
      ctx.fillStyle = '#' + cliff.clone().offsetHSL(0, 0, (R() - 0.6) * 0.12).getHexString();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 2 + b) * 1.5);
      for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, y0 + 3 + R() * 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 頂緣：草皮（頂面色，稍暗）往下垂一點點
    const lipC = new THREE.Color(topHex).offsetHSL(0, 0, -0.04);
    ctx.fillStyle = '#' + lipC.getHexString();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, h * lip + Math.sin(x * 0.7) * 1.2 + R() * 2.5);
    ctx.lineTo(w, 0);
    ctx.fill();
    // 水面線：濕的深色帶
    ctx.fillStyle = 'rgba(0, 20, 40, .22)';
    ctx.fillRect(0, h * 0.93, w, h * 0.07);
    const tex = canvasTex(cv, false);
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function canvasTex(cv, repeatBoth) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = repeatBoth ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.anisotropy = 2;
    return tex;
  }

  // ---------- 步道 ----------
  function walkway(m, G, g, A, B, width, seaY, col) {
    const lift = 1.25;
    const pts = g.ground.map(([x, z], i) => new THREE.Vector3(x, 0.8 + (z - g.deck[i][1]) * lift, z));
    const wood = col(C.wood);
    const woodDark = col(C.woodDark);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dir = b.clone().sub(a);
      const len = dir.length();
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(X_AXIS, dir);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      put(m, G.box, i % 2 ? wood : wood.clone().multiplyScalar(0.92), mid.x, mid.y, mid.z, { s: [len * 0.86, 1.4, width], q });
      for (const sgn of [-1, 1]) {
        const r = mid.clone().addScaledVector(side, (sgn * width) / 2).add(new THREE.Vector3(0, 2.6, 0));
        put(m, G.box, woodDark, r.x, r.y, r.z, { s: [len, 0.9, 0.9], q });
      }
    }
    // 欄杆柱與橋墩：橋墩從橋面垂到水面（在島上的部分不用）
    pts.forEach((p, i) => {
      if (i % 2) return;
      const dir = (pts[i + 1] || p).clone().sub(pts[i - 1] || p).normalize();
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const overWater = !pointInPoly(p.x, p.z, A) && !pointInPoly(p.x, p.z, B);
      for (const sgn of [-1, 1]) {
        const r = p.clone().addScaledVector(side, (sgn * width) / 2);
        put(m, G.box, woodDark, r.x, r.y + 1.4, r.z, { s: [0.9, 2.8, 0.9] });
        if (overWater && i % 4 === 0) {
          const hgt = r.y - seaY + 1;
          put(m, G.cyl, woodDark, r.x, seaY + hgt / 2 - 1, r.z, { s: [1.6, hgt, 1.6] });
        }
      }
    });
  }

  // ---------- 景物與地標（幾何基元拼裝，全部併成一個網格） ----------
  function unitGeometries() {
    const roof = new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
    roof.rotateZ(Math.PI / 2);
    roof.rotateX(-Math.PI / 2);
    return {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
      cone: new THREE.ConeGeometry(0.5, 1, 7),
      ico: new THREE.IcosahedronGeometry(0.5, 0),
      ico1: new THREE.IcosahedronGeometry(0.5, 1),
      dodeca: new THREE.DodecahedronGeometry(0.5, 0),
      sphere: new THREE.SphereGeometry(0.5, 10, 7),
      dome: new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      roof
    };
  }

  function addProp(m, G, p, baseY, col) {
    const R = rng('prop:' + p.name + ':' + Math.round(p.x) + ':' + Math.round(p.y));
    const big = p.name.startsWith('l-');
    const s = p.size * (big ? 1.45 : 1.25); // 立體景物比 2.5D 的貼圖略大，才讀得出形狀
    const yaw = big ? (R() - 0.5) * 0.3 : R() * Math.PI * 2;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(p.x, baseY, p.y), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s, s, s));
    const P = (geo, hex, x, y, z, sx, sy = sx, sz = sx, ry = 0) => {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz));
      m.add(geo, base.clone().multiply(local), col(hex));
    };
    switch (p.name) {
      case 'tree':
        P(G.cyl, C.trunk, 0, 0.2, 0, 0.09, 0.4, 0.09);
        P(G.ico, C.leaf, 0, 0.55, 0, 0.58);
        P(G.ico, C.leaf2, 0.07, 0.8, -0.03, 0.38);
        break;
      case 'pine':
        P(G.cyl, C.trunk, 0, 0.12, 0, 0.08, 0.24, 0.08);
        P(G.cone, C.pine, 0, 0.42, 0, 0.56, 0.5, 0.56);
        P(G.cone, C.pine2, 0, 0.72, 0, 0.4, 0.42, 0.4);
        break;
      case 'snowpine':
        P(G.cyl, C.trunk, 0, 0.12, 0, 0.08, 0.24, 0.08);
        P(G.cone, C.snowLeaf, 0, 0.42, 0, 0.56, 0.5, 0.56);
        P(G.cone, C.snow, 0, 0.72, 0, 0.4, 0.42, 0.4);
        break;
      case 'bush':
        P(G.ico1, C.bush, 0, 0.16, 0, 0.5, 0.34, 0.5);
        P(G.ico, C.bush2, 0.14, 0.22, 0.08, 0.26);
        break;
      case 'flower':
        P(G.ico, C.bush, 0, 0.06, 0, 0.36, 0.14, 0.36);
        P(G.sphere, C.pink, -0.09, 0.16, 0.03, 0.11);
        P(G.sphere, C.yellow, 0.08, 0.17, -0.04, 0.11);
        P(G.sphere, C.white, 0.02, 0.15, 0.1, 0.1);
        break;
      case 'lamp':
        P(G.cyl, C.metal, 0, 0.36, 0, 0.035, 0.72, 0.035);
        P(G.sphere, C.glow, 0, 0.74, 0, 0.13);
        P(G.cone, C.metal, 0, 0.82, 0, 0.16, 0.07, 0.16);
        break;
      case 'bench':
        P(G.box, '#c48d58', 0, 0.17, 0, 0.5, 0.05, 0.17);
        P(G.box, '#c48d58', 0, 0.3, -0.07, 0.5, 0.17, 0.04);
        P(G.box, '#9c6a3d', -0.2, 0.08, 0, 0.04, 0.16, 0.15);
        P(G.box, '#9c6a3d', 0.2, 0.08, 0, 0.04, 0.16, 0.15);
        break;
      case 'rock':
        P(G.dodeca, C.stone, 0, 0.1, 0, 0.44, 0.3, 0.38);
        P(G.dodeca, C.stone2, 0.2, 0.05, 0.1, 0.2);
        break;
      case 'l-school':
        P(G.box, C.wall, 0, 0.2, 0, 0.9, 0.4, 0.42);
        P(G.roof, C.roofRed, 0, 0.475, 0, 0.96, 0.3, 0.5);
        P(G.box, C.wall, 0, 0.42, 0.04, 0.22, 0.84, 0.24);
        P(G.cone, C.roofRed, 0, 0.94, 0.04, 0.24, 0.2, 0.24);
        P(G.box, C.door, 0, 0.1, 0.166, 0.1, 0.2, 0.01);
        [-0.36, -0.22, 0.22, 0.36].forEach((x) => P(G.box, C.glass, x, 0.24, 0.212, 0.08, 0.1, 0.01));
        P(G.cyl, C.metal, 0.4, 0.62, -0.1, 0.02, 0.5, 0.02);
        P(G.box, C.flag, 0.48, 0.8, -0.1, 0.16, 0.1, 0.01);
        break;
      case 'l-library':
        P(G.box, C.wall2, 0, 0.03, 0, 0.88, 0.06, 0.52);
        P(G.box, C.wall, 0, 0.2, -0.05, 0.76, 0.3, 0.34);
        [-0.3, -0.1, 0.1, 0.3].forEach((x) => P(G.cyl, C.column, x, 0.2, 0.18, 0.07, 0.3, 0.07));
        P(G.roof, C.roofGreen, 0, 0.415, 0.02, 0.88, 0.24, 0.52);
        P(G.box, C.door, 0, 0.12, 0.125, 0.12, 0.18, 0.01);
        break;
      case 'l-arcade':
        P(G.box, C.arcade, 0, 0.18, 0, 0.74, 0.36, 0.44);
        P(G.dome, C.dome, 0, 0.36, 0, 0.52, 0.5, 0.42);
        P(G.box, C.sign, 0, 0.3, 0.225, 0.62, 0.1, 0.02);
        P(G.box, C.arcadeDoor, 0, 0.11, 0.222, 0.16, 0.22, 0.01);
        P(G.ico, C.sign, 0, 0.66, 0, 0.12);
        break;
      case 'l-workshop':
        P(G.box, C.shop, 0, 0.17, 0, 0.84, 0.34, 0.46);
        [-0.28, 0, 0.28].forEach((x) => P(G.roof, C.roofBlue, x, 0.4, 0, 0.46, 0.22, 0.28, Math.PI / 2));
        P(G.cyl, C.chimney, 0.32, 0.52, -0.12, 0.08, 0.32, 0.08);
        P(G.box, C.roofBlue, 0, 0.12, 0.232, 0.24, 0.24, 0.01);
        break;
      case 'l-igloo':
        P(G.dome, C.snow, 0, 0, 0, 0.72, 0.62, 0.72);
        P(G.box, C.ice, 0, 0.08, 0.32, 0.22, 0.16, 0.2);
        P(G.box, C.iceDoor, 0, 0.07, 0.421, 0.12, 0.12, 0.01);
        break;
      default:
        P(G.ico1, C.bush, 0, 0.16, 0, 0.5, 0.34, 0.5);
    }
  }

  // ---------- 小船：在開闊的水道上來回慢慢航行 ----------
  function makeBoat(lay, G, outlines, decorShapes, seaY, names, col) {
    const clear = names ? 34 : 22;
    const zones = outlines.map((P) => offsetPoly(P, clear));
    const decor = decorShapes.map((P) => offsetPoly(P, clear * 0.6));
    const free = (x, z) => !zones.some((P) => pointInPoly(x, z, P)) && !decor.some((P) => pointInPoly(x, z, P));
    let best = null;
    const step = 8;
    for (let z = lay.height * 0.12; z < lay.height * 0.94; z += 12) {
      let run = null;
      for (let x = 30; x <= lay.width - 30; x += step) {
        if (free(x, z)) {
          if (!run) run = { x0: x, x1: x, z };
          run.x1 = x;
        } else run = null;
        if (run) {
          const score = (run.x1 - run.x0) * (1 + (0.25 * z) / lay.height);
          if (!best || score > best.score) best = { ...run, score };
        }
      }
    }
    if (!best || best.x1 - best.x0 < 80) return null;
    const L = names ? 34 : 20;
    const m = new Merge();
    const at = (x, y, z, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    m.add(G.cyl, at(0, 0.12, 0, 1, 0.24, 0.36), col(C.hull));
    m.add(G.box, at(0, 0.25, 0, 0.9, 0.04, 0.3), col(C.hull2));
    m.add(G.cyl, at(0.02, 0.62, 0, 0.025, 0.8, 0.025), col(C.hull2));
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute([0.05, 0.28, 0, 0.42, 0.28, 0, 0.05, 0.98, 0, 0.05, 0.28, 0, 0.05, 0.98, 0, 0.42, 0.28, 0], 3));
    m.add(sail, at(0, 0, 0, 1, 1, 1), col(C.sail));
    const sail2 = new THREE.BufferGeometry();
    sail2.setAttribute('position', new THREE.Float32BufferAttribute([-0.01, 0.34, 0, -0.01, 0.84, 0, -0.3, 0.34, 0, -0.01, 0.34, 0, -0.3, 0.34, 0, -0.01, 0.84, 0], 3));
    m.add(sail2, at(0, 0, 0, 1, 1, 1), col(C.sail2));
    sail.dispose();
    sail2.dispose();
    const mesh = m.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.scale.setScalar(L);
    const group = new THREE.Group();
    group.add(mesh);
    const b = { group, x0: best.x0 + L, x1: best.x1 - L, z: best.z, y: seaY, yaw: 0, phase: Math.PI * 0.35 };
    placeBoat(b, 0, 0);
    return b;
  }

  function placeBoat(b, t, dt) {
    const len = Math.max(1, b.x1 - b.x0);
    b.phase += dt * (Math.PI * 6) / len; // 平均約 6 單位／秒
    const u = 0.5 - 0.5 * Math.cos(b.phase);
    const heading = Math.sin(b.phase) >= 0 ? 0 : Math.PI;
    if (dt === 0) b.yaw = heading;
    else b.yaw += (heading - b.yaw) * Math.min(1, dt * 1.2);
    b.group.position.set(b.x0 + len * u, b.y + 0.4 * Math.sin(t * 1.7), b.z + 4 * Math.sin(b.phase * 0.5));
    b.group.rotation.set(0.03 * Math.sin(t * 1.1), b.yaw, 0.07 * Math.sin(t * 1.4));
  }

  // ---------- 雲影：幾片很淡的影子慢慢飄過整片海與島 ----------
  function makeClouds(lay, pal, names) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = canvasTex(cv, false);
    const R = rng('clouds:' + lay.key);
    const k = names ? 1 : 0.6;
    return [0.2, 0.55, 0.85].map((fz, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: pal.cloudShadow.color, map: i ? tex.clone() : tex, transparent: true, opacity: pal.cloudShadow.opacity, depthTest: false, depthWrite: false });
      const w = (360 - i * 60) * k;
      const geo = new THREE.PlaneGeometry(w, w * 0.55);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 10;
      mesh.position.set(R() * lay.width, 0.5, lay.height * fz);
      return { mesh, w, speed: (5 + R() * 3) * k, min: -w, max: lay.width + w };
    });
  }

  // ---------- 開場：地塊依序從海面浮上來（和 2.5D 版同一套節奏） ----------
  function stepIntro(now) {
    if (!intro) return false;
    let done = true;
    intro.items.forEach(({ g, delay }) => {
      const p = Math.min(1, Math.max(0, (now - intro.t0 - delay) / 700));
      if (p < 1) done = false;
      const c1 = 1.4;
      const e = p === 0 ? 0 : 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); // easeOutBack
      g.position.y = -intro.drop * (1 - e);
      g.visible = p > 0;
    });
    renderer.shadowMap.needsUpdate = true;
    if (done) intro = null;
    return true;
  }

  // 開場動畫跑不了（畫面不在視窗內、分頁在背景、切換成「減少動態效果」）時直接收尾：
  // 島一律回到定位、顯示出來，不能停在海面下
  function finishIntro() {
    if (!intro) return;
    intro.items.forEach(({ g }) => { g.position.y = 0; g.visible = true; });
    intro = null;
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  // ---------- 繪製迴圈：鏡頭在動才 60 fps；平常 30 fps；看不到畫面、或「減少動態效果」時不跑 ----------
  function animating() {
    return visible && !document.hidden && !reducedMotion();
  }
  function requestRender() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (!view || !world) return;
    const dt = lastTick ? Math.min(0.1, (now - lastTick) / 1000) : 0;
    if (lastTick && now - lastTick < 250) governor(now - lastTick);
    lastTick = now;
    const moving = animating();
    if (moving) {
      clock += dt;
      if (boat) placeBoat(boat, clock, dt);
      clouds.forEach((c) => {
        c.mesh.position.x += c.speed * dt;
        if (c.mesh.position.x > c.max) c.mesh.position.x = c.min;
      });
    }
    if (!moving) finishIntro();
    const introOn = moving && stepIntro(now);
    if (dirty || introOn || (moving && now - lastDraw >= 1000 / RENDER.idleFps - 2)) draw(now);
    if (moving || introOn) raf = requestAnimationFrame(tick);
    else lastTick = 0;
  }
  function draw(now) {
    dirty = false;
    lastDraw = now;
    if (seaMat) {
      seaMat.uniforms.uTime.value = clock;
      const k = view.k || 1;
      seaMat.uniforms.uShift.value.set((12 * parallax.x) / k, (7 * parallax.y) / (k * view.tilt));
    }
    renderer.render(scene, camera);
  }
  // 自適應降解析：幀間隔持續偏高就降一階解析度；持續很順才升回一階
  function governor(ms) {
    gov.n++;
    gov.sum += ms;
    if (gov.n < 60) return;
    const avg = gov.sum / gov.n;
    gov.n = 0;
    gov.sum = 0;
    if (avg > RENDER.slowMs && dprLevel < dprSteps.length - 1) {
      dprLevel++;
      gov.fast = 0;
    } else if (avg < RENDER.fastMs && dprLevel > 0 && ++gov.fast >= 3) {
      dprLevel--;
      gov.fast = 0;
    } else return;
    renderer.setPixelRatio(dprSteps[dprLevel]);
    renderer.setSize(size.w + PAD * 2, size.h + PAD * 2, false);
    dirty = true;
  }

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) requestRender();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', () => { finishIntro(); requestRender(); });
  onThemeChange(() => { if (last) build(last.lay, last.props); });
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => { if (last) build(last.lay, last.props); });

  return {
    canvas, build, setView, setParallax, tilts: TILT,
    get pixelRatio() { return dprSteps[dprLevel]; }
  };
}

// 把很多小幾何併成一個網格（頂點色），景物再多也只要一次繪製
class Merge {
  constructor() {
    this.parts = [];
    this.count = 0;
  }
  add(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    this.parts.push([g, color]);
    this.count += g.attributes.position.count;
  }
  mesh(material) {
    const pos = new Float32Array(this.count * 3);
    const colr = new Float32Array(this.count * 3);
    let o = 0;
    this.parts.forEach(([g, c]) => {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      for (let i = 0; i < n; i++) {
        colr[(o + i) * 3] = c.r;
        colr[(o + i) * 3 + 1] = c.g;
        colr[(o + i) * 3 + 2] = c.b;
      }
      o += n;
      g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.computeVertexNormals(); // 沒有共用頂點＝每個面各自的法線，低多邊形的玩具質感
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function put(m, geo, color, x, y, z, { s = [1, 1, 1], q = null, ry = 0 } = {}) {
  const quat = q || new THREE.Quaternion().setFromAxisAngle(UP, ry);
  m.add(geo, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(...s)), color);
}

function circle(x, y, r, n = 10) {
  return Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * r, y + Math.sin((i / n) * Math.PI * 2) * r]);
}
