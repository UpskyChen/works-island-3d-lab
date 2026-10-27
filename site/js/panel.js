// 右側面板（搜尋、狀態篩選、分區／連線分頁）與清單模式
import { el, statusKind, statusKinds, statusIcon } from './util.js';
import { renderCard, renderStatusLegend } from './detail.js';
import { t } from './text.js';

export function createPanel(root, model, { onSelect, onFilter, onLinkSelect, progress, onReset }) {
  let query = '';
  let filter = 'all';
  let tab = 'zones';
  let selected = null;
  const FILTERS = [['all', t('panel.filterAll')], ...statusKinds().map((k) => [k, t('status.' + k)])];

  const countOf = (k) => (k === 'all' ? model.works.length : model.works.filter((w) => statusKind(w) === k).length);

  // 你的探索進度（只存在這個瀏覽器）
  const bar = el('div', { class: 'pg-bar', role: 'progressbar', 'aria-label': t('panel.progressTitle'), 'aria-valuemin': '0', 'aria-valuemax': String(model.works.length) }, el('span', { class: 'pg-fill' }));
  const pgText = el('span', { class: 'pg-text' });
  const pgNote = el('p', { class: 'pg-note', hidden: true, text: t('panel.progressNoStorage') });
  const progressBox = el('div', { class: 'progress' }, [
    el('div', { class: 'pg-head' }, [
      el('strong', { text: t('panel.progressTitle') }), pgText,
      el('button', { type: 'button', class: 'pg-reset', onclick: () => onReset() }, t('panel.progressReset'))
    ]),
    bar, pgNote
  ]);

  const search = el('input', {
    type: 'search', class: 'search', placeholder: t('panel.searchPlaceholder'), 'aria-label': t('panel.searchLabel'),
    autocomplete: 'off', oninput: (e) => { query = e.target.value.trim().toLowerCase(); refresh(); }
  });
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': t('panel.filterGroup') }, FILTERS.map(([k, label]) => el('button', {
    type: 'button', class: 'chip', 'data-filter': k, 'aria-pressed': String(k === filter),
    onclick: () => { filter = k; refresh(); }
  }, [k === 'all' ? null : statusIcon(k), label, el('span', { class: 'chip-count', text: String(countOf(k)) })])));

  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': t('panel.tabsLabel') }, [['zones', t('panel.tabZones')], ['links', t('panel.tabLinks')]].map(([k, label]) => el('button', {
    type: 'button', role: 'tab', class: 'tab', id: 'tab-' + k, 'aria-controls': 'tabpanel-' + k, 'aria-selected': String(k === tab),
    onclick: () => { tab = k; refresh(); }
  }, label)));

  const zoneList = el('div', { class: 'tabpanel', id: 'tabpanel-zones', role: 'tabpanel', 'aria-labelledby': 'tab-zones' });
  const linkList = el('div', { class: 'tabpanel', id: 'tabpanel-links', role: 'tabpanel', 'aria-labelledby': 'tab-links', hidden: true });
  const empty = el('div', { class: 'empty-result', hidden: true }, [
    el('p', { text: t('panel.empty') }),
    el('button', { type: 'button', class: 'btn-ghost', onclick: () => { query = ''; search.value = ''; filter = 'all'; refresh(); search.focus(); } }, t('panel.clear'))
  ]);

  // 分區分頁
  const rows = {};
  model.zones.forEach((z) => {
    const works = model.worksInZone(z.id);
    const group = el('section', { class: 'pz zone-' + z.id, 'data-zone': z.id }, [
      el('h3', { class: 'pz-title' }, [el('span', { class: 'hex-dot', 'aria-hidden': 'true' }), z.name, el('span', { class: 'done-chip', hidden: true, text: t('panel.done') }), el('span', { class: 'pz-count', text: t('panel.count', { n: works.length }) })])
    ]);
    const ul = el('ul', { class: 'pz-rows' });
    works.forEach((w) => {
      const kind = statusKind(w);
      const btn = el('button', { type: 'button', class: 'prow', 'data-id': w.id, onclick: () => onSelect(w.id, { source: 'panel' }) }, [
        el('span', { class: 'num-badge zone-' + w.zone, text: String(w.num) }),
        el('span', { class: 'prow-text' }, [
          el('span', { class: 'prow-name', text: w.name }),
          el('span', { class: 'prow-status st-' + kind }, [statusIcon(kind), w.status])
        ]),
        el('span', { class: 'seen', hidden: true, text: t('panel.seen') })
      ]);
      rows[w.id] = el('li', { 'data-id': w.id }, btn);
      ul.appendChild(rows[w.id]);
    });
    group.appendChild(ul);
    zoneList.appendChild(group);
  });

  // 連線分頁：只列資料檔 connections
  model.connections.forEach((c) => {
    const a = model.byId[c.from];
    const b = model.byId[c.to];
    linkList.appendChild(el('button', { type: 'button', class: 'plink ' + c.style, 'data-from': c.from, 'data-to': c.to, onclick: () => onLinkSelect(c) }, [
      el('span', { class: 'plink-ends' }, [
        el('span', { class: 'num-badge zone-' + a.zone, text: String(a.num) }), a.name,
        el('span', { class: 'line-sample ' + c.style, 'aria-hidden': 'true' }),
        el('span', { class: 'num-badge zone-' + b.zone, text: String(b.num) }), b.name
      ]),
      el('span', { class: 'plink-label', text: t(c.style === 'dashed' ? 'panel.linkDashed' : 'panel.linkSolid') + c.label })
    ]));
  });

  const body = el('div', { class: 'panel-body' }, [zoneList, linkList, empty]);
  root.querySelector('.panel-tools').append(progressBox, search, chips, tabs);
  root.querySelector('.panel-scroll').appendChild(body);

  function matches(w) {
    if (filter !== 'all' && statusKind(w) !== filter) return false;
    if (!query) return true;
    const zone = model.zoneById[w.zone];
    const hay = [w.name, w.status, w.subzone, zone && zone.name, ...(w.tags || [])].join(' ').toLowerCase();
    return hay.includes(query);
  }

  function refresh() {
    chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.id === 'tab-' + tab)));
    zoneList.hidden = tab !== 'zones';
    linkList.hidden = tab !== 'links';
    const visible = new Set(model.works.filter(matches).map((w) => w.id));
    Object.entries(rows).forEach(([id, li]) => { li.hidden = !visible.has(id); });
    zoneList.querySelectorAll('.pz').forEach((g) => { g.hidden = !g.querySelector('li:not([hidden])'); });
    linkList.querySelectorAll('.plink').forEach((b) => { b.hidden = !(visible.has(b.dataset.from) || visible.has(b.dataset.to)); });
    const shown = tab === 'zones' ? visible.size : linkList.querySelectorAll('.plink:not([hidden])').length;
    empty.hidden = shown > 0;
    const active = query || filter !== 'all';
    onFilter(active ? visible : null);
  }

  function setSelected(id, { scroll = true } = {}) {
    selected = id;
    root.querySelectorAll('.prow').forEach((b) => b.classList.toggle('is-selected', b.dataset.id === id));
    root.querySelectorAll('.prow').forEach((b) => b.setAttribute('aria-current', b.dataset.id === id ? 'true' : 'false'));
    root.querySelectorAll('.plink').forEach((b) => b.classList.toggle('is-related', !!id && (b.dataset.from === id || b.dataset.to === id)));
    if (id && scroll && tab === 'zones' && rows[id] && !rows[id].hidden) {
      const sc = root.querySelector('.panel-scroll');
      const r = rows[id].getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      if (r.top < s.top || r.bottom > s.bottom) sc.scrollTo({ top: sc.scrollTop + (r.top - s.top) - s.height / 2 + r.height / 2, behavior: 'smooth' });
    }
  }

  function setProgress() {
    const n = progress.count();
    const total = progress.total();
    pgText.textContent = t('panel.progressText', { n, total });
    bar.setAttribute('aria-valuenow', String(n));
    bar.querySelector('.pg-fill').style.transform = `scaleX(${total ? n / total : 0})`; // 用 transform 不用 width，動畫時不必重新排版
    pgNote.hidden = progress.storageOk;
    Object.keys(rows).forEach((id) => {
      const seen = progress.has(id);
      rows[id].querySelector('.prow').classList.toggle('is-visited', seen);
      rows[id].querySelector('.seen').hidden = !seen;
    });
    zoneList.querySelectorAll('.pz').forEach((g) => { g.querySelector('.done-chip').hidden = !progress.zoneDone(g.dataset.zone); });
  }

  // 清掉搜尋字串與狀態篩選（「全景」回總覽時用）
  function resetFilters() {
    query = '';
    search.value = '';
    filter = 'all';
    refresh();
  }

  refresh();
  setProgress();
  return { setSelected, refresh, setProgress, resetFilters, get selected() { return selected; } };
}

// 清單模式：給校長、主任快速掃描；每列可展開詳情，或「在島上定位」
export function renderListView(box, model, { onLocate }) {
  box.textContent = '';
  let count = 0;
  const sections = model.zones.map((z) => {
    const works = model.worksInZone(z.id);
    count += works.length;
    const sec = el('section', { class: 'list-zone zone-' + z.id }, [
      el('h3', null, [el('span', { class: 'hex-dot', 'aria-hidden': 'true' }), t('list.zoneTitle', { name: z.name, n: works.length })])
    ]);
    if (z.note) sec.appendChild(el('p', { class: 'zone-note', text: z.note }));
    const usesCells = works.length && works.every((w) => w.subzone);
    if (usesCells) {
      const names = (z.subzones || []).slice();
      works.forEach((w) => { if (!names.includes(w.subzone)) names.push(w.subzone); });
      const empties = Object.fromEntries((z.emptySubzones || []).map((e) => [e.name, e.note]));
      names.forEach((name) => {
        const list = works.filter((w) => w.subzone === name);
        sec.appendChild(el('h4', { class: 'list-sub', text: t('list.subTitle', { name, n: list.length }) }));
        if (list.length) sec.appendChild(listRows(list));
        else sec.appendChild(el('p', { class: 'empty-sub', text: empties[name] || '' }));
      });
    } else {
      sec.appendChild(listRows(works));
    }
    return sec;
  });
  box.appendChild(el('h2', { class: 'list-title' }, [t('list.titleBefore'), el('strong', { id: 'total-list', text: String(count) }), t('list.titleAfter')]));
  box.appendChild(renderStatusLegend(model, t('list.legendTitle')));
  sections.forEach((s) => box.appendChild(s));
  box.appendChild(renderRelations());

  // 作品關係：資料檔 connections 逐條列出「起點 → 終點｜類型｜說明｜狀態」，作品名可點去島上定位
  function renderRelations() {
    const end = (w) => el('button', { type: 'button', class: 'link-btn', onclick: () => onLocate(w.id), 'aria-label': t('list.locateLabel', { name: w.name }) }, w.name);
    return el('section', { class: 'list-relations' }, [
      el('h3', { text: t('list.relationsTitle') }),
      el('ul', { class: 'rel-rows' }, model.connections.map((c) => {
        const a = model.byId[c.from];
        const b = model.byId[c.to];
        return el('li', { class: 'rel-row ' + c.style + ' rs-' + c.status, 'data-conn': c.id }, [
          el('span', { class: 'rel-ends' }, [end(a), el('span', { class: 'rel-arrow', 'aria-hidden': 'true', text: '→' }), end(b)]),
          el('span', { class: 'rel-meta' }, [
            el('span', { class: 'rel-type', text: c.typeLabel }),
            el('span', { class: 'rel-label', text: c.label }),
            el('span', { class: 'rel-status', text: c.statusLabel })
          ])
        ]);
      }))
    ]);
  }

  function listRows(works) {
    return el('ul', { class: 'rows' }, works.map((w) => {
      const kind = statusKind(w);
      return el('li', { class: 'row' }, [
        el('details', null, [
          el('summary', null, [
            el('span', { class: 'num-badge zone-' + w.zone, text: String(w.num) }),
            el('span', { class: 'row-name', text: w.name }),
            el('span', { class: 'status st-' + kind }, [statusIcon(kind), w.status])
          ]),
          renderCard(w, model, { inList: true })
        ]),
        el('button', { type: 'button', class: 'locate', onclick: () => onLocate(w.id), 'aria-label': t('list.locateLabel', { name: w.name }) }, t('list.locate'))
      ]);
    }));
  }
}
