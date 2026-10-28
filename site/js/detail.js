// 詳情卡：預覽圖＋問題 → 做法 → 成果＋狀態標籤＋說明／凍結原因＋連結（內容全部來自資料檔）
import { el, statusKind, statusIcon, statusEntry, statusKinds } from './util.js';
import { t } from './text.js';

export function renderCard(w, model, { inList = false, onRelated } = {}) {
  const zone = model.zoneById[w.zone];
  const card = el('article', { class: 'card zone-' + w.zone, 'data-card': w.id });
  const meta = [zone ? zone.name : w.zone];
  if (w.subzone) meta.push(w.subzone);

  if (!inList) {
    card.appendChild(el('p', { class: 'card-kicker' }, [
      el('span', { class: 'num-badge zone-' + w.zone, text: String(w.num) }), meta.join('・')
    ]));
    card.appendChild(el('h2', { class: 'card-title', id: 'detail-title', tabindex: '-1', text: w.name }));
  }
  // 預覽圖（資料檔的 preview，沒有就不顯示）：打開卡片時才下載；載入失敗就整張拿掉，不留破圖
  if (w.preview) {
    card.appendChild(el('img', {
      class: 'card-preview', src: w.preview, alt: w.name, loading: 'lazy', decoding: 'async',
      onerror: (e) => e.target.remove()
    }));
  }
  if (w.audience) card.appendChild(el('p', { class: 'card-meta', text: (inList ? meta.join('・') + '・' : '') + t('detail.audience') + w.audience }));

  const kind = statusKind(w);
  const badges = el('p', { class: 'badges' }, el('span', { class: 'status st-' + kind }, [statusIcon(kind), w.status]));
  if (w.relationLabel) badges.appendChild(el('span', { class: 'rel-badge', text: w.relationLabel }));
  card.appendChild(badges);
  const v = w.verification;
  if (v) card.appendChild(el('p', { class: 'verify' }, [el('strong', { text: t('detail.verification') }), t('detail.verificationText', v)]));

  const steps = [[t('detail.problem'), w.problem], [t('detail.approach'), w.approach], [t('detail.result'), w.result]].filter((s) => s[1]);
  if (steps.length) {
    card.appendChild(el('ol', { class: 'pra' }, steps.map(([k, v]) => el('li', null, [el('span', { class: 'pra-k', text: k }), el('span', { class: 'pra-v', text: v })]))));
  }
  if (w.displayNote) card.appendChild(el('p', { class: 'note' }, [el('strong', { text: t('detail.note') }), w.displayNote]));
  if (w.freezeReason) card.appendChild(el('p', { class: 'note freeze' }, [el('strong', { text: t('detail.freeze') }), w.freezeReason]));

  if (w.subzoneItems) {
    // 子頁一律連回母站首頁（資料檔第一個連結），不猜子頁網址
    const home = w.links && w.links[0] ? w.links[0].url : null;
    const order = (zone && zone.subzones) || Object.keys(w.subzoneItems);
    let total = 0;
    const groups = el('div', { class: 'subzones' });
    order.forEach((name) => {
      const items = w.subzoneItems[name];
      if (!items) return;
      total += items.length;
      groups.appendChild(el('div', { class: 'subzone' }, [
        el('h3', { text: t('detail.subzoneItem', { name, n: items.length }) }),
        el('ul', null, items.map((it) => el('li', null, home ? el('a', { href: home, target: '_blank', rel: 'noopener' }, it) : it)))
      ]));
    });
    card.appendChild(el('h3', { class: 'subzones-title', text: t('detail.subzonesTitle', { n: total }) }));
    card.appendChild(groups);
    if (w.subzoneNote) card.appendChild(el('p', { class: 'note' }, w.subzoneNote));
  }

  const rel = model.connections.filter((c) => c.from === w.id || c.to === w.id);
  if (rel.length) {
    card.appendChild(el('ul', { class: 'relations' }, rel.map((c) => {
      const other = model.byId[c.from === w.id ? c.to : c.from];
      return el('li', { class: c.style === 'dashed' ? 'dashed' : 'solid' }, [
        el('span', { class: 'rel-line', 'aria-hidden': 'true' }),
        el('span', null, [
          t('detail.relation'),
          onRelated ? el('button', { type: 'button', class: 'link-btn', onclick: () => onRelated(other.id) }, other.name) : other.name,
          '｜' + c.label
        ])
      ]);
    })));
  }

  if (w.tags && w.tags.length) {
    card.appendChild(el('p', { class: 'tags' }, w.tags.map((t) => el('span', { class: 'tag', text: t }))));
  }
  if (w.links && w.links.length) {
    card.appendChild(el('p', { class: 'links' }, w.links.map((l) => el('a', { class: 'btn', href: l.url, target: '_blank', rel: 'noopener' }, l.label))));
  }
  return card;
}

// 左側「目前選擇」卡：滑過／聚焦分區時顯示分區摘要（預覽），點作品時顯示作品詳情。
// 分區摘要只用資料檔已有的文字：區名、件數、作品名稱與狀態、zone.note、空子區的 note。
export function renderZoneCard(zone, model, { progress, onPick }) {
  const works = model.worksInZone(zone.id);
  const card = el('article', { class: 'card zone-card zone-' + zone.id, 'data-zone-card': zone.id });
  card.appendChild(el('p', { class: 'card-kicker' }, [el('span', { class: 'hex-dot', 'aria-hidden': 'true' }), t('detail.zoneKicker')]));
  const head = el('h2', { class: 'card-title', id: 'detail-title', tabindex: '-1' }, [zone.name, el('span', { class: 'zc-count', text: t('detail.zoneCount', { n: works.length }) })]);
  card.appendChild(head);
  if (progress && progress.zoneDone(zone.id)) card.appendChild(el('p', { class: 'badges' }, el('span', { class: 'done-chip', text: t('detail.done') })));
  if (zone.note) card.appendChild(el('p', { class: 'note', text: zone.note }));

  const item = (w) => el('li', null, el('button', { type: 'button', class: 'zc-item' + (progress && progress.has(w.id) ? ' is-visited' : ''), onclick: () => onPick(w.id) }, [
    el('span', { class: 'num-badge zone-' + w.zone, text: String(w.num) }),
    el('span', { class: 'zc-name', text: w.name }),
    el('span', { class: 'status st-' + statusKind(w) }, [statusIcon(statusKind(w)), w.status]),
    progress && progress.has(w.id) ? el('span', { class: 'seen', text: t('detail.seen') }) : null
  ]));

  const usesCells = works.length && works.every((w) => w.subzone);
  if (usesCells) {
    const names = (zone.subzones || []).slice();
    works.forEach((w) => { if (!names.includes(w.subzone)) names.push(w.subzone); });
    const empties = Object.fromEntries((zone.emptySubzones || []).map((e) => [e.name, e.note]));
    names.forEach((name) => {
      const list = works.filter((w) => w.subzone === name);
      card.appendChild(el('h3', { class: 'zc-sub', text: t('list.subTitle', { name, n: list.length }) }));
      if (list.length) card.appendChild(el('ul', { class: 'zc-list' }, list.map(item)));
      else card.appendChild(el('p', { class: 'empty-sub', text: empties[name] || '' }));
    });
  } else {
    card.appendChild(el('ul', { class: 'zc-list' }, works.map(item)));
  }
  return card;
}

export function createDetail(root, model, { onClose, onRelated, onPick, progress }) {
  const body = root.querySelector('.detail-body');
  root.querySelector('.detail-close').addEventListener('click', () => onClose());
  let cur = null; // { kind: 'work' | 'zone', id, sticky }

  function show(node, next, focus) {
    cur = next;
    body.textContent = '';
    body.appendChild(node);
    body.scrollTop = 0;
    root.hidden = false;
    root.classList.toggle('is-preview', !next.sticky);
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (focus) setTimeout(() => { const t = body.querySelector('#detail-title'); if (t) t.focus({ preventScroll: true }); }, 30);
  }

  return {
    open(id, { focus = false } = {}) {
      const w = model.byId[id];
      if (!w) return;
      root.setAttribute('aria-label', w.name);
      show(renderCard(w, model, { onRelated }), { kind: 'work', id, sticky: true }, focus);
    },
    // sticky=false 是滑鼠滑過的預覽：已有固定內容時不覆蓋
    showZone(zoneId, { sticky = false, focus = false } = {}) {
      const z = model.zoneById[zoneId];
      if (!z) return;
      if (!sticky && cur && cur.sticky) return;
      if (!sticky && cur && cur.kind === 'zone' && cur.id === zoneId) return;
      root.setAttribute('aria-label', z.name);
      show(renderZoneCard(z, model, { progress, onPick }), { kind: 'zone', id: zoneId, sticky }, focus);
    },
    hidePreview() {
      if (cur && !cur.sticky) this.close();
    },
    // 進度變化後重畫目前的分區卡（例如出現「已逛完」）
    refresh() {
      if (cur && cur.kind === 'zone') {
        const keep = cur;
        cur = null;
        this.showZone(keep.id, { sticky: keep.sticky });
      }
    },
    close() {
      cur = null;
      root.classList.remove('is-open');
    },
    isOpen: () => !!cur,
    isSticky: () => !!(cur && cur.sticky),
    current: () => cur,
    root
  };
}

// 狀態圖例：符號＋名稱＋meaning，全部來自 works.json 的 statusLegend（島嶼與清單兩模式共用）
export function renderStatusLegend(model, title) {
  return el('div', { class: 'status-legend' }, [
    el('p', { class: 'sl-title', text: title }),
    el('ul', null, statusKinds().map((k) => {
      const e = statusEntry(k);
      return el('li', { class: 'st-' + k }, [
        el('span', { class: 'status st-' + k }, [statusIcon(k), e.label]),
        el('span', { class: 'sl-meaning', text: e.meaning })
      ]);
    }))
  ]);
}
