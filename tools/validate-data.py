#!/usr/bin/env python3
"""資料檔檢查：site/data/works.json 與 site/data/layout.json。

GitHub Actions 在部署前執行；有任何錯誤就讓部署失敗（線上網站維持上一版，不會變空白），
並在 Actions 頁面與檔案上標出「第幾行」。也可以在自己電腦上執行：

    python3 tools/validate-data.py

只用 Python 內建模組，不需要安裝任何套件。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKS = 'site/data/works.json'
LAYOUT = 'site/data/layout.json'
SITE = os.path.join(ROOT, 'site')

errors = []
warnings = []


def report(level, path, line, msg):
    (errors if level == 'error' else warnings).append((path, line, msg))


# ---------- 會記住行號的 JSON 讀取 ----------
class LDict(dict):
    line = 1
    key_lines = None


class LList(list):
    line = 1


class LineParser:
    """在 json.loads 確認語法正確之後使用：重新讀一次，記下每個物件、陣列與欄位所在的行號。"""

    def __init__(self, text):
        self.s = text
        self.i = 0
        self.line = 1

    def ws(self):
        s = self.s
        while self.i < len(s) and s[self.i] in ' \t\r\n':
            if s[self.i] == '\n':
                self.line += 1
            self.i += 1

    def value(self):
        self.ws()
        c = self.s[self.i]
        if c == '{':
            return self.obj()
        if c == '[':
            return self.arr()
        if c == '"':
            return self.string()
        dec = json.JSONDecoder()
        v, end = dec.raw_decode(self.s, self.i)
        self.i = end
        return v

    def string(self):
        v, end = json.decoder.scanstring(self.s, self.i + 1)
        self.i = end
        return v

    def obj(self):
        d = LDict()
        d.line = self.line
        d.key_lines = {}
        self.i += 1
        self.ws()
        if self.s[self.i] == '}':
            self.i += 1
            return d
        while True:
            self.ws()
            kline = self.line
            k = self.string()
            self.ws()
            self.i += 1  # :
            v = self.value()
            d[k] = v
            d.key_lines[k] = kline
            self.ws()
            c = self.s[self.i]
            self.i += 1
            if c == '}':
                return d

    def arr(self):
        a = LList()
        a.line = self.line
        self.i += 1
        self.ws()
        if self.s[self.i] == ']':
            self.i += 1
            return a
        while True:
            a.append(self.value())
            self.ws()
            c = self.s[self.i]
            self.i += 1
            if c == ']':
                return a


ERR_ZH = [
    ("Expecting ',' delimiter", '少了逗號「,」：上一個項目結尾要加英文半形逗號'),
    ("Expecting ':' delimiter", '少了冒號「:」：欄位名稱後面要接英文半形冒號'),
    ('Expecting property name enclosed in double quotes', '這裡應該是欄位名稱（要用英文半形雙引號 " 包起來）；也可能是上一行最後多了一個逗號'),
    ('Expecting value', '這裡缺少內容；常見原因是多打了逗號，或用了中文全形引號「“ ”」'),
    ('Unterminated string', '引號沒有成對：文字的開頭和結尾都要有英文半形雙引號 "'),
    ('Invalid control character', '文字裡有換行或 Tab：同一段文字請寫在同一行'),
    ('Illegal trailing comma', '最後一個項目後面多了逗號「,」：緊接在 } 或 ] 前面的那一項，結尾不能有逗號'),
    ('Extra data', '檔案結尾多了內容：最後一個 } 後面不能再有東西'),
    ('Invalid \\escape', '反斜線「\\」用法不對：文字裡要打反斜線請寫成兩個「\\\\」'),
]


def load(path):
    full = os.path.join(ROOT, path)
    try:
        text = open(full, encoding='utf-8').read()
    except FileNotFoundError:
        report('error', path, 1, '找不到這個檔案')
        return None, None
    except UnicodeDecodeError:
        report('error', path, 1, '檔案不是 UTF-8 編碼')
        return None, None

    dup = []

    def no_dup(pairs):
        seen = set()
        for k, _ in pairs:
            if k in seen:
                dup.append(k)
            seen.add(k)
        return dict(pairs)

    try:
        json.loads(text, object_pairs_hook=no_dup)
    except json.JSONDecodeError as e:
        zh = next((z for en, z in ERR_ZH if e.msg.startswith(en)), e.msg)
        lines = text.split('\n')
        lineno, colno = e.lineno, e.colno
        # 「少了逗號」或「多了逗號」時，Python 指到的是下一行開頭；真正要改的是上一行結尾
        before = lines[lineno - 1][:colno - 1] if 0 < lineno <= len(lines) else ''
        if e.msg.startswith(("Expecting ',' delimiter", 'Expecting property name')) and not before.strip():
            prev = lineno - 1
            while prev > 1 and not lines[prev - 1].strip():
                prev -= 1
            lineno, colno = prev, len(lines[prev - 1].rstrip()) + 1
            zh += f'（請看第 {lineno} 行的結尾）'
        src = lines[lineno - 1] if 0 < lineno <= len(lines) else ''
        extra = ''
        if re.search('[“”]', src) or (lineno > 1 and re.search('[“”]', lines[lineno - 2])):
            extra = '（這一行附近有中文全形引號，JSON 只認得英文半形的 "）'
        report('error', path, lineno, f'JSON 格式錯誤（第 {lineno} 行第 {colno} 個字）：{zh}{extra}\n    第 {lineno} 行內容：{src.strip()[:120]}')
        return None, text
    for k in sorted(set(dup)):
        line = next((i + 1 for i, l in enumerate(text.split('\n')) if f'"{k}"' in l), 1)
        report('error', path, line, f'同一個物件裡出現兩次欄位 "{k}"，後面那個會蓋掉前面那個')
    return LineParser(text).value(), text


def ln(obj, key=None):
    if isinstance(obj, LDict) and key is not None and obj.key_lines and key in obj.key_lines:
        return obj.key_lines[key]
    return getattr(obj, 'line', 1)


def need(path, obj, key, kind, where, allow_empty=False):
    """檢查必要欄位：存在、型別正確、文字不是空白。回傳值（不合格回傳 None）。"""
    names = {str: '文字', int: '整數', list: '清單 [ ]', dict: '物件 { }'}
    if not isinstance(obj, dict):
        report('error', path, ln(obj), f'{where} 應該是物件 {{ }}')
        return None
    if key not in obj:
        report('error', path, ln(obj), f'{where} 缺少必要欄位 "{key}"')
        return None
    v = obj[key]
    if kind is int and (isinstance(v, bool) or not isinstance(v, int)):
        report('error', path, ln(obj, key), f'{where} 的 "{key}" 應該是整數（不要加引號）')
        return None
    if kind is not int and not isinstance(v, kind):
        report('error', path, ln(obj, key), f'{where} 的 "{key}" 應該是{names[kind]}')
        return None
    if kind is str and not allow_empty and not v.strip():
        report('error', path, ln(obj, key), f'{where} 的 "{key}" 不能是空白')
        return None
    return v


def opt(path, obj, key, kind, where):
    if isinstance(obj, dict) and key in obj and obj[key] is not None:
        return need(path, obj, key, kind, where, allow_empty=True)
    return None


# ---------- 程式用到的畫面文字 key ----------
def ui_keys_used():
    keys = set()
    sections = r'(?:site|toolbar|legend|panel|list|detail|status|map|guide)'
    for folder, _, files in os.walk(SITE):
        for f in files:
            if not f.endswith(('.js', '.html')):
                continue
            text = open(os.path.join(folder, f), encoding='utf-8').read()
            text = re.sub(r'//[^\n]*', '', text)
            keys.update(re.findall(r"['\"](" + sections + r"\.[A-Za-z][\w.]*)['\"]", text))
            m = re.search(r"HINTS = Object\.fromEntries\(\[([^\]]*)\]", text)
            if m:
                keys.update('guide.hints.' + k for k in re.findall(r"'(\w+)'", m.group(1)))
    return {k for k in keys if not k.endswith('.')}


def get_path(obj, dotted):
    cur = obj
    for part in dotted.split('.'):
        if not isinstance(cur, dict) or part not in cur:
            return None, cur
        cur = cur[part]
    return cur, None


# ---------- works.json ----------
def check_works(d):
    P = WORKS
    if not isinstance(d, dict):
        report('error', P, 1, '最外層應該是物件 { }')
        return
    meta = need(P, d, 'meta', dict, '最外層')
    intro = need(P, d, 'intro', dict, '最外層')
    zones = need(P, d, 'zones', list, '最外層')
    works = need(P, d, 'works', list, '最外層')
    conns = need(P, d, 'connections', list, '最外層')
    excluded = opt(P, d, 'excluded', list, '最外層') or []
    ui = need(P, d, 'ui', dict, '最外層')
    legend = need(P, d, 'statusLegend', list, '最外層') or []
    ctypes = need(P, d, 'connectionTypes', list, '最外層') or []
    drules = opt(P, d, 'displayRules', list, '最外層') or []

    if meta is not None:
        need(P, meta, 'title', str, 'meta')
        need(P, meta, 'owner', str, 'meta')
        need(P, meta, 'totalWorks', int, 'meta')
    if intro is not None:
        need(P, intro, 'heading', str, 'intro（自我介紹）')
        text = need(P, intro, 'text', str, 'intro（自我介紹）')
        if text and (re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', text) or re.search(r'https?://|www\.', text)):
            report('error', P, ln(intro, 'text'), '自我介紹裡不能有 email 或網址（本站規則：不放聯絡方式）')
        if intro.get('contact') not in (None, '', {}):
            report('error', P, ln(intro, 'contact'), 'intro.contact 必須是 null（本站規則：不放聯絡方式）')

    zone_ids = []
    empty_subs = {}
    for i, z in enumerate(zones or []):
        where = f'zones 第 {i + 1} 個分區'
        zid = need(P, z, 'id', str, where)
        need(P, z, 'name', str, where)
        opt(P, z, 'count', int, where)
        if zid:
            if zid in zone_ids:
                report('error', P, ln(z, 'id'), f'分區 id "{zid}" 重複了')
            zone_ids.append(zid)
            for e in (z.get('emptySubzones') or []) if isinstance(z, dict) else []:
                if isinstance(e, dict) and isinstance(e.get('name'), str):
                    empty_subs.setdefault(zid, {})[e['name']] = ln(e)

    legend_keys = []
    for i, s_ in enumerate(legend):
        where = f'statusLegend 第 {i + 1} 項'
        for k in ('key', 'symbol', 'label', 'meaning'):
            need(P, s_, k, str, where)
        if isinstance(s_, dict) and isinstance(s_.get('key'), str):
            legend_keys.append(s_['key'])
    type_keys = []
    for i, ct in enumerate(ctypes):
        where = f'connectionTypes 第 {i + 1} 項'
        for k in ('key', 'label', 'meaning'):
            need(P, ct, k, str, where)
        if isinstance(ct, dict) and isinstance(ct.get('key'), str):
            type_keys.append(ct['key'])

    ids = {}
    for i, w in enumerate(works or []):
        label = w.get('name') if isinstance(w, dict) and isinstance(w.get('name'), str) else ''
        where = f'works 第 {i + 1} 件作品' + (f'「{label}」' if label else '')
        wid = need(P, w, 'id', str, where)
        need(P, w, 'name', str, where)
        zone = need(P, w, 'zone', str, where)
        status = need(P, w, 'status', str, where)
        links = need(P, w, 'links', list, where)
        skey = need(P, w, 'statusKey', str, where)
        if skey and skey not in legend_keys:
            report('error', P, ln(w, 'statusKey'), f'{where} 的 statusKey "{skey}" 不在 statusLegend 裡；可用的：{"、".join(legend_keys)}')
        ver = need(P, w, 'verification', dict, where)
        if ver is not None:
            for k in ('level', 'levelLabel', 'date', 'note'):
                need(P, ver, k, str, where + ' 的 verification')
        for k in ('problem', 'approach', 'result', 'audience', 'displayNote', 'freezeReason', 'subzone', 'relationLabel', 'subzoneNote'):
            opt(P, w, k, str, where)
        for k in ('tags', 'related'):
            v = opt(P, w, k, list, where)
            for x in v or []:
                if not isinstance(x, str):
                    report('error', P, ln(w, k), f'{where} 的 "{k}" 裡每一項都要是文字（加英文雙引號）')
        if wid:
            if wid in ids:
                report('error', P, ln(w, 'id'), f'作品 id "{wid}" 重複了（每件作品的 id 要不一樣）')
            elif not re.fullmatch(r'[a-z0-9][a-z0-9-]*', wid):
                report('error', P, ln(w, 'id'), f'作品 id "{wid}" 只能用小寫英文、數字和減號「-」（會用在網址上）')
            ids[wid] = w
        if zone and zone_ids and zone not in zone_ids:
            report('error', P, ln(w, 'zone'), f'{where} 的分區 "{zone}" 不存在；可用的分區：{"、".join(zone_ids)}')
        sub = w.get('subzone') if isinstance(w, dict) else None
        if zone and isinstance(sub, str) and sub in empty_subs.get(zone, {}):
            report('error', P, ln(w, 'subzone'), f'{where} 放在「{sub}」，但這個子區在 emptySubzones 裡標示為沒有作品；請先把它從 emptySubzones 拿掉')
        for j, l in enumerate(links or []):
            lw = f'{where} 的第 {j + 1} 個連結'
            need(P, l, 'label', str, lw)
            url = need(P, l, 'url', str, lw)
            if url and (not url.startswith('https://') or re.search(r'\s', url)):
                report('error', P, ln(l, 'url'), f'{lw} 的網址要以 https:// 開頭，而且不能有空格')
        prev = opt(P, w, 'preview', str, where)
        if prev:
            if not re.fullmatch(r'assets/previews/[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg|png)', prev):
                report('error', P, ln(w, 'preview'), f'{where} 的 preview 要寫成 "assets/previews/作品id.webp"（也可以是 .jpg、.png；檔名只能用小寫英文、數字和減號）')
            elif not os.path.isfile(os.path.join(SITE, prev)):
                report('error', P, ln(w, 'preview'), f'{where} 的預覽圖 site/{prev} 不存在：請確認圖片已上傳到 site/assets/previews/，檔名（含大小寫、副檔名）要和這裡一樣')
            elif os.path.getsize(os.path.join(SITE, prev)) > 300_000:
                kb = os.path.getsize(os.path.join(SITE, prev)) // 1024
                report('warning', P, ln(w, 'preview'), f'{where} 的預覽圖 {kb} KB，建議 150 KB 以下（學校 iPad、手機載入較快）')
        if status and '不要給任何遊玩連結' in status:
            for l in links or []:
                if isinstance(l, dict) and isinstance(l.get('url'), str) and not l['url'].startswith('https://github.com/'):
                    report('error', P, ln(l, 'url'), f'{where} 標示「不要給任何遊玩連結」，只能放 GitHub repo 連結')

    for w in works or []:
        if isinstance(w, dict):
            for r in w.get('related') or []:
                if isinstance(r, str) and r not in ids:
                    report('error', P, ln(w, 'related'), f'作品「{w.get("name", "")}」的 related 指到不存在的作品 id "{r}"')

    for i, c in enumerate(conns or []):
        where = f'connections 第 {i + 1} 條連線'
        a = need(P, c, 'from', str, where)
        b = need(P, c, 'to', str, where)
        need(P, c, 'label', str, where)
        style = opt(P, c, 'style', str, where)
        for k in ('id', 'typeLabel', 'statusLabel'):
            need(P, c, k, str, where)
        ctype = need(P, c, 'type', str, where)
        if ctype and ctype not in type_keys:
            report('error', P, ln(c, 'type'), f'{where} 的 type "{ctype}" 不在 connectionTypes 裡')
        cstat = need(P, c, 'status', str, where)
        if cstat and cstat not in ('linked', 'not-linked'):
            report('error', P, ln(c, 'status'), f'{where} 的 status 只能是 "linked" 或 "not-linked"')
        for end, v in (('from', a), ('to', b)):
            if v and v not in ids:
                report('error', P, ln(c, end), f'{where} 的 "{end}" 指到不存在的作品 id "{v}"')
        if style and style not in ('solid', 'dashed'):
            report('error', P, ln(c, 'style'), f'{where} 的 style 只能是 "solid" 或 "dashed"')

    # 件數對帳（本站鐵律：資料檔記載的件數要和實際作品數一致）
    if meta is not None and isinstance(meta.get('totalWorks'), int) and works is not None:
        if meta['totalWorks'] != len(works):
            report('error', P, ln(meta, 'totalWorks'), f'meta.totalWorks 寫 {meta["totalWorks"]}，但 works 裡實際有 {len(works)} 件；新增或刪除作品後要一起改')
        counts = meta.get('countsByZone')
        for z in zones or []:
            if not isinstance(z, dict) or not isinstance(z.get('id'), str):
                continue
            n = sum(1 for w in works if isinstance(w, dict) and w.get('zone') == z['id'])
            if isinstance(z.get('count'), int) and z['count'] != n:
                report('error', P, ln(z, 'count'), f'分區 "{z["id"]}" 的 count 寫 {z["count"]}，但實際有 {n} 件')
            if isinstance(counts, dict) and z['id'] in counts and counts[z['id']] != n:
                report('error', P, ln(counts, z['id']), f'meta.countsByZone 的 "{z["id"]}" 寫 {counts[z["id"]]}，但實際有 {n} 件')

    # 顯示規則
    targets = {}
    for w in works or []:
        if isinstance(w, dict) and isinstance(w.get('id'), str):
            targets[w['id']] = w
    for z in zones or []:
        if isinstance(z, dict) and isinstance(z.get('id'), str):
            targets['zone:' + z['id']] = z
    shown = {k: json.loads(json.dumps(v)) for k, v in targets.items()}
    for i, r in enumerate(drules):
        where = f'displayRules 第 {i + 1} 條'
        rid = need(P, r, 'id', str, where)
        field = need(P, r, 'field', str, where)
        rem = need(P, r, 'remove', str, where)
        if rid and field and rem:
            # field 可以是 "verification.note" 這種巢狀欄位
            *path, key = field.split('.')
            t = shown.get(rid)
            for k in path:
                t = t.get(k) if isinstance(t, dict) else None
            if not isinstance(t, dict) or not isinstance(t.get(key), str) or rem not in t[key]:
                report('warning', P, ln(r), f'{where} 找不到要刪除的原文（資料可能改過了），這條規則不會生效')
            else:
                t[key] = t[key].replace(rem, '')

    # excluded 的項目不得出現在畫面上（套用顯示規則之後）
    def strings(v):
        if isinstance(v, str):
            yield v
        elif isinstance(v, dict):
            for x in v.values():
                yield from strings(x)
        elif isinstance(v, list):
            for x in v:
                yield from strings(x)
    places = [(k, targets[k], v) for k, v in shown.items()] + [(f'connections 第 {i + 1} 條', c, c) for i, c in enumerate(conns or [])] + [('intro', intro, intro or {})]
    for e in excluded:
        if not isinstance(e, dict) or not isinstance(e.get('name'), str):
            continue
        token = e['name'].split(' ')[0]
        for name, orig, v in places:
            if any(token in s for s in strings(v)):
                where = f'作品「{orig.get("name", name)}」' if isinstance(orig, dict) and name in ids else name
                report('error', P, ln(orig), f'不公開的項目「{e["name"]}」出現在{where}的文字裡（本站規則：excluded 不得出現在網站上）')

    # 篩選鈕的短名稱：statusLegend 每一種狀態都要在 ui.status 有對應文字
    if isinstance(ui, dict):
        for k in legend_keys:
            if not isinstance((ui.get('status') or {}).get(k), str):
                report('error', P, ln(d, 'ui'), f'畫面文字 ui.status.{k} 不見了（statusLegend 有這種狀態），請補回來')

    # 程式用到的畫面文字都要在 ui 裡
    if ui is not None:
        for key in sorted(ui_keys_used()):
            v, parent = get_path(ui, key)
            if not isinstance(v, str):
                line = ln(parent) if parent is not None else ln(d, 'ui')
                report('error', P, line, f'畫面文字 ui.{key} 不見了（程式會用到它），請補回來')


# ---------- layout.json ----------
def check_layout(lay, works):
    P = LAYOUT
    if not isinstance(lay, dict):
        report('error', P, 1, '最外層應該是物件 { }')
        return
    layouts = need(P, lay, 'layouts', dict, '最外層')
    zone_ids = [z.get('id') for z in (works or {}).get('zones', []) if isinstance(z, dict)] if isinstance(works, dict) else []
    for key, L in (layouts or {}).items():
        where = f'layouts.{key}'
        for k in ('minWidth', 'margin', 'gap'):
            need(P, L, k, int, where)
        need(P, L, 'nodes', str, where)
        isl = need(P, L, 'islands', dict, where)
        for zid in zone_ids:
            if isl is not None and zid not in isl:
                report('error', P, ln(L, 'islands'), f'{where}.islands 沒有分區 "{zid}" 的島；新增分區後請執行 node tools/gen-islands.mjs 重新產生島嶼')
        for zid, I in (isl or {}).items():
            iw = f'{where}.islands.{zid}'
            for k in ('cx', 'cy', 'contentW'):
                if not isinstance(I, dict) or not isinstance(I.get(k), (int, float)) or isinstance(I.get(k), bool):
                    report('error', P, ln(I), f'{iw} 的 "{k}" 應該是數字')
            pts = I.get('pts') if isinstance(I, dict) else None
            if not isinstance(pts, list) or len(pts) < 8 or not all(isinstance(p, list) and len(p) == 2 and all(isinstance(n, (int, float)) for n in p) for p in pts):
                report('error', P, ln(I), f'{iw} 的 "pts"（島嶼輪廓）應該是至少 8 個 [x, y] 座標')


def main():
    works, _ = load(WORKS)
    if works is not None:
        check_works(works)
    lay, _ = load(LAYOUT)
    if lay is not None:
        check_layout(lay, works)

    gh = os.environ.get('GITHUB_ACTIONS') == 'true'
    for path, line, msg in warnings:
        first = msg.split('\n')[0]
        if gh:
            print(f'::warning file={path},line={line},title=資料檔提醒::{first}')
        print(f'⚠ 提醒  {path} 第 {line} 行：{msg}')
    for path, line, msg in errors:
        first = msg.split('\n')[0]
        if gh:
            print(f'::error file={path},line={line},title=資料檔錯誤::{first}')
        print(f'✗ 錯誤  {path} 第 {line} 行：{msg}')

    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            if errors:
                f.write('## ✗ 資料檔有錯誤，這次不會部署（線上網站維持上一版）\n\n')
                for path, line, msg in errors:
                    f.write(f'- `{path}` **第 {line} 行**：{msg.splitlines()[0]}\n')
            else:
                f.write('## ✓ 資料檔檢查通過\n')
            for path, line, msg in warnings:
                f.write(f'- ⚠ `{path}` 第 {line} 行：{msg.splitlines()[0]}\n')

    if errors:
        print(f'\n資料檔檢查失敗：{len(errors)} 個錯誤。修正上面標示的行，再存檔一次即可。')
        sys.exit(1)
    print(f'資料檔檢查通過（{len(warnings)} 個提醒）。')


if __name__ == '__main__':
    main()
