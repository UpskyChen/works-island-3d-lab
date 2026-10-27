// 組裝：讀資料 → 標題／關於我／圖例 → 地圖、面板、詳情卡、清單 → 路由、工具列、帶我逛逛、視差
// 畫面上的文字全部來自 works.json（ui 段與作品資料），這裡不寫死任何文字或網址。
// 3D 視覺實驗版：地圖本體改由 scene3d.js（Three.js）畫在 SVG 下層；載入失敗或沒有 WebGL 時自動退回 2.5D SVG。
import { el, on, reducedMotion, setStatusLegend } from './util.js';
import { setText, applyText, t } from './text.js';
import { createParallax } from './parallax.js';
import { loadData } from './data-loader.js';
import { computeLayout, pickLayoutKey } from './layout.js';
import { createMap } from './map.js';
import { drawNodes, markNodes, pulseNode } from './nodes.js';
import { drawLinks, markLinks, setLinksVisible } from './connections.js';
import { createPanel, renderListView } from './panel.js';
import { renderStatusLegend } from './detail.js';
import { createDetail } from './detail.js';
import { currentId, navigate, onRoute } from './router.js';
import { createProgress } from './progress.js';
import { createGuide, HINTS } from './guide.js';

const $ = (id) => document.getElementById(id);
const TOUR_MS = 4500;
// 和資料檔同時下載；舊瀏覽器不支援 importmap 或載入失敗時回傳 null（地圖照舊用 2.5D 版）
const scene3dModule = import('./scene3d.js').catch((err) => {
  console.warn('[3D] 3D 模組載入失敗，改用 2.5D 版地圖', err);
  return null;
});

async function start() {
  const [{ model, layoutConfig }, propsDoc, s3dModule] = await Promise.all([loadData(), loadProps(), scene3dModule]);
  setText(model.ui);
  setStatusLegend(model.statusLegend);
  applyText();
  const app = { selected: null, lastId: null, mode: 'map', linksOn: true, dimmed: null, layoutKey: null, tour: null };
  const progress = createProgress(model);
  const guide = createGuide($('guide'));

  renderHeader(model);
  renderLegend(model);
  if (window.innerWidth < 1000) $('about').open = false; // 窄螢幕先收合「關於我」，讓地圖早點出現

  const stage = $('stage');
  const s3d = s3dModule ? s3dModule.createScene3D() : null;
  stage.classList.toggle('has-3d', !!s3d);
  const panelEl = $('panel');
  const detailEl = $('detail');
  const toolbar = $('toolbar');

  // 地圖可用範圍：扣掉浮在地圖上的面板、詳情卡、工具列
  const isOverlay = (node) => node && getComputedStyle(node).position === 'absolute';
  function insets() {
    const ins = { left: 12, right: 12, top: 12, bottom: 12 };
    if (isOverlay(toolbar)) ins.bottom = Math.max(ins.bottom, toolbar.offsetHeight + 28);
    const legend = $('legend');
    if (isOverlay(legend)) ins.bottom = Math.max(ins.bottom, legend.offsetHeight + 28);
    if (isOverlay(panelEl) && !panelEl.classList.contains('is-collapsed')) ins.right = panelEl.offsetWidth + 28;
    if (detail.isSticky()) {
      const pos = getComputedStyle(detailEl).position;
      if (pos === 'absolute') ins.left = detailEl.offsetWidth + 28;
      else if (pos === 'fixed') {
        // 手機底部滑出卡：以「地圖頂端對齊視窗頂端」計算被遮住的高度（選取時會把地圖捲到這個位置）
        const overlap = stage.clientHeight - (window.innerHeight - detailEl.offsetHeight);
        ins.bottom = Math.max(ins.bottom, overlap + 12);
      }
    }
    return ins;
  }

  const map = createMap(stage, $('map'), {
    label: t('site.mapLabel', { title: model.meta.title }),
    insets,
    onBackground: () => { stopTour(); clearSelection(); },
    onZone: (zid) => selectZone(zid),
    onZoneHover: (zid, e) => hoverZone(zid, e),
    onDrag: (dx, dy, ended) => parallax.drag(dx, dy, ended),
    underlay: s3d && s3d.canvas,
    tilts: s3d && s3d.tilts,
    onView: s3d && s3d.setView
  });
  const parallax = createParallax(stage, {
    sea: s3d ? null : stage.querySelector('.sea-fx'),
    land: $('map'),
    sky: stage.querySelector('.sky-fx'),
    shadows: () => map.layers.shadows,
    scale: () => map.cam.k,
    onMove: s3d && s3d.setParallax
  });
  const detail = createDetail(detailEl, model, {
    onClose: () => clearSelection({ returnFocus: true }),
    onRelated: (id) => select(id, { source: 'detail', focusCard: true }),
    onPick: (id) => select(id, { source: 'zone' }),
    progress
  });
  const panel = createPanel(panelEl, model, {
    onSelect: (id) => select(id, { source: 'panel' }),
    onLinkSelect: (c) => select(c.from, { source: 'panel' }),
    onFilter: (visible) => { app.dimmed = visible; mark(); },
    progress,
    onReset: () => {
      progress.reset();
      panel.setProgress();
      map.setStamps(progress.doneZones());
      detail.refresh();
      guide.say(HINTS.reset);
    }
  });
  renderListView($('list-view'), model, { onLocate: (id) => locate(id) });

  function build(intro) {
    app.layoutKey = pickLayoutKey(layoutConfig, stage.clientWidth || window.innerWidth);
    const lay = computeLayout(model, layoutConfig, app.layoutKey);
    const layers = map.build(model, lay, propsDoc, { intro });
    if (s3d) s3d.build(lay, map.props3d, { intro });
    drawLinks(layers.links, model, lay);
    drawNodes(layers.nodes, model, lay, { onActivate: (id, o) => select(id, { source: 'map', focusCard: o.keyboard }), wasDragged: map.wasDragged });
    setLinksVisible(layers.links, app.linksOn);
    map.setStamps(progress.doneZones()); // 也會重新定位所有直立物（含剛畫好的節點）
    // 鍵盤聚焦節點時，左側卡預覽該分區
    layers.nodes.addEventListener('focusin', (e) => {
      const n = e.target.closest('.node');
      if (n && !app.quietFocus) detail.showZone(n.getAttribute('data-zone'));
    });
    app.layers = layers;
    mark();
  }

  function mark() {
    if (!app.layers) return;
    markNodes(app.layers.nodes, { selected: app.selected, dimmed: app.dimmed });
    markLinks(app.layers.links, app.selected);
  }

  // ---------- 滑過分區的預覽 ----------
  // 預覽卡浮在地圖左側。為了不在「卡片蓋住滑鼠 → 判定離開 → 收起 → 又顯示」之間反覆閃動：
  // 稍等一下才顯示、離開後稍等一下才收起；滑鼠移到卡片上不收；滑鼠位置會被卡片蓋住時不顯示預覽。
  let hoverTimer = null;
  function hoverZone(zid, e) {
    clearTimeout(hoverTimer);
    if (!zid) {
      if (e && e.relatedTarget && detailEl.contains(e.relatedTarget)) return;
      hoverTimer = setTimeout(() => detail.hidePreview(), 250);
      return;
    }
    if (detail.isSticky()) return;
    if (isOverlay(detailEl)) {
      const left = stage.getBoundingClientRect().left;
      const cardW = detailEl.offsetWidth || Math.min(390, stage.clientWidth - 28); // 卡片還沒出現過時量不到寬度
      if (e && e.clientX < left + 14 + cardW + 24) {
        // 這個位置會被預覽卡蓋住：已經顯示的預覽維持原樣，不切換
        return;
      }
    }
    hoverTimer = setTimeout(() => detail.showZone(zid), 140);
  }
  detailEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') clearTimeout(hoverTimer); });
  detailEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || detail.isSticky()) return;
    if (e.relatedTarget && map.svg.contains(e.relatedTarget)) return; // 回到地圖：交給地圖的滑過事件
    hoverTimer = setTimeout(() => detail.hidePreview(), 250);
  });

  // ---------- 選取與聚焦 ----------
  function select(id, { source = 'map', push = true, focusCard = false, animate = true } = {}) {
    if (!model.byId[id]) return;
    if (source !== 'tour') stopTour();
    if (app.mode !== 'map') setMode('map');
    app.selected = id;
    app.lastId = id;
    mark();
    panel.setSelected(id, { scroll: source !== 'panel' });
    detail.open(id, { focus: focusCard });
    const seen = progress.visit(id);
    if (seen.isNew) {
      panel.setProgress();
      map.setStamps(progress.doneZones());
    }
    const w = model.byId[id];
    if (seen.allDone) guide.say(HINTS.allDone);
    else if (seen.zoneDone) guide.say(HINTS.zoneDone, model.zoneById[seen.zoneDone].name);
    else if (source === 'tour') guide.say(HINTS.tour, w.status);
    else if (source !== 'init') guide.say(HINTS.work, w.status);
    if (push) {
      navigate(id, { replace: source === 'tour' || source === 'init' });
      route.sync();
    }
    if (source === 'panel' || source === 'list' || source === 'tour' || isSheet()) ensureStageVisible(isSheet());
    map.focusWork(id, animate);
    if (source !== 'init') pulseNode(app.layers.nodes, id);
    updateToolbar();
  }

  function clearSelection({ push = true, returnFocus = false } = {}) {
    const prev = app.selected;
    app.selected = null;
    mark();
    panel.setSelected(null);
    detail.close();
    if (push) { navigate(null); route.sync(); }
    map.fitPanorama();
    updateToolbar();
    if (returnFocus && prev) {
      const n = app.layers.nodes.querySelector(`.node[data-id="${CSS.escape(prev)}"]`);
      if (n) {
        app.quietFocus = true; // 關閉後把焦點還給節點，不觸發分區預覽
        n.focus({ preventScroll: true });
        app.quietFocus = false;
      }
    }
  }

  // 點島上空地：選這個分區（左側卡顯示分區摘要，鏡頭聚焦該區）
  function selectZone(zid) {
    stopTour();
    if (app.selected) {
      app.selected = null;
      mark();
      panel.setSelected(null);
      navigate(null);
      route.sync();
    }
    detail.showZone(zid, { sticky: true });
    map.focusZone(zid);
    guide.say(HINTS.zone, model.zoneById[zid].name);
    updateToolbar();
  }

  function locate(id) {
    setMode('map');
    select(id, { source: 'list' });
  }

  // 手機：從面板或清單選取時，把地圖捲回畫面內
  const isSheet = () => getComputedStyle(detailEl).position === 'fixed';
  function ensureStageVisible(alignTop = false) {
    const r = stage.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * (alignTop ? 0.02 : 0.35)) {
      window.scrollTo({ top: window.scrollY + r.top - 8, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  // ---------- 路由 ----------
  const route = onRoute((id) => {
    stopTour();
    if (id && model.byId[id]) select(id, { source: 'route', push: false });
    else if (!id && app.selected) clearSelection({ push: false });
  });

  // ---------- 模式切換 ----------
  function setMode(mode) {
    app.mode = mode;
    if (mode !== 'map') stopTour();
    $('map-mode').hidden = mode !== 'map';
    $('list-view').hidden = mode !== 'list';
    $('mode-map').setAttribute('aria-pressed', String(mode === 'map'));
    $('mode-list').setAttribute('aria-pressed', String(mode === 'list'));
    if (mode === 'map') requestAnimationFrame(() => map.refit(false));
  }
  $('mode-map').addEventListener('click', () => setMode('map'));
  $('mode-list').addEventListener('click', () => setMode('list'));

  // ---------- 工具列 ----------
  const tb = (name) => toolbar.querySelector(`[data-act="${name}"]`);
  function updateToolbar() {
    tb('zone').disabled = !app.lastId;
    tb('links').setAttribute('aria-pressed', String(app.linksOn));
    tb('tour').setAttribute('aria-pressed', String(!!app.tour));
    tb('tour').querySelector('.tb-label').textContent = t(app.tour ? 'toolbar.tourStop' : 'toolbar.tour');
    tb('tilt').setAttribute('aria-pressed', String(parallax.tiltOn));
  }
  toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act !== 'tour') stopTour();
    if (act === 'pano') clearSelection();
    else if (act === 'zone' && app.lastId) select(app.lastId, { source: 'toolbar' });
    else if (act === 'in') map.zoomBy(1.4);
    else if (act === 'out') map.zoomBy(1 / 1.4);
    else if (act === 'links') {
      app.linksOn = !app.linksOn;
      setLinksVisible(app.layers.links, app.linksOn);
    } else if (act === 'tour') (app.tour ? stopTour() : startTour());
    else if (act === 'list') setMode('list');
    else if (act === 'tilt') parallax.toggleTilt().then(updateToolbar);
    updateToolbar();
  });

  // ---------- 帶我逛逛：依編號順序每隔幾秒聚焦一件 ----------
  function tourStep() {
    const idx = app.selected ? model.byId[app.selected].num % model.works.length : 0;
    select(model.works[idx].id, { source: 'tour' });
  }
  function startTour() {
    guide.say(HINTS.tour);
    app.tour = setInterval(tourStep, TOUR_MS);
    tourStep();
    updateToolbar();
  }
  function stopTour() {
    if (!app.tour) return;
    clearInterval(app.tour);
    app.tour = null;
    guide.say(HINTS.tourStop);
    updateToolbar();
  }
  on('user-interact', stopTour);

  // ---------- 右側面板收合 ----------
  function setPanelCollapsed(c) {
    panelEl.classList.toggle('is-collapsed', c);
    $('panel-open').hidden = !c;
    panelEl.querySelector('.panel-toggle').setAttribute('aria-expanded', String(!c));
    map.refit(true);
  }
  panelEl.querySelector('.panel-toggle').addEventListener('click', () => setPanelCollapsed(true));
  $('panel-open').addEventListener('click', () => setPanelCollapsed(false));

  // ---------- 鍵盤 ----------
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (app.tour) { stopTour(); return; }
    if (app.selected || detail.isSticky()) clearSelection({ returnFocus: true });
  });
  document.addEventListener('touchstart', () => {}, { passive: true }); // 讓 iPad 觸碰時套用 :active 按壓樣式

  // 「傾斜視差」只在有動作感測的觸控裝置出現，且「減少動態效果」時不提供
  tb('tilt').hidden = !(parallax.tiltSupported && window.matchMedia('(pointer: coarse)').matches && !reducedMotion());

  // ---------- 啟動 ----------
  build(true);
  // 面板預設：寬螢幕展開，其餘收合（浮在地圖上時才有作用）
  const startCollapsed = isOverlay(panelEl) && stage.clientWidth < 1360;
  panelEl.classList.toggle('is-collapsed', startCollapsed);
  $('panel-open').hidden = !startCollapsed;
  map.refit(false);
  map.fitPanorama(false);
  const initial = currentId();
  if (initial && model.byId[initial]) select(initial, { source: 'init', push: false, animate: false });
  else guide.say(HINTS.welcome);
  updateToolbar();

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (app.mode !== 'map') return;
      const key = pickLayoutKey(layoutConfig, stage.clientWidth);
      if (key !== app.layoutKey) {
        build(false);
        map.refit(false);
        if (app.selected) map.focusWork(app.selected, false);
        else map.fitPanorama(false);
      } else {
        map.refit(false);
      }
    }, 120);
  }).observe(stage);
}

async function loadProps() {
  try {
    const r = await fetch('assets/props.svg');
    if (!r.ok) return null;
    return new DOMParser().parseFromString(await r.text(), 'image/svg+xml');
  } catch (e) {
    return null; // 插畫只是裝飾，載入失敗不影響功能
  }
}

function sentences(text) {
  return (text.match(/[^。]*。|[^。]+$/g) || []).map((s) => s.trim()).filter(Boolean);
}

function renderHeader(model) {
  const { meta, intro } = model;
  document.title = meta.title;
  $('site-owner').textContent = meta.owner;
  $('site-title').textContent = meta.title;
  const ss = sentences(intro.text);
  $('tagline').textContent = ss[0] || '';
  $('total-header').textContent = String(model.works.length);
  $('total-panel').textContent = t('panel.count', { n: model.works.length });
  $('about-heading').textContent = intro.heading || '';
  const box = $('intro');
  box.textContent = '';
  for (let i = 0; i < ss.length; i += 2) box.appendChild(el('p', { text: ss.slice(i, i + 2).join('') }));
  $('footer-text').textContent = t('site.footer', { title: meta.title, owner: meta.owner, version: meta.dataVersion });
}

function renderLegend(model) {
  const box = $('legend');
  box.textContent = '';
  const counts = model.zones.map((z) => model.worksInZone(z.id).length);
  box.appendChild(el('p', { class: 'legend-total' }, [t('legend.totalBefore'), el('strong', { id: 'total-legend', text: String(counts.reduce((a, b) => a + b, 0)) }), t('legend.totalAfter')]));
  box.appendChild(el('ul', { class: 'legend-zones' }, model.zones.map((z, i) => el('li', { class: 'zone-' + z.id }, [
    el('span', { class: 'hex-dot', 'aria-hidden': 'true' }), z.name, el('strong', { text: String(counts[i]) })
  ]))));
  const styles = new Set(model.connections.map((c) => c.style));
  const lines = [];
  if (styles.has('solid')) lines.push(el('li', null, [el('span', { class: 'line-sample solid', 'aria-hidden': 'true' }), t('legend.solid')]));
  if (styles.has('dashed')) lines.push(el('li', null, [el('span', { class: 'line-sample dashed', 'aria-hidden': 'true' }), t('legend.dashed')]));
  lines.push(el('li', null, [el('span', { class: 'line-sample bridge', 'aria-hidden': 'true' }), t('legend.walkway')]));
  box.appendChild(el('ul', { class: 'legend-lines' }, lines));
  box.appendChild(renderStatusLegend(model, t('legend.statusTitle')));
}

start().catch((err) => {
  $('load-error').hidden = false;
  console.error('作品資料載入失敗', err);
});
