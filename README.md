# 阿喵老師的作品島（3D 視覺實驗版）

> **這是實驗 repo。** 要回答的問題：換成真 3D 渲染，能不能在不動任何資料與功能的前提下，讓第一秒的立體感與色彩強度明顯跳出來。實驗成立才談搬回主 repo；不成立就刪掉本 repo，主站零損失。實驗的範圍、不變量與驗收結果見 `PLAN.md`。
> 本 repo 的 `site/data/works.json` 與主站相同、一字未改；**要改作品內容請改主站**，不要改這裡。

和主站（v4）唯一的差別是**地圖本體的渲染層**：

- 五座島、海面、步道、沙洲／礁石／小浮島、樹木與地標改由 **Three.js** 即時渲染（`site/js/scene3d.js`），有崖面厚度、岸線浪花、投影、暖色日光；海面是深藍漸層＋微光波紋，加一艘輕晃的小船與緩慢飄移的雲影。全部用幾何基元與 Canvas 程序紋理拼出來，不下載任何模型、圖片或音效檔。
- 作品節點、分區標籤、連線、印章、告示牌、詳情卡、右側面板、清單模式、小貓嚮導都還是原本的 DOM／SVG，行為不變；3D 畫布墊在 SVG 下層，鏡頭每次移動都換算成同一個畫面位置。
- 鏡頭固定等角視角（全景約 45° 俯角，點作品時抬到約 50°），不能自由旋轉；拖曳、縮放、全景／回到本區、點作品推近照舊。
- 配色與渲染參數在 `site/js/theme3d.js`（五區色票、海色、陽光、深色模式、解析度策略），不在資料檔裡。
- Three.js 0.180.0 放在 `site/vendor/three/`（官方 minified 版，MIT 授權，附 LICENSE），用 importmap 對應 `three`，不連外部 CDN、不需要打包工具。
- **自動退回**：瀏覽器沒有 WebGL、不支援 importmap（iOS 16.4 以前），或 3D 模組載入失敗時，地圖自動改用原本的 2.5D SVG 版，其他功能完全相同。
- 頁尾標明「3D 視覺實驗版」。

以下是沿用主站的說明（原為 v3：2.5D 不規則島嶼版）。純靜態網站：SVG＋CSS＋原生 JavaScript，沒有後端、表單、追蹤或登入，不載入任何外部 CDN 或字體（使用系統字體）。

- **島嶼探索**：五個分區是五座形狀不規則的島（有海灣、岬角），看得到側面厚度、岸線與水面倒影；樹木與建築依前後位置互相遮擋。島與島之間有高低、彎度不同的木造步道，水面上還有沙洲、礁石與小浮島。
- **視差與鏡頭**：滑鼠移動、拖曳地圖（或在 iPad 上開啟「傾斜視差」）時，水面、倒影、島、雲分層小幅位移；點作品時鏡頭平滑推近並微調傾角。開啟系統的「減少動態效果」時，視差與所有動畫都會關閉。
- **清單模式**：同一份資料依分區列成清單，可展開詳情，每列都能「在島上定位」。
- **右側面板**：你的探索進度、搜尋、狀態篩選、「分區／連線」分頁，並與地圖雙向連動。
- **其他**：帶我逛逛（自動導覽）、網址深層連結（例如 `#xikou-3d-campus`）、連線開關、＋／－ 縮放、拖曳與雙指縮放、鍵盤操作（Tab／Enter／Esc）、深淺色模式。

> **要改網站上的文字或連結，只要改一個檔案：`site/data/works.json`。** 畫面程式裡沒有寫死任何文字或網址（唯一的例外是「資料載入失敗」與「需要啟用 JavaScript」兩句，因為資料檔讀不到時沒有別的地方可以拿到文字）。

## 在 GitHub 網頁上修改內容（不用裝任何軟體）

三種常見修改都照同一個流程：**打開 `works.json` → 按鉛筆 → 改字 → Commit → 看 Actions 有沒有綠勾**。改壞了也不用怕：檢查沒通過時網站不會更新，線上會維持上一版，不會變空白。

### 共同步驟 A：打開檔案、進入編輯

1. 打開 <https://github.com/UpskyChen/works-island>，確認已登入 GitHub。
2. 依序點資料夾 **`site`** → **`data`** → 檔案 **`works.json`**。
3. 按檔案右上角的 **鉛筆圖示**（滑鼠移上去會顯示 “Edit this file”）。
   - iPad 或手機若看不到鉛筆：先按右上角的 **「…」** 選 **Edit file**，或把畫面切成「電腦版網站」。
4. 進入編輯畫面後，點一下文字區，按 **Ctrl＋F**（Mac／iPad 鍵盤是 **⌘＋F**）就能搜尋要改的地方。

### 共同步驟 B：存檔、確認網站更新

1. 改好後，按右上角綠色的 **Commit changes…**。
2. 跳出的視窗裡，第一行可以寫這次改了什麼（例如「改自我介紹」），下方選 **Commit directly to the `main` branch**，再按 **Commit changes**。
3. 點 repo 上方的 **Actions** 分頁，最上面會出現一筆 “Deploy site to GitHub Pages”：
   - 黃色圓圈：執行中，等 1～2 分鐘。
   - **綠色勾勾**：成功，重新整理網站就會看到新內容（若沒變，按 Shift＋重新整理）。
   - **紅色叉叉**：資料檔有地方寫錯，**這次沒有部署，線上網站還是上一版**。點進去 → 點 **validate** → 展開「檢查資料檔」那一步，會寫出「`site/data/works.json` 第 幾 行：哪裡錯了」。回到步驟 A 改那一行，再 Commit 一次即可。

**最常見的錯誤**：刪到引號 `"` 或逗號 `,`；用了中文全形引號 `“ ”`（要用英文半形 `"`）；最後一項後面多了逗號。檢查程式都會指出是第幾行。

### 我要改自我介紹

1. 照 **步驟 A** 打開 `works.json`，搜尋 `"intro"`。
2. 你會看到這一段：
   ```json
   "intro": {
     "contact": null,
     "contactNote": "...",
     "heading": "關於我",
     "text": "我是 Upsky，學生叫我阿喵老師。……"
   },
   ```
3. 只改 **`"text": "` 和最後的 `"` 中間的文字**。整段要寫在同一行，不要按 Enter 換行。
   - 網站會把第一句（第一個「。」之前）當作頁首的副標題，其餘每兩句排成一段。
   - 文字裡如果需要引號，請用中文引號「」，不要用英文 `"`。
   - 本站規則：不放 email、社群或任何網址（檢查程式會擋下來）。
4. 想改標題「關於我」，就改 `"heading"` 的文字。
5. 照 **步驟 B** 存檔。

### 我要改某個連結

1. 照 **步驟 A** 打開 `works.json`，直接搜尋舊網址的一部分（例如 `photo-blocks`），或按鈕上的字（例如 `開啟工具`）。
2. 你會找到這件作品的 `"links"`（每件作品的欄位依英文字母排序，所以 `"links"` 在作品名稱 `"name"` 的上面幾行）：
   ```json
   "links": [
     {
       "label": "開啟工具",
       "url": "https://upsky0210.github.io/photo-blocks/"
     },
     {
       "label": "GitHub repo",
       "url": "https://github.com/upsky0210/photo-blocks"
     }
   ],
   ```
3. `"label"` 是按鈕上的字，`"url"` 是網址。只改引號裡的內容，引號和逗號都要留著。
   - 網址必須以 `https://` 開頭、中間不能有空格（檢查程式會擋下來）。
   - 想新增一顆按鈕：在 `]` 前面加一組 `{ "label": "...", "url": "https://..." }`，前一組的 `}` 後面要補逗號。
4. 照 **步驟 B** 存檔。

### 我要新增一件作品

1. 照 **步驟 A** 打開 `works.json`，搜尋你想排在它後面的那件作品名稱。作品編號依檔案裡的順序自動產生。
2. 往下找到那件作品結尾的 `},`（作品與作品之間就是用 `},` 隔開），在它的**下一行**貼上這個範本：
   ```json
   {
     "id": "my-new-work",
     "name": "新作品名稱",
     "zone": "tools",
     "status": "已上線",
     "statusKey": "live",
     "verification": { "level": "verified-live", "levelLabel": "已驗證・線上運作", "date": "2026-10-26", "note": "驗證說明" },
     "audience": "對象",
     "problem": "想解決什麼問題",
     "approach": "怎麼做的",
     "result": "成果",
     "tags": ["標籤一", "標籤二"],
     "links": [
       { "label": "開啟網站", "url": "https://example.github.io/my-new-work/" }
     ]
   },
   ```
   - 如果你貼在**最後一件作品**（蓬萊異聞錄 Online）後面：最後一件作品結尾的 `}` 後面要補一個逗號，而範本最後的 `},` 要改成 `}`。
3. 依下表改範本內容：

   | 欄位 | 必填 | 說明 |
   |---|---|---|
   | `id` | ✓ | 小寫英文、數字與減號，不可和其他作品重複，例如 `"new-tool"`；也是網址 `#new-tool` |
   | `name` | ✓ | 作品名稱 |
   | `zone` | ✓ | 分區：`campus`（校園）、`subjects`（教材）、`games`（遊戲）、`tools`（工具）、`frozen`（凍結） |
   | `subzone` | 教材區必填 | 學科，例如 `"國語"`。若放進原本的空子區（國語、自然），要先把該子區從那一區的 `emptySubzones` 拿掉 |
   | `status` | ✓ | 卡片上的狀態標籤全文，照原文顯示 |
   | `statusKey` | ✓ | 狀態符號：`live`（✓ 已上線）、`noted`（◐ 已上線・附註記）、`frozen`（❄ 凍結成作品）；可用的值定義在 `statusLegend` |
   | `verification` | ✓ | 詳情卡的「驗證」列：`levelLabel`（驗證等級）、`date`、`note`（說明），照原文顯示；`level` 是英文代號 |
   | `links` | ✓ | 按鈕清單；沒有連結就寫 `[]` |
   | `problem`、`approach`、`result`、`audience` | | 問題／做法／成果／對象；不需要的整行刪掉 |
   | `tags` | | 標籤（也會被搜尋到） |
   | `displayNote`、`freezeReason` | | 卡片上的「說明」框、「凍結原因」框 |
   | `relationLabel` | | 延伸作品的小標籤；有這個欄位的作品會排在主作品右下方 |

4. **同一個檔案裡還要改三個數字**（檢查程式會逐一提醒）：
   - `meta` 裡的 `"totalWorks"`：總件數加 1。
   - `meta` 裡 `"countsByZone"` 該分區的數字加 1。
   - `zones` 裡該分區的 `"count"` 加 1。
5. （選填）新作品和其他作品有關聯，就在 `"connections"` 加一筆：
   `{ "id": "c8", "from": "舊作品 id", "to": "my-new-work", "type": "family", "typeLabel": "同家族", "label": "關聯說明", "style": "solid", "status": "linked", "statusLabel": "已串接" }`
   - `type` 要用 `connectionTypes` 裡有的種類；`status` 只能是 `linked` 或 `not-linked`（尚未串接入口，畫成虛線時 `style` 用 `"dashed"`）。
   - 地圖只會畫這裡列出的線；清單模式最下方的「作品關係」也照這裡逐條列出。
6. 照 **步驟 B** 存檔。島的形狀不用改：放不下時，網站會自動把那座島等比例放大。

## 檔案結構

```
site/                      ← 發佈到 GitHub Pages 的整個資料夾
  index.html               ← 只有結構，文字由 works.json 填入
  css/base.css             ← 色彩變數（深淺色）、頁首、共用元件
  css/island.css           ← 2.5D 島嶼、裝飾、步道、節點、連線、視差圖層、動畫
  css/panel.css            ← 右側面板、詳情卡、工具列、小貓嚮導、清單模式
  js/main.js               ← 組裝各模組、選取與聚焦、帶我逛逛、工具列
  js/scene3d.js            ← （3D 實驗版）Three.js 地圖本體：島、海、步道、景物、小船、雲影、降解析
  js/theme3d.js            ← （3D 實驗版）3D 配色與渲染參數
  css/scene3d.css          ← （3D 實驗版）畫布位置、3D 模式下隱藏 SVG 地形
  vendor/three/            ← （3D 實驗版）Three.js 0.180.0（three.core.min.js、three.module.min.js、LICENSE）
  js/data-loader.js        ← 讀資料檔、套用顯示規則、件數對帳
  js/text.js               ← 從 works.json 的 ui 取畫面文字
  js/layout.js             ← 依 layout.json 放島，依作品資料自動擺節點；放不下時放大島嶼
  js/terrain.js            ← 島嶼輪廓、平滑曲線、步道曲線等幾何（網站與產生器共用）
  js/map.js                ← SVG 地圖（地形、裝飾、步道、景物、告示牌、已逛完章、插圖槽）與鏡頭
  js/parallax.js           ← 分層視差（滑鼠、拖曳、iPad 傾斜）
  js/nodes.js              ← 作品膠囊節點
  js/connections.js        ← 作品連線（彩色弧線）
  js/panel.js              ← 右側面板（進度、搜尋、篩選、分頁）與清單模式
  js/detail.js             ← 詳情卡與左側分區卡
  js/router.js             ← 網址 hash 深層連結
  js/progress.js           ← 你的探索進度（只存在訪客自己的瀏覽器）
  js/guide.js              ← 小貓嚮導
  js/util.js               ← 共用小工具
  data/works.json          ← ★ 唯一要改的資料檔：作品、自我介紹、連結、畫面文字、顯示規則
  data/layout.json         ← 地圖版面：島嶼輪廓座標、位置、裝飾、步道（不含作品內容）
  assets/props.svg         ← 原創小插畫（標題列小物、樹木、地標建築）
tools/validate-data.py     ← 資料檔檢查（部署前由 GitHub Actions 執行）
tools/gen-islands.mjs      ← 島嶼輪廓產生器（只有想重新設計島嶼形狀時才用）
works-data.json            ← 站主提供的原始資料檔（原樣保留作為紀錄，網站不讀它）
.github/workflows/pages.yml
```

## 本機預覽

JS 使用瀏覽器原生 ES modules，必須用靜態伺服器開啟（直接雙擊 `index.html`、以 file:// 開啟無法運作）：

```bash
cd site
python3 -m http.server 8000
```

然後用瀏覽器開 <http://localhost:8000/>。手機或 iPad 在同一個網路下，可開 `http://<電腦 IP>:8000/` 實機測試。

改完資料檔，可以先在自己電腦上檢查一次：`python3 tools/validate-data.py`。

## works.json 裡除了作品之外的段落

- `intro`：自我介紹（見上方教學）。
- `ui`：網站上所有按鈕、標題、提示文字，例如 `"pano": "全景"`。可以直接改引號裡的字；`{n}`、`{name}` 這種大括號是程式自動填入的數字或名稱，請保留。少了任何一個，檢查程式會指出來。
- `ui.guide.hints`：小貓嚮導的 8 句固定提示（見下方「小貓嚮導」）。
- `statusLegend`：狀態圖例的 3 種狀態（符號、名稱、meaning）。島嶼模式的圖例、清單模式頂部的圖例、每件作品的符號都由它產生；右側面板篩選鈕的短名稱在 `ui.status`。
- `connectionTypes`：連線的 5 種關係類型與說明。
- `displayRules`：顯示規則（見下方說明）。

## 島嶼形狀（data/layout.json）

- 三種螢幕寬度各有一套：`wide`（1000px 以上）、`medium`（600px 以上）、`narrow`（手機，節點只顯示編號）。
- `islands`：每座島的中心 `cx`、`cy`，內容寬度 `contentW`，以及輪廓座標 `pts`（以島中心為原點的 `[x, y]`）。輪廓由 `tools/gen-islands.mjs` 以固定種子（`seed`）產生後寫進來，每次載入形狀都一樣，不會隨機變動。島的大小依作品件數決定。
- `decor`：沙洲、礁石、小浮島，跟著所屬的島擺放。
- `walkways`：島與島之間的步道。`kind` 是 `arch`（拱橋）或 `deck`（棧道），`rise` 是拱起高度，`bend` 是彎曲程度。步道只是裝飾（中性木色）；作品之間真正的關聯是 `works.json` 的 `connections`，畫成彩色弧線，圖例分開標示。
- `cellOrder`：教材區子區的排列順序。`props`、`subzoneProps`、`scenery`：標題列小插畫、子區小插畫、島上景物與地標（程式會自動避開節點與文字）。`art`：插圖資產槽（見下一節）。
- **新增作品不用動這個檔案**：島放不下時，網站會自動等比例放大那座島，並和鄰島推開。
- 想換一組島嶼形狀（例如新增分區後）：在電腦上執行 `node tools/gen-islands.mjs 新的種子文字`，會重新產生三種寬度的輪廓並寫回 `layout.json`。

## 插圖資產槽（日後升級外觀用）

> 3D 實驗版：3D 地圖不使用這個資產槽（`art` 有設定也不顯示）；只有退回 2.5D 版時才有作用。

每個分區都可以用一張插圖取代 SVG 地塊。設定方式：

1. 把圖片放在 `site/assets/zones/`，命名為 `<分區>.webp`，例如 `campus.webp`、`subjects.webp`。
2. 在 `site/data/layout.json` 的 `art` 裡，把該區的 `null` 改成路徑，例如 `"campus": "assets/zones/campus.webp"`。

圖片規格建議：

- **格式**：WebP；背景透明；單張 **300KB 以下**，iPad 載入較順。
- **比例與尺寸**：約 **16:10**，例如 1600×1000。圖片會依比例縮放、置中放進該島輪廓的外框，各島長寬比不同，構圖請留邊。
- **內容**：只畫島與地景。**不要把任何文字、作品名稱、編號畫進圖片**；分區標籤、作品節點、連線一律由網站疊在圖片上層。

運作方式：

- 圖片載入成功，才隱藏該區的 SVG 地形與倒影（景物、標籤、節點仍疊在上層）。
- 圖片不存在或載入失敗，自動退回 SVG 版。此時瀏覽器 console 會出現一筆 404 紀錄，屬正常現象；不想看到就把 `art` 改回 `null`。
- `art` 為 `null` 時完全不發出圖片請求。

## 小貓嚮導的固定提示句（供站主審稿）

小貓的對話泡泡只會出現兩種文字：

**1. 固定提示**（全部在 `site/data/works.json` 的 `ui.guide.hints`，共 8 句，可直接修改）

| 代號 | 時機 | 文字 |
|---|---|---|
| `welcome` | 進站 | 嗨！點一座島或一個編號看看。 |
| `zone` | 點選分區 | 這一區的作品都列在卡片上，點一件看看。 |
| `work` | 點選作品 | 卡片下方的按鈕可以直接打開作品。 |
| `zoneDone` | 逛完一區 | 這一區你逛完了！ |
| `allDone` | 全部作品都看過 | 全部作品都看過了，謝謝你逛完整座島！ |
| `tour` | 開始「帶我逛逛」／導覽中 | 我帶你一件一件看，隨時可以按停止。 |
| `tourStop` | 停止導覽 | 導覽停下來了，想看哪裡就點哪裡。 |
| `reset` | 按「重新開始」 | 進度清除了，我們重新出發吧！ |

**2. 資料檔原文**（以較小字顯示在提示句下方，原樣不改）

- 點選分區、逛完一區時：該分區的 `name`，例如「教材區」。
- 點選作品、導覽中：該作品的 `status`，例如「已上線（桌機已測，iPad 實機待驗收）」。

小貓不會說出任何資料檔沒有的作品描述、成效或評價。

## 你的探索進度

- 記錄「這個瀏覽器看過哪幾件作品」：打開一件作品的詳情卡就算看過。
- 一區全部看過，地圖與面板上會蓋「已逛完」章。
- 只存在訪客自己瀏覽器的 `localStorage`（鍵名 `works-island:visited:v1`），不送出任何網路請求；面板上的「重新開始」可清除。
- 無法使用 `localStorage` 時（隱私模式、被封鎖），進度只在本次瀏覽中計算，面板會顯示提示，其他功能不受影響。
- 這只是介面回饋，不代表對作品的任何評價。

## 顯示規則（works.json 的 displayRules）

原始資料檔裡有幾句話，是給製作者的施工指示（例如「不要猜子頁網址」「展示時不要寫成已完成」）或計件說明（例如「計 1 件」），另外還有「（站主本人 README 原意）」這類出處括號。依站主決定：

- 作品資料一字不改，改由 `displayRules` 在**顯示時**刪掉這些片段。每條規則是 `{ "id": 作品 id（或 "zone:分區 id"）, "field": 欄位, "remove": 要刪掉的原文 }`。
- 規則只做逐字刪除，不改寫、不新增任何字；共 19 條，都列在 `works.json` 最後，可逐條覆核（v2 時寫在 `display-rules.js`，內容一字未改，只是搬家）。
- 其中兩條規則刪掉口說練習 result 與 `verification.note` 裡提到 `englishspeak` 舊站的那句，避免排除項目出現在站上（`field` 可以寫成 `verification.note` 這種巢狀欄位）。檢查程式也會確認 `excluded` 的名稱沒有出現在畫面文字裡。
- 若之後修改資料檔，讓某條規則的原文對不上，該規則會自動失效，檢查程式與瀏覽器 console 都會提醒。
- 新增作品時，直接寫成要給訪客看的文字即可，不需要新增規則。

## 部署（GitHub Pages）

GitHub Actions 會把 `site/` 資料夾發佈到 GitHub Pages：

1. 到 repo 的 **Settings → Pages**，Source 選 **GitHub Actions**（只需設定一次）。
2. 合併或推送到 `main` 分支，`.github/workflows/pages.yml` 就會自動執行（只有 `site/`、檢查程式或 workflow 有變動時才觸發）。也可以在 **Actions** 頁手動執行 “Deploy site to GitHub Pages”。
   - 第一步 **validate**：執行 `tools/validate-data.py` 檢查資料檔。不是合法 JSON、缺少必要欄位、件數對不上、違反本站規則（excluded 出現、放聯絡方式、蓬萊放遊玩連結等）都會失敗，並標出第幾行。
   - 第二步 **deploy**：validate 通過才會部署。validate 失敗時不部署，線上維持上一版。
   - 開 PR 時也會跑 validate（不部署），合併前就能看到資料檔有沒有問題。
3. 網址為 `https://<帳號>.github.io/works-island/`。

**回退**：在 GitHub 上 revert 該次合併的 commit，Actions 會自動重新部署前一版。

## 注意

- `site/data/works.json` 會隨網站公開（任何人都能直接打開這個檔案），裡面包含 `excluded` 清單與註記原文；頁面上不會顯示這些內容。若不希望它們能被直接讀到，可以從 `site/data/works.json` 刪掉 `excluded` 區塊，網站不使用它。
- 本站不放任何聯絡方式；`intro.contact` 目前為 `null`。
