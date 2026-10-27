// 分層視差：水面、倒影、島群、雲各自小幅位移，做出前後景深。
// 來源：滑鼠位置（桌機）、拖曳地圖（iPad／手機）、裝置傾斜（使用者按「傾斜視差」允許後才啟用）。
// 只改 transform，每格最多更新一次；鏡頭移動中或「減少動態效果」時不動。
// 3D 版：水面畫在 3D 畫布裡，位移量改由 onMove 交給 3D 場景（sea 圖層不傳）。
import { reducedMotion } from './util.js';

// 各圖層的最大位移（px）：越前面的圖層動得越多
const DEPTH = { sea: -5, shadows: 3, land: 7, sky: 16 };

export function createParallax(stage, { sea, land, sky, shadows, scale, onMove }) {
  let cur = { x: 0, y: 0 };
  let goal = { x: 0, y: 0 };
  let raf = 0;
  let tiltOn = false;
  let tiltBase = null;

  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  const paused = () => reducedMotion() || stage.classList.contains('cam-moving');

  function render() {
    raf = 0;
    if (paused()) return;
    cur.x += (goal.x - cur.x) * 0.12;
    cur.y += (goal.y - cur.y) * 0.12;
    if (Math.abs(goal.x - cur.x) < 0.002 && Math.abs(goal.y - cur.y) < 0.002) cur = { ...goal };
    const tr = (d) => `translate3d(${(cur.x * d).toFixed(2)}px, ${(cur.y * d * 0.6).toFixed(2)}px, 0)`;
    if (sea) sea.style.transform = tr(DEPTH.sea);
    if (land) land.style.transform = tr(DEPTH.land);
    if (sky) sky.style.transform = tr(DEPTH.sky);
    if (onMove) onMove(cur.x, cur.y);
    // 倒影在 SVG 裡，位移以地圖單位計算（除以目前縮放），讓畫面上的位移固定為幾 px
    const sh = shadows();
    if (sh) {
      const k = scale() || 1;
      sh.style.transform = `translate(${((cur.x * DEPTH.shadows) / k).toFixed(2)}px, ${((cur.y * DEPTH.shadows * 0.6) / k).toFixed(2)}px)`;
    }
    if (cur.x !== goal.x || cur.y !== goal.y) raf = requestAnimationFrame(render);
  }
  function aim(x, y) {
    goal = { x: clamp1(x), y: clamp1(y) };
    if (!raf && !paused()) raf = requestAnimationFrame(render);
  }

  // 滑鼠：以舞台中心為原點
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || tiltOn) return;
    const r = stage.getBoundingClientRect();
    aim(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !tiltOn) aim(0, 0); });

  // 鏡頭停下來後補一次更新
  new MutationObserver(() => { if (!paused() && !raf) raf = requestAnimationFrame(render); })
    .observe(stage, { attributes: true, attributeFilter: ['class'] });

  // 裝置傾斜
  function onOrient(e) {
    if (e.beta === null || e.gamma === null) return;
    if (!tiltBase) tiltBase = { b: e.beta, g: e.gamma };
    aim((e.gamma - tiltBase.g) / 20, (e.beta - tiltBase.b) / 20);
  }
  const tiltSupported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  return {
    // 拖曳地圖時：圖層跟著手指方向偏一點，放開後慢慢回正
    drag(dx, dy, ended) {
      if (tiltOn) return;
      if (ended) aim(0, 0);
      else aim(dx / 160, dy / 160);
    },
    tiltSupported,
    get tiltOn() { return tiltOn; },
    async toggleTilt() {
      if (tiltOn) {
        window.removeEventListener('deviceorientation', onOrient);
        tiltOn = false;
        aim(0, 0);
        return false;
      }
      // iOS 13 以後必須由使用者按鈕觸發、詢問權限
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          if ((await DOE.requestPermission()) !== 'granted') return false;
        } catch (err) {
          return false;
        }
      }
      tiltBase = null;
      window.addEventListener('deviceorientation', onOrient);
      tiltOn = true;
      return true;
    }
  };
}
