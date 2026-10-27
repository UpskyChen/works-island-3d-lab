// 3D 場景的配色與渲染參數（只影響畫面，不含任何作品內容；works.json 與 layout.json 都不需要改）。
// 五區主題色依《3D 視覺實驗》概念稿色票：頂面是主色，崖面是同色系的深色。凍結區維持冷色。

const LIGHT = {
  zones: {
    campus: { top: '#f69a48', cliff: '#b95f22' },
    subjects: { top: '#4cbb77', cliff: '#27784a' },
    games: { top: '#a678f5', cliff: '#6a3fc0' },
    tools: { top: '#3fa9e8', cliff: '#1f6fa8' },
    frozen: { top: '#bcd8ef', cliff: '#7498bb' }
  },
  fallbackZone: { top: '#9cc58a', cliff: '#5f8a4f' }, // 資料檔日後新增分區、這裡還沒配色時
  islet: { top: '#86c96a', cliff: '#4f8a43' },
  sea: { deep: '#0e5a7d', shallow: '#17a2b8', foam: '#e9fbff', glint: 0.12, shadow: 0.34 },
  beach: '#f6e2ae',
  rock: '#8c979d',
  sun: { color: '#ffd8a6', intensity: 2.7, dir: [-0.42, 0.82, 0.42] },
  hemi: { sky: '#fff2da', ground: '#2a8aa0', intensity: 1.15 },
  cloudShadow: { color: '#06263a', opacity: 0.13 },
  dim: 1 // 島與景物顏色的整體亮度
};

// 深色模式：不刺眼的「傍晚」版本。主色降亮度、保留色相；海面更深；陽光變弱、偏暖
const DARK = {
  ...LIGHT,
  sea: { deep: '#062638', shallow: '#0c5f70', foam: '#9fd6e2', glint: 0.07, shadow: 0.3 },
  beach: '#a8956a',
  sun: { color: '#ffc58e', intensity: 1.7, dir: [-0.42, 0.82, 0.42] },
  hemi: { sky: '#9fb3d1', ground: '#0a3a48', intensity: 0.85 },
  cloudShadow: { color: '#000000', opacity: 0.12 },
  dim: 0.7
};

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export const isDark = () => !!(darkQuery && darkQuery.matches);
export const palette = () => (isDark() ? DARK : LIGHT);
export const onThemeChange = (fn) => darkQuery && darkQuery.addEventListener('change', fn);

// 鏡頭：固定等角視角。全景約 45° 俯角，點作品時抬到約 50°（數值是俯角的 sin）
export const TILT = { pano: Math.sin((45 * Math.PI) / 180), focus: Math.sin((50 * Math.PI) / 180) };

export const RENDER = {
  thick: 2.2,          // 島的崖面厚度 = 版面 depth × 這個倍數
  maxDpr: 2,           // 解析度上限
  // 自適應降解析：每 60 格算一次平均幀間隔，超過 slowMs 就降一階；連續 3 次低於 fastMs 才升回一階
  dprSteps: [2, 1.5, 1.25, 1, 0.8],
  slowMs: 24,
  fastMs: 18,
  idleFps: 30,         // 鏡頭沒在動時，水面與小船只需要 30 fps
  shadowMap: { names: 2048, numbers: 1024 }
};
