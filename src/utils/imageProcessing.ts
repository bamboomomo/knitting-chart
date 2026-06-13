import type { ExtractedColor, GridCell, GridMatrixOutput, KnittingChart } from '../types';
import { GRID_BACKGROUND, PATTERN_WHITE, EDITABLE_EMPTY } from './colorConstants';

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

interface RGBColor {
  r: number; g: number; b: number;
}

/** CIE L*a*b* 色彩空间坐标 */
interface LABColor {
  l: number; // 亮度 0~100
  a: number; // 红-绿轴 -128~127
  b: number; // 黄-蓝轴 -128~127
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): RGBColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/** RGB → HSL (用于色相优先的颜色分类) */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case rr: h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6; break;
      case gg: h = ((bb - rr) / d + 2) / 6; break;
      case bb: h = ((rr - gg) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function colorDistance(c1: RGBColor, c2: RGBColor): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  const rmean = (c1.r + c2.r) / 2;
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rmean) / 256) * db * db
  );
}

function colorDistanceHex(c1: string, c2: string): number {
  return colorDistance(hexToRgb(c1), hexToRgb(c2));
}

/** RGB → LAB (使用 D50 白点 + Bradford 色适应，符合 CIE 标准) */
function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  // Step 1: sRGB → 线性RGB
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  // Step 2: 线性RGB → XYZ (D65)
  const x65 = rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375;
  const y65 = rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750;
  const z65 = rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041;

  // Step 3: Bradford 色适应 D65 → D50
  const x50 =  1.0478112 * x65 + 0.0228866 * y65 - 0.0501270 * z65;
  const y50 =  0.0295424 * x65 + 0.9904844 * y65 - 0.0170491 * z65;
  const z50 = -0.0092345 * x65 + 0.0150436 * y65 + 0.7521316 * z65;

  // Step 4: XYZ (D50) → LAB
  // D50 白点: Xn=0.96422, Yn=1.00000, Zn=0.82521
  const xn = 0.96422, yn = 1.00000, zn = 0.82521;
  let fx = x50 / xn > 0.008856 ? Math.pow(x50 / xn, 1 / 3) : (7.787 * x50 / xn) + 16 / 116;
  let fy = y50 / yn > 0.008856 ? Math.pow(y50 / yn, 1 / 3) : (7.787 * y50 / yn) + 16 / 116;
  let fz = z50 / zn > 0.008856 ? Math.pow(z50 / zn, 1 / 3) : (7.787 * z50 / zn) + 16 / 116;

  const result = { l: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };

  // [LOG] RGB→LAB 转换详情（仅输出纯色和边界值）
  if ((r === 0 || r === 255 || g === 0 || g === 255 || b === 0 || b === 255)) {
    console.log(`[LAB转换] RGB(${r},${g},${b}) → L=${result.l.toFixed(1)} a=${result.a.toFixed(1)} b=${result.b.toFixed(1)}`);
  }

  return result;
}

/** LAB → RGB (使用 D50 白点 + Bradford 逆色适应) */
function labToRgb(lab: { l: number; a: number; b: number }): RGBColor {
  // Step 1: LAB → XYZ (D50)
  const fy = (lab.l + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  // D50 白点
  const xn = 0.96422, yn = 1.00000, zn = 0.82521;

  // 反转非线性变换
  let x50 = fx > 0.2068965517 ? fx * fx * fx : (fx - 16 / 116) / 7.787;
  let y50 = fy > 0.2068965517 ? fy * fy * fy : (fy - 16 / 116) / 7.787;
  let z50 = fz > 0.2068965517 ? fz * fz * fz : (fz - 16 / 116) / 7.787;

  x50 *= xn; y50 *= yn; z50 *= zn;

  // Step 2: Bradford 逆色适应 D50 → D65
  const x65 =  0.9554735 * x50 - 0.0230963 * y50 + 0.0637094 * z50;
  const y65 = -0.0283697 * x50 + 1.0099954 * y50 + 0.0210722 * z50;
  const z65 =  0.0123384 * x50 - 0.0205411 * y50 + 1.3302934 * z50;

  // Step 3: XYZ (D65) → 线性RGB
  let r =  3.2404542 * x65 - 1.5371385 * y65 - 0.4985314 * z65;
  let g = -0.9692660 * x65 + 1.8760108 * y65 + 0.0415560 * z65;
  let b =  0.0556434 * x65 - 0.2040259 * y65 + 1.0572252 * z65;

  // Step 4: 线性RGB → sRGB (伽马校正)
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;

  const result = {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255))),
  };

  // [LOG] LAB→RGB 转换详情（仅输出聚类中心等关键值）
  if (lab.l === 100 || lab.l === 0 || lab.l >= 80 || lab.l <= 20) {
    console.log(`[LAB转换] L=${lab.l.toFixed(1)} a=${lab.a.toFixed(1)} b=${lab.b.toFixed(1)} → RGB(${result.r},${result.g},${result.b})`);
  }

  return result;
}

/** DeltaE 距离：LAB 空间欧氏距离（DeltaE76） */
function labDeltaE(lab1: { l: number; a: number; b: number }, lab2: { l: number; a: number; b: number }): number {
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** RGB 颜色的 DeltaE 距离（经 LAB 空间转换） */
function rgbDeltaE(c1: RGBColor, c2: RGBColor): number {
  return labDeltaE(rgbToLab(c1.r, c1.g, c1.b), rgbToLab(c2.r, c2.g, c2.b));
}

function ciede2000(c1: RGBColor, c2: RGBColor): number {
  const lab1 = rgbToLab(c1.r, c1.g, c1.b);
  const lab2 = rgbToLab(c2.r, c2.g, c2.b);
  const dl = lab2.l - lab1.l;
  const c1ab = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const c2ab = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const cab = (c1ab + c2ab) / 2;
  const cab7 = Math.pow(cab, 7);
  const g = 0.5 * (1 - Math.sqrt(cab7 / (cab7 + Math.pow(25, 7))));
  const a1p = lab1.a * (1 + g);
  const a2p = lab2.a * (1 + g);
  const c1p = Math.sqrt(a1p * a1p + lab1.b * lab1.b);
  const c2p = Math.sqrt(a2p * a2p + lab2.b * lab2.b);
  const h1p = Math.atan2(lab1.b, a1p) * 180 / Math.PI;
  const h2p = Math.atan2(lab2.b, a2p) * 180 / Math.PI;
  const dlp = lab2.l - lab1.l;
  const dcp = c2p - c1p;
  let dhp = h2p - h1p;
  if (c1p * c2p === 0) dhp = 0;
  else if (Math.abs(dhp) <= 180) { /* keep */ }
  else if (dhp > 180) dhp -= 360;
  else dhp += 360;
  const dhpRad = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp * Math.PI / 360);
  const lp = (lab1.l + lab2.l) / 2;
  const cp = (c1p + c2p) / 2;
  let hp = (h1p + h2p) / 2;
  if (c1p * c2p === 0) hp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) { /* keep */ }
  else if (h1p + h2p < 360) hp += 180;
  else hp -= 180;
  const t = 1 - 0.17 * Math.cos((hp - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * hp * Math.PI / 180)
    + 0.32 * Math.cos((3 * hp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hp - 63) * Math.PI / 180);
  const sl = 1 + 0.015 * (lp - 50) * (lp - 50) / Math.sqrt(20 + (lp - 50) * (lp - 50));
  const sc = 1 + 0.045 * cp;
  const sh = 1 + 0.015 * cp * t;
  const rt = -Math.sin(2 * (hp - 275) / 180 * Math.PI)
    * 2 * Math.sqrt(Math.pow(cp, 7) / (Math.pow(cp, 7) + Math.pow(25, 7)));
  return Math.sqrt(
    (dlp / sl) * (dlp / sl) +
    (dcp / sc) * (dcp / sc) +
    (dhpRad / sh) * (dhpRad / sh) +
    rt * (dcp / sc) * (dhpRad / sh)
  );
}

function isGridLineColor(r: number, g: number, b: number): boolean {
  const brightness = (r + g + b) / 3;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
  // 仅过滤接近纯白或接近纯黑的像素（网格线/背景纸色）
  // 浅蓝色、米白色、白色格子图案等有效颜色全部放行参与聚类
  if (brightness > 252 && saturation < 0.005) return true;
  if (brightness < 3 && saturation < 0.01) return true;
  return false;
}

/** 图片类型识别结果 */
export type ImageType = 'COLOR_PATTERN' | 'STRUCTURE_PATTERN';

export interface ImageTypeAnalysisResult {
  /** 检测到的图片类型 */
  type: ImageType;
  /** 详细特征数据 */
  features: {
    uniqueColors: number;       // 唯一颜色数
    avgSaturation: number;      // 平均饱和度 (0-1)
    avgBrightness: number;      // 平均亮度 (0-1)
    lineDensity: number;        // 线条密度 (水平+垂直边缘占比)
    darkPixelRatio: number;     // 深色像素占比 (亮度<80)
    colorVariance: number;      // 颜色方差
  };
  /** 各指标得分 (0-1, 越高越倾向该类型) */
  scores: {
    colorScore: number;         // COLOR_PATTERN 得分
    structureScore: number;     // STRUCTURE_PATTERN 得分
  };
}

/**
 * 图片类型自动识别模块 — 在任何颜色聚类或网格生成之前执行
 *
 * 【模式A：COLOR_PATTERN】
 *   特征：唯一颜色数 > 100, 平均饱和度 > 0.08, 存在大量彩色区域
 *   典型：十字绣图、像素画、彩色编织图、AI生成图案
 *   Pipeline: LAB → Median Cut → KMeans → Palette Mapping → Grid
 *
 * 【模式B：STRUCTURE_PATTERN】
 *   特征：平均亮度 > 0.85, 唯一颜色数 < 50, 大量水平和垂直线,
 *          主要由黑色轮廓和网格组成
 *   典型：针织图、纸样图、裁剪图、领口结构图
 *   Pipeline: Grayscale → Edge Detection → Contour → Flood Fill → Region Classification → Grid
 *
 * 关键约束：
 *   - 禁止对 STRUCTURE_PATTERN 使用颜色聚类
 *   - 禁止使用 LAB、Median Cut、KMeans 处理结构图
 */
export function analyzeImageType(imageData: ImageData): ImageTypeAnalysisResult {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  // === 1. 颜色统计 ===
  const colorSet = new Set<string>();
  let sumSaturation = 0;
  let sumBrightness = 0;
  let darkPixelCount = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  // 用于计算颜色方差的分量
  let sumR2 = 0, sumG2 = 0, sumB2 = 0;

  // 采样加速（大图每4像素取1个）
  const step = totalPixels > 500000 ? 4 : (totalPixels > 200000 ? 2 : 1);
  const sampleCount = Math.floor(totalPixels / step);

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // 唯一颜色（量化到16级减少内存）
    const qr = Math.floor(r / 16);
    const qg = Math.floor(g / 16);
    const qb = Math.floor(b / 16);
    colorSet.add(`${qr},${qg},${qb}`);

    // 亮度 (0-255)
    const brightness = (r + g + b) / 3;
    sumBrightness += brightness;

    // 饱和度
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    sumSaturation += sat;

    // 深色像素计数
    if (brightness < 80) darkPixelCount++;

    // 颜色方差累积
    sumR += r; sumG += g; sumB += b;
    sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
  }

  const uniqueColors = colorSet.size;
  const avgSaturation = sumSaturation / sampleCount;
  const avgBrightness = sumBrightness / sampleCount / 255; // 归一化到 0-1
  const darkPixelRatio = darkPixelCount / sampleCount;

  // 颜色方差（基于RGB三通道的总体离散度）
  const meanR = sumR / sampleCount, meanG = sumG / sampleCount, meanB = sumB / sampleCount;
  const varR = sumR2 / sampleCount - meanR * meanR;
  const varG = sumG2 / sampleCount - meanG * meanG;
  const varB = sumB2 / sampleCount - meanB * meanB;
  const colorVariance = Math.sqrt((varR + varG + varB) / 3) / 255;

  // === 2. 边缘/线条检测（Sobel 近似） ===
  let edgeCount = 0;
  let hEdgeCount = 0;
  let vEdgeCount = 0;
  const edgeThreshold = 30;

  // 采样间隔（避免全像素扫描）
  const edgeStep = Math.max(1, Math.floor(Math.min(width, height) / 200));

  for (let y = edgeStep; y < height - edgeStep; y += edgeStep) {
    for (let x = edgeStep; x < width - edgeStep; x += edgeStep) {
      const idx = (y * width + x) * 4;

      // Sobel 水平梯度 (检测垂直边)
      const gx =
        -data[idx - edgeStep * 4 - 4] + data[idx - edgeStep * 4 + 4]
        - 2 * data[idx - 4] + 2 * data[idx + 4]
        - data[idx + edgeStep * 4 - 4] + data[idx + edgeStep * 4 + 4];

      // Sobel 垂直梯度 (检测水平边)
      const gy =
        -data[idx - edgeStep * 4 - width * 4] - 2 * data[idx - width * 4] - data[idx + edgeStep * 4 - width * 4]
        + data[idx - edgeStep * 4 + width * 4] + 2 * data[idx + width * 4] + data[idx + edgeStep * 4 + width * 4];

      const mag = Math.sqrt(gx * gx + gy * gy);

      if (mag > edgeThreshold) {
        edgeCount++;
        if (Math.abs(gx) > Math.abs(gy) * 1.5) vEdgeCount++;   // 强水平梯度 → 垂直线条
        if (Math.abs(gy) > Math.abs(gx) * 1.5) hEdgeCount++;   // 强垂直梯度 → 水平线条
      }
    }
  }

  const sampledPoints = ((width - 2 * edgeStep) / edgeStep) * ((height - 2 * edgeStep) / edgeStep);
  const lineDensity = sampledPoints > 0 ? (hEdgeCount + vEdgeCount) / Math.max(edgeCount, 1) : 0;

  // === 3. 综合评分 ===

  // COLOR_PATTERN 得分因子
  const colorScoreUnique = Math.min(uniqueColors / 150, 1);           // 颜色丰富度
  const colorScoreSat = Math.min(avgSaturation / 0.15, 1);            // 饱和度
  const colorScoreVar = Math.min(colorVariance / 0.25, 1);             // 颜色多样性
  const colorScoreDark = Math.min(darkPixelRatio / 0.15, 1);           // 深色内容

  const colorScore = (
    colorScoreUnique * 0.30 +
    colorScoreSat * 0.30 +
    colorScoreVar * 0.20 +
    colorScoreDark * 0.20
  );

  // STRUCTURE_PATTERN 得分因子
  const structScoreBright = avgBrightness > 0.85 ? 1 : (avgBrightness / 0.85);  // 高亮背景
  const structScoreFewColors = uniqueColors < 50 ? (1 - uniqueColors / 100) : 0; // 少量颜色
  const structScoreLines = Math.min(lineDensity * 5, 1);                        // 线条密度
  const structScoreLowSat = avgSaturation < 0.06 ? 1 : Math.max(0, 1 - (avgSaturation - 0.06) / 0.15); // 低饱和度

  const structureScore = (
    structScoreBright * 0.25 +
    structScoreFewColors * 0.25 +
    structScoreLines * 0.30 +
    structScoreLowSat * 0.20
  );

  // === 4. 最终判定 ===
  const type: ImageType = colorScore >= structureScore ? 'COLOR_PATTERN' : 'STRUCTURE_PATTERN';

  const result: ImageTypeAnalysisResult = {
    type,
    features: {
      uniqueColors,
      avgSaturation,
      avgBrightness,
      lineDensity,
      darkPixelRatio,
      colorVariance,
    },
    scores: { colorScore, structureScore },
  };

  // 控制台输出
  console.log('%c╔══════════════════════════════════════════╗', 'color:#8b5cf6;font-weight:bold');
  console.log('%c║       图片类型自动识别                    ║', 'color:#8b5cf6;font-weight:bold');
  console.log('%c╠══════════════════════════════════════════╣', 'color:#8b5cf6;font-weight:bold');

  const typeLabel = type === 'COLOR_PATTERN'
    ? '%c  Detected Type: COLOR_PATTERN (彩色图案模式)'
    : '%c  Detected Type: STRUCTURE_PATTERN (结构图案模式)';
  const typeColor = type === 'COLOR_PATTERN' ? 'color:#22c55e;font-weight:bold' : 'color:#f59e0b;font-weight:bold';
  console.log(typeLabel, typeColor);

  console.log(`  ┌─ 特征数据 ─────────────────────────────┐`);
  console.log(`  │  唯一颜色数:     ${String(uniqueColors).padStart(6)}                  │`);
  console.log(`  │  平均饱和度:     ${(avgSaturation * 100).toFixed(1).padStart(6)}%                   │`);
  console.log(`  │  平均亮度:       ${(avgBrightness * 100).toFixed(1).padStart(6)}%                   │`);
  console.log(`  │  线条密度(H+V):  ${lineDensity.toFixed(3).padStart(6)}                  │`);
  console.log(`  │  深色像素占比:   ${(darkPixelRatio * 100).toFixed(1).padStart(6)}%                   │`);
  console.log(`  │  颜色方差:       ${colorVariance.toFixed(3).padStart(6)}                  │`);
  console.log(`  ├─ 评分 ─────────────────────────────────┤`);
  console.log(`  │  COLOR_SCORE:    ${colorScore.toFixed(3).padStart(6)}                  │`);
  console.log(`  │  STRUCT_SCORE:   ${structureScore.toFixed(3).padStart(6)}                  │`);
  console.log(`  └────────────────────────────────────────┘`);

  // Pipeline 提示
  if (type === 'COLOR_PATTERN') {
    console.log('%c  Pipeline: LAB → Median Cut → KMeans → Palette → Grid', 'color:#22c55e');
  } else {
    console.log('%c  Pipeline: Gray → Edge Detection → Contour → FloodFill → Region → Grid', 'color:#f59e0b');
    console.log('%c  ⚠ 已禁用: 颜色聚类 / LAB / Median Cut / KMeans', 'color:#ef4444;font-weight:bold');
  }

  console.log('%c╚══════════════════════════════════════════╝', 'color:#8b5cf6;font-weight:bold');

  return result;
}

/**
 * 结构图模式处理 Pipeline（STRUCTURE_PATTERN 专用）
 *
 * 处理流程：
 *   Stage1: Grayscale (灰度化)
 *   Stage2: Adaptive Threshold (自适应二值化，非固定阈值)
 *   Stage3: Morphological Closing (形态学闭运算，闭合断裂轮廓)
 *   Stage4: Contour Detection + 去除小型连通域 + 保留最大封闭轮廓
 *   Stage5: Flood Fill (泛洪填充，区域分类)
 *
 * 每个阶段输出调试图 PNG 用于诊断轮廓丢失位置
 */
export function processStructurePattern(
  imageData: ImageData,
  targetCols: number,
  targetRows: number,
  actualGridInfo?: GridDetectionResult,
  onProgress?: (stage: string, percent: number) => void
): {
  grid: GridCell[][];
  extractedColors: ExtractedColor[];
  palette: string[];
  debugImages: { stage: string; dataUrl: string }[];
} {
  // ═══════════════════════════════════════
  // ★★★ 入口诊断 — 不可错过 ★★★
  // ═══════════════════════════════════════
  console.log('%c' + '█'.repeat(60), 'color:#f59e0b;font-weight:bold;background:#000');
  console.log('%c★ processStructurePattern 已进入! ★', 'color:#f59e0b;font-weight:bold;background:#000');
  console.log('%c' + '█'.repeat(60), 'color:#f59e0b;font-weight:bold;background:#000');

  const { width, height, data } = imageData;
  const debugImages: { stage: string; dataUrl: string }[] = [];

  // ──────────────────────────────────────
  // Stage 1: Grayscale — 灰度化
  // ──────────────────────────────────────
  onProgress?.('结构图-灰度化', 28);
  console.log('%c[Stage1] Grayscale', 'color:#f59e0b;font-weight:bold');

  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  const stage1Canvas = createDebugCanvas(gray, width, height, 'gray');
  debugImages.push({ stage: 'Stage1_Gray', dataUrl: stage1Canvas.toDataURL('image/png') });

  // ──────────────────────────────────────
  // Stage 2: Adaptive Threshold — 自适应二值化
  // ──────────────────────────────────────
  onProgress?.('结构图-自适应二值化', 32);
  console.log('%c[Stage2] Adaptive Threshold (非固定阈值)', 'color:#f59e0b;font-weight:bold');

  // 使用局部均值自适应阈值（类似 OpenCV adaptiveThreshold with MEAN_C）
  const binary = new Uint8ClampedArray(width * height);
  const blockSize = Math.max(11, Math.floor(Math.min(width, height) / 25)); // 奇数块大小
  const halfBlock = Math.floor(blockSize / 2);
  const C = 5; // 常数偏移

  // 先计算积分图像加速局部均值
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= width; x++) {
      const idx = (y - 1) * width + (x - 1);
      integral[y * (width + 1) + x] =
        gray[idx] +
        integral[(y - 1) * (width + 1) + x] +
        integral[y * (width + 1) + (x - 1)] -
        integral[(y - 1) * (width + 1) + (x - 1)];
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const y0 = Math.max(0, y - halfBlock);
      const y1 = Math.min(height - 1, y + halfBlock);
      const x0 = Math.max(0, x - halfBlock);
      const x1 = Math.min(width - 1, x + halfBlock);

      const count = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];

      const localMean = sum / count;
      const idx = y * width + x;
      binary[idx] = gray[idx] < (localMean - C) ? 0 : 255; // 深色=前景(0), 浅色=背景(255)
    }
  }

  const stage2Canvas = createDebugCanvas(binary, width, height, 'binary');
  debugImages.push({ stage: 'Stage2_Binary', dataUrl: stage2Canvas.toDataURL('image/png') });
  console.log(`[Stage2] blockSize=${blockSize}, C=${C}, 黑像素占比: ${countPixels(binary, 0, width, height).toFixed(2)}%`);

  // ──────────────────────────────────────
  // Stage 2.5: Grid Removal — 检测并删除规则网格线
  // ──────────────────────────────────────
  onProgress?.('结构图-网格线移除', 33);
  console.log('%c[Stage2.5] Grid Removal (检测规则网格线 → 删除 → 保留非规则轮廓)', 'color:#f59e0b;font-weight:bold');

  const gridResult = removeGridLines(binary, width, height);

  const stage25Canvas = createDebugCanvas(gridResult.cleaned, width, height, 'binary');
  debugImages.push({ stage: 'Stage2_GridRemoved', dataUrl: stage25Canvas.toDataURL('image/png') });
  console.log(`[Stage2.5] 网格线移除完成`);

  // ════════════════════════════════════
  // 调试图: GridOverlay.png — 红色垂直线 + 蓝色水平线 + 绿色格子中心点
  // ════════════════════════════════════
  {
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const ovCtx = overlayCanvas.getContext('2d')!;

    // 绘制原始二值图作为底图（灰度）
    const imgData = new ImageData(width, height);
    for (let i = 0; i < binary.length; i++) {
      const v = binary[i];
      imgData.data[i * 4] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }
    ovCtx.putImageData(imgData, 0, 0);

    const { gridRows, gridCols } = gridResult;

    // 绘制水平网格线 — 蓝色
    if (gridRows.length > 0) {
      ovCtx.strokeStyle = '#3b82f6';
      ovCtx.lineWidth = 1;
      ovCtx.globalAlpha = 0.7;
      for (const row of gridRows) {
        ovCtx.beginPath();
        ovCtx.moveTo(0, row);
        ovCtx.lineTo(width, row);
        ovCtx.stroke();
      }
    }

    // 绘制垂直网格线 — 红色
    if (gridCols.length > 0) {
      ovCtx.strokeStyle = '#ef4444';
      ovCtx.lineWidth = 1;
      ovCtx.globalAlpha = 0.7;
      for (const col of gridCols) {
        ovCtx.beginPath();
        ovCtx.moveTo(col, 0);
        ovCtx.lineTo(col, height);
        ovCtx.stroke();
      }
    }

    // 计算格子中心点 — 相邻网格线的中点
    ovCtx.globalAlpha = 1.0;
    const cellCenters: { cx: number; cy: number }[] = [];
    if (gridRows.length >= 2 && gridCols.length >= 2) {
      for (let ri = 0; ri < gridRows.length - 1; ri++) {
        const y0 = gridRows[ri];
        const y1 = gridRows[ri + 1];
        const cy = Math.round((y0 + y1) / 2);
        for (let ci = 0; ci < gridCols.length - 1; ci++) {
          const x0 = gridCols[ci];
          const x1 = gridCols[ci + 1];
          const cx = Math.round((x0 + x1) / 2);
          cellCenters.push({ cx, cy });
        }
      }
    }

    // 绘制格子中心点 — 绿色
    ovCtx.fillStyle = '#22c55e';
    for (const pt of cellCenters) {
      ovCtx.fillRect(pt.cx - 1, pt.cy - 1, 3, 3);
    }

    // 状态叠加面板
    ovCtx.fillStyle = 'rgba(0,0,0,0.75)';
    ovCtx.fillRect(4, 4, 320, 110);
    ovCtx.fillStyle = '#ffffff';
    ovCtx.font = '11px monospace';

    // 计算统计量
    const avgCellW = gridCols.length >= 2
      ? (() => { const gaps = []; for (let i = 1; i < gridCols.length; i++) gaps.push(gridCols[i] - gridCols[i-1]); return gaps.reduce((a,b)=>a+b,0)/gaps.length; })()
      : 0;
    const avgCellH = gridRows.length >= 2
      ? (() => { const gaps = []; for (let i = 1; i < gridRows.length; i++) gaps.push(gridRows[i] - gridRows[i-1]); return gaps.reduce((a,b)=>a+b,0)/gaps.length; })()
      : 0;

    ovCtx.fillText(`Grid Rows:     ${gridRows.length}  (H-lines, blue)`, 10, 20);
    ovCtx.fillText(`Grid Cols:     ${gridCols.length}  (V-lines, red)`, 10, 34);
    ovCtx.fillText(`Avg Cell W:    ${avgCellW.toFixed(1)}px`, 10, 48);
    ovCtx.fillText(`Avg Cell H:    ${avgCellH.toFixed(1)}px`, 10, 62);
    ovCtx.fillText(`Cell Centers:  ${cellCenters.length}  (green dots)`, 10, 76);
    ovCtx.fillText(`Image Size:    ${width}x${height}`, 10, 90);

    debugImages.push({ stage: 'GridOverlay', dataUrl: overlayCanvas.toDataURL('image/png') });

    console.log('%c╔══════════════════════════════════════╗', 'color:#22c55e;font-weight:bold');
    console.log('%c║       GridOverlay 网格检测报告         ║', 'color:#22c55e;font-weight:bold');
    console.log('%c╠══════════════════════════════════════╣', 'color:#22c55e');
    console.log(`║  Grid Rows (水平线):   ${String(gridRows.length).padStart(5)}              ║`);
    console.log(`║  Grid Cols (垂直线):   ${String(gridCols.length).padStart(5)}              ║`);
    console.log(`║  Avg Cell Width:       ${avgCellW.toFixed(1).padStart(7)} px            ║`);
    console.log(`║  Avg Cell Height:      ${avgCellH.toFixed(1).padStart(7)} px            ║`);
    console.log(`║  Total Cells:           ${String(cellCenters.length).padStart(5)}              ║`);

    if (gridRows.length >= 2) {
      const rowGaps = [];
      for (let i = 1; i < gridRows.length; i++) rowGaps.push(gridRows[i] - gridRows[i - 1]);
      rowGaps.sort((a, b) => a - b);
      console.log(`║  Row Gap Range:        ${rowGaps[0]} ~ ${rowGaps[rowGaps.length-1]} px       ║`);
    }
    if (gridCols.length >= 2) {
      const colGaps = [];
      for (let i = 1; i < gridCols.length; i++) colGaps.push(gridCols[i] - gridCols[i - 1]);
      colGaps.sort((a, b) => a - b);
      console.log(`║  Col Gap Range:        ${colGaps[0]} ~ ${colGaps[colGaps.length-1]} px       ║`);
    }
    console.log('%c╚══════════════════════════════════════╝', 'color:#22c55e');
  }

  // ──────────────────────────────────────
  // Stage 3: Morphological Closing — 形态学闭运算
  // ──────────────────────────────────────
  onProgress?.('结构图-形态学闭运算', 35);
  console.log('%c[Stage3] Morphological Closing (闭合断裂轮廓)', 'color:#f59e0b;font-weight:bold');

  const closed = morphClose(gridResult.cleaned, width, height, 3); // 3x3 结构元素

  const stage3Canvas = createDebugCanvas(closed, width, height, 'binary');
  debugImages.push({ stage: 'Stage3_Contours', dataUrl: stage3Canvas.toDataURL('image/png') });
  console.log(`[Stage3] 闭运算完成`);

  // ──────────────────────────────────────
  // Stage 4: Contour Detection — 轮廓检测 + 过滤 + 诊断
  // ──────────────────────────────────────
  onProgress?.('结构图-轮廓提取与过滤', 38);
  console.log('%c[Stage4] Contour Detection', 'color:#f59e0b;font-weight:bold');

  // 连通域分析（使用 BFS 标记）
  const labeled = labelConnectedComponents(closed, width, height);

  // 统计每个连通域面积和特征
  interface ComponentInfo {
    area: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    touchesEdge: boolean;
    aspectRatio: number;
    solidity: number; // 面积/外接矩形面积（越接近1越像实心块，越小越像线条/文字）
    perimeter: number;
  }
  const componentStats = new Map<number, ComponentInfo>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labeled[y * width + x];
      if (label === 0) continue;
      if (!componentStats.has(label)) {
        componentStats.set(label, { area: 0, bbox: { minX: x, minY: y, maxX: x, maxY: y }, touchesEdge: false, aspectRatio: 0, solidity: 0, perimeter: 0 });
      }
      const stat = componentStats.get(label)!;
      stat.area++;
      stat.bbox.minX = Math.min(stat.bbox.minX, x);
      stat.bbox.minY = Math.min(stat.bbox.minY, y);
      stat.bbox.maxX = Math.max(stat.bbox.maxX, x);
      stat.bbox.maxY = Math.max(stat.bbox.maxY, y);
    }
  }

  // 计算每个连通域的额外特征
  const sortedComponents: Array<{ label: number; info: ComponentInfo }> = [];
  componentStats.forEach((stat, label) => {
    const bw = stat.bbox.maxX - stat.bbox.minX + 1;
    const bh = stat.bbox.maxY - stat.bbox.minY + 1;
    const bboxArea = bw * bh;

    // 边缘接触检测
    stat.touchesEdge =
      stat.bbox.minX <= 2 || stat.bbox.minY <= 2 ||
      stat.bbox.maxX >= width - 3 || stat.bbox.maxY >= height - 3;

    stat.aspectRatio = bh > 0 ? bw / bh : 0;
    stat.solidity = bboxArea > 0 ? stat.area / bboxArea : 0;

    // 周长估算：用边界像素数近似
    let periCount = 0;
    for (let y = stat.bbox.minY; y <= stat.bbox.maxY; y++) {
      for (let x = stat.bbox.minX; x <= stat.bbox.maxX; x++) {
        if (labeled[y * width + x] === label) {
          // 检查是否有相邻非同类像素（边界）
          const hasDiffNeighbor =
            (y > 0 && labeled[(y - 1) * width + x] !== label) ||
            (y < height - 1 && labeled[(y + 1) * width + x] !== label) ||
            (x > 0 && labeled[y * width + x - 1] !== label) ||
            (x < width - 1 && labeled[y * width + x + 1] !== label);
          if (hasDiffNeighbor || y === stat.bbox.minY || y === stat.bbox.maxY || x === stat.bbox.minX || x === stat.bbox.maxX) {
            periCount++;
          }
        }
      }
    }
    stat.perimeter = periCount;

    sortedComponents.push({ label, info: stat });
  });

  // 按周长(perimeter)排序（大到小）— 选择周长最大的闭合轮廓作为主轮廓
  sortedComponents.sort((a, b) => b.info.perimeter - a.info.perimeter);

  // 判定主轮廓：非边缘接触的、周长最大的闭合轮廓
  const nonEdgeComponents = sortedComponents.filter(c => !c.info.touchesEdge);
  const mainCandidate = nonEdgeComponents.length > 0 ? nonEdgeComponents[0] : null;
  const mainLabel = mainCandidate?.label || 0;
  const maxPerimeter = mainCandidate?.info.perimeter || 0;

  // 计算总前景面积（用于文字检测阈值）
  const totalForeground = Array.from(componentStats.values()).reduce((sum, s) => sum + s.area, 0);

  // 文字/数字检测：solidity 高且面积小的 → 可能是文字
  const textCandidates = sortedComponents.filter(c =>
    c.info.area < totalForeground * 0.02 &&  // 面积小于总前景的 2%
    c.info.solidity > 0.3 &&                // 实心度高
    c.info.aspectRatio > 0.2 && c.info.aspectRatio < 5 &&
    c.label !== mainLabel                   // 不是主轮廓
  );

  // 轮廓闭合性检测：检查主轮廓边界是否形成完整闭环
  let isMainContourClosed = false;
  if (mainLabel > 0) {
    const mainStat = componentStats.get(mainLabel)!;
    const bw = mainStat.bbox.maxX - mainStat.bbox.minX + 1;
    const bh = mainStat.bbox.maxY - mainStat.bbox.minY + 1;
    // 取轮廓中心点附近的一个白点作为种子
    const cx = Math.round((mainStat.bbox.minX + mainStat.bbox.maxX) / 2);
    const cy = Math.round((mainStat.bbox.minY + mainStat.bbox.maxY) / 2);

    // 从中心向外搜索白点（在 closed 图上搜索，因为 filtered 还未创建）
    let seedX = -1, seedY = -1;
    for (let r = 0; r < Math.max(bw, bh); r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= 0 && tx < width && ty >= 0 && ty < height && closed[ty * width + tx] === 255) {
          seedX = tx; seedY = ty;
          break;
        }
      }
      if (seedX >= 0) break;
    }

    if (seedX >= 0) {
      // 从种子点 BFS，看能否到达边缘（在 closed 上做 BFS）
      const ffVisited = new Uint8Array(width * height);
      const ffQueue: number[] = [seedY * width + seedX];
      ffVisited[seedY * width + seedX] = 1;
      let reachedEdge = false;

      while (ffQueue.length > 0 && !reachedEdge) {
        const idx = ffQueue.shift()!;
        const fy = Math.floor(idx / width);
        const fx = idx % width;
        if (fy <= 1 || fy >= height - 2 || fx <= 1 || fx >= width - 2) {
          reachedEdge = true;
          break;
        }
        for (const nIdx of [fy > 0 ? idx - width : -1, fy < height - 1 ? idx + width : -1, fx > 0 ? idx - 1 : -1, fx < width - 1 ? idx + 1 : -1]) {
          if (nIdx >= 0 && !ffVisited[nIdx] && closed[nIdx] === 255) {
            ffVisited[nIdx] = 1;
            ffQueue.push(nIdx);
          }
        }
      }
      isMainContourClosed = !reachedEdge;
    } else {
      isMainContourClosed = true;
    }
  }

  // ════════════════════════════════════
  // 调试图 1: Contour.png — 所有连通域彩色标记
  // ════════════════════════════════════
  const allContoursCanvas = document.createElement('canvas');
  allContoursCanvas.width = width;
  allContoursCanvas.height = height;
  const acCtx = allContoursCanvas.getContext('2d')!;
  acCtx.fillStyle = '#ffffff';
  acCtx.fillRect(0, 0, width, height);

  const contourColors = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  sortedComponents.forEach((c, rank) => {
    const color = c.label === mainLabel ? '#ff0000' : contourColors[rank % contourColors.length];
    acCtx.fillStyle = color;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labeled[y * width + x] === c.label) {
          acCtx.fillRect(x, y, 1, 1);
        }
      }
    }
  });
  debugImages.push({ stage: 'Binary', dataUrl: stage2Canvas.toDataURL('image/png') });
  debugImages.push({ stage: 'Contour', dataUrl: allContoursCanvas.toDataURL('image/png') });

  // ════════════════════════════════════
  // 调试图 2: MainContour.png — 仅主轮廓(红色)+闭合状态标注
  // ════════════════════════════════════
  const mainContourCanvas = document.createElement('canvas');
  mainContourCanvas.width = width;
  mainContourCanvas.height = height;
  const mcCtx = mainContourCanvas.getContext('2d')!;
  mcCtx.fillStyle = '#ffffff';
  mcCtx.fillRect(0, 0, width, height);

  // 绘制主轮廓为红色
  mcCtx.fillStyle = '#ff0000';
  if (mainLabel > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (labeled[y * width + x] === mainLabel) {
          mcCtx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // 在图片上绘制状态文本
  mcCtx.fillStyle = 'rgba(0,0,0,0.7)';
  mcCtx.fillRect(4, 4, 280, 70);
  mcCtx.fillStyle = '#ffffff';
  mcCtx.font = '12px monospace';
  mcCtx.fillText(`Contour Count: ${componentStats.size}`, 10, 20);
  mcCtx.fillText(`Largest Perimeter: ${maxPerimeter}px (${(maxPerimeter / (width * height) * 100).toFixed(1)}%)`, 10, 36);
  mcCtx.fillText(`Main Closed: ${isMainContourClosed ? 'TRUE ✓' : 'FALSE ✗ (GAP!)'}`, 10, 52);
  mcCtx.fillText(`Text Candidates: ${textCandidates.length}`, 10, 68);

  debugImages.push({ stage: 'MainContour', dataUrl: mainContourCanvas.toDataURL('image/png') });

  // ════════════════════════════════════
  // 关键诊断输出
  // ════════════════════════════════════
  console.log('%c╔══════════════════════════════════════════════╗', 'color:#ef4444;font-weight:bold');
  console.log('%c║       Stage4 轮廓诊断                          ║', 'color:#ef4444;font-weight:bold');
  console.log('%c╠══════════════════════════════════════════════╣', 'color:#ef4444;font-weight:bold');
  console.log(`║  Contour Count:     ${String(componentStats.size).padStart(6)}                      ║`);
  console.log(`║  Largest Perimeter:  ${String(maxPerimeter).padStart(6)} px (${(maxPerimeter / (width * height) * 100).toFixed(2)}%)           ║`);
  console.log(`║  Main Label:        ${String(mainLabel).padStart(6)}                      ║`);
  console.log(`║  Main Closed:       ${String(isMainContourClosed).padStart(6)}  ${isMainContourClosed ? '✓ 无缺口' : '✗ 有缺口! 泄漏风险'}              ║`);
  console.log(`║  Edge-Touching:     ${String(sortedComponents.filter(c => c.info.touchesEdge).length).padStart(6)} (已排除)               ║`);
  console.log(`║  Text Candidates:   ${String(textCandidates.length).padStart(6)} (疑似文字/数字)         ║`);

  if (textCandidates.length > 0) {
    console.log('%c║  ── 文字候选详情 ──────────────────────────── ║', 'color:#f59e0b');
    textCandidates.slice(0, 8).forEach((tc, i) => {
      console.log(`║    #${i + 1} area=${tc.info.area} solid=${tc.info.solidity.toFixed(2)} ratio=${tc.info.aspectRatio.toFixed(2)} edge=${tc.info.touchesEdge}  ║`);
    });
  }

  // Top 5 连通域详情
  console.log('%c║  ── Top 5 连通域 ───────────────────────────── ║', 'color:#8b5cf6');
  sortedComponents.slice(0, 5).forEach((c, i) => {
    const isMainMark = c.label === mainLabel ? ' ★MAIN' : '';
    const edgeMark = c.info.touchesEdge ? ' [EDGE]' : '';
    console.log(`║    #${i + 1} L${c.label} area=${c.info.area.toString().padStart(6)} solid=${c.info.solidity.toFixed(3)} ratio=${c.info.aspectRatio.toFixed(2)}${isMainMark}${edgeMark}  ║`);
  });
  console.log('%c╚══════════════════════════════════════════════╝', 'color:#ef4444;font-weight:bold');

  // 构建过滤后的二值图（只保留主轮廓）
  const filtered = new Uint8ClampedArray(width * height);
  for (let i = 0; i < filtered.length; i++) {
    const label = labeled[i];
    if (label === mainLabel) {
      filtered[i] = 0; // 主轮廓 → 黑
    } else {
      filtered[i] = 255; // 其他全部变白
    }
  }

  // ──────────────────────────────────────
  // Stage 5: Flood Fill — 泛洪填充分类
  // ──────────────────────────────────────
  onProgress?.('结构图-泛洪填充', 42);
  console.log('%c[Stage5] Flood Fill (红=边缘连通 蓝=被包围 黑=轮廓)', 'color:#f59e0b;font-weight:bold');

  // 对 filtered 图像执行反向泛洪：从边缘开始填充白色区域
  const floodResult = floodFillClassify(filtered, width, height);

  // ════════════════════════════════════
  // 调试图 3: FloodFill.png — 红=outer 蓝=inner 黑=contour
  // ════════════════════════════════════
  const ffCanvas = document.createElement('canvas');
  ffCanvas.width = width;
  ffCanvas.height = height;
  const ffx = ffCanvas.getContext('2d')!;

  // 先画背景
  ffx.fillStyle = '#1a1a2e';
  ffx.fillRect(0, 0, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type = floodResult[y * width + x]; // 0=outer(红), 1=inner(蓝), 2=contour(黑)
      switch (type) {
        case 0: ffx.fillStyle = '#ef4444'; break; // outer → 红色 (与边缘连通)
        case 1: ffx.fillStyle = '#3b82f6'; break; // inner → 蓝色 (被包围)
        case 2: ffx.fillStyle = '#000000'; break; // contour → 黑色
      }
      ffx.fillRect(x, y, 1, 1);
    }
  }

  // 状态叠加
  ffx.fillStyle = 'rgba(255,255,255,0.85)';
  ffx.fillRect(4, 4, 260, 56);
  ffx.fillStyle = '#000000';
  ffx.font = '11px monospace';
  let outerPx = 0, innerPx = 0, contourPx = 0;
  for (let i = 0; i < floodResult.length; i++) {
    if (floodResult[i] === 0) outerPx++;
    else if (floodResult[i] === 1) innerPx++;
    else contourPx++;
  }
  ffx.fillText(`Red(Outer): ${outerPx} (${(outerPx/floodResult.length*100).toFixed(1)}%)`, 10, 19);
  ffx.fillText(`Blue(Inner): ${innerPx} (${(innerPx/floodResult.length*100).toFixed(1)}%)`, 10, 34);
  ffx.fillText(`Black(Contour): ${contourPx} (${(contourPx/floodResult.length*100).toFixed(1)}%)`, 10, 49);
  ffx.fillText(isMainContourClosed ? 'No Leakage' : '⚠ LEAKAGE DETECTED!', 10, 64);

  debugImages.push({ stage: 'FloodFill', dataUrl: ffCanvas.toDataURL('image/png') });

  // ════════════════════════════════════
  // FloodFill 结果校正：Inner/Outer 反转检测
  //
  // 问题场景：
  //   主轮廓（如背景网格线）包围了大部分图像区域
  //   导致 FloodFill 只能到达边缘少量像素 → 大量区域被标记为 inner(Hole)
  //   结果：Hole=1985, EmptyGrid=611 （应反过来）
  //
  // 校正规则：
  //   如果 Inner 像素占比 > 50%，说明轮廓包围了大部分图像
  //   此时应该反转：大区域=Outer(EmptyGrid)，小区域=Inner(Hole)
  // ════════════════════════════════════
  {
    let fOuter = 0, fInner = 0;
    for (let i = 0; i < floodResult.length; i++) {
      if (floodResult[i] === 0) fOuter++;
      else if (floodResult[i] === 1) fInner++;
    }
    const innerRatio = fInner / (fOuter + fInner);

    if (innerRatio > 0.5) {
      console.log('%c╔══════════════════════════════════════════════╗', 'color:#f59e0b;font-weight:bold');
      console.log('%c║  FloodFill 反转检测                        ║', 'color:#f59e0b;font-weight:bold');
      console.log('%c╠══════════════════════════════════════════════╣', 'color:#f59e0b');
      console.log(`║  Inner 占比: ${((innerRatio * 100).toFixed(1))}% > 50% → 触发反转!     ║`);
      console.log(`║  反转前: Outer=${fOuter}, Inner=${fInner}              ║`);

      // 反转：inner ↔ outer（contour 保持不变）
      for (let i = 0; i < floodResult.length; i++) {
        if (floodResult[i] === 0) floodResult[i] = 1;   // outer → inner
        else if (floodResult[i] === 1) floodResult[i] = 0; // inner → outer
      }

      let newOuter = 0, newInner = 0;
      for (let i = 0; i < floodResult.length; i++) {
        if (floodResult[i] === 0) newOuter++;
        else if (floodResult[i] === 1) newInner++;
      }
      console.log(`║  反转后: Outer=${newOuter}, Inner=${newInner}              ║`);
      console.log('║  ✅ 已反转: 大区域→EmptyGrid, 小区域→Hole    ║');
      console.log('%c╚══════════════════════════════════════════════╝', 'color:#f59e0b');

      // 更新调试图显示
      const invCanvas = document.createElement('canvas');
      invCanvas.width = width;
      invCanvas.height = height;
      const ix = invCanvas.getContext('2d')!;
      ix.fillStyle = '#1a1a2e';
      ix.fillRect(0, 0, width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const t = floodResult[y * width + x];
          switch (t) {
            case 0: ix.fillStyle = '#ef4444'; break; // outer → 红
            case 1: ix.fillStyle = '#3b82f6'; break; // inner → 蓝
            case 2: ix.fillStyle = '#000000'; break; // contour → 黑
          }
          ix.fillRect(x, y, 1, 1);
        }
      }
      ix.fillStyle = 'rgba(255,255,255,0.85)';
      ix.fillRect(4, 4, 280, 40);
      ix.fillStyle = '#000';
      ix.font = '11px monospace';
      ix.fillText(`INVERTED: Outer=${newOuter} Inner=${newInner}`, 10, 18);
      ix.fillText(`(Original: ${fOuter}/${fInner} → Swapped)`, 10, 34);
      debugImages.push({ stage: 'FloodFill-Inverted', dataUrl: invCanvas.toDataURL('image/png') });
    } else {
      console.log(`[FloodFill] Inner占比=${(innerRatio*100).toFixed(1)}% (<50%)，无需反转`);
    }
  }

  // ════════════════════════════════════
  // ★★★ 关键诊断：Inner 像素边界框 ★★★
  // 确认 FloodFill 的 Inner 区域在图像中的实际位置
  // ════════════════════════════════════
  {
    let innerMinX = width, innerMaxX = 0, innerMinY = height, innerMaxY = 0;
    let innerPixelCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (floodResult[y * width + x] === 1) {
          innerMinX = Math.min(innerMinX, x);
          innerMaxX = Math.max(innerMaxX, x);
          innerMinY = Math.min(innerMinY, y);
          innerMaxY = Math.max(innerMaxY, y);
          innerPixelCount++;
        }
      }
    }

    const innerCenterX = (innerMinX + innerMaxX) / 2;
    const innerCenterY = (innerMinY + innerMaxY) / 2;
    const innerWidth = innerMaxX - innerMinX + 1;
    const innerHeight = innerMaxY - innerMinY + 1;

    console.log('%c' + '█'.repeat(60), 'color:#f59e0b;font-weight:bold;background:#000');
    console.log('%c★ FloodFill Inner 区域边界框 ★', 'color:#f59e0b;font-weight:bold;background:#000');
    console.log(`%c  图像尺寸: ${width} x ${height}`, 'color:#f59e0b;font-weight:bold');
    console.log(`%c  Inner 像素数: ${innerPixelCount} (${(innerPixelCount/(width*height)*100).toFixed(1)}%)`, 'color:#f59e0b;font-weight:bold');
    console.log(`%c  Inner 边界框: X=[${innerMinX}, ${innerMaxX}] Y=[${innerMinY}, ${innerMaxY}]`, 'color:#f59e0b;font-weight:bold');
    console.log(`%c  Inner 尺寸: ${innerWidth} x ${innerHeight}`, 'color:#f59e0b;font-weight:bold');
    console.log(`%c  Inner 中心: (${innerCenterX.toFixed(0)}, ${innerCenterY.toFixed(0)})`, 'color:#f59e0b;font-weight:bold');
    console.log(`%c  Inner 相对位置: X=${(innerCenterX/width*100).toFixed(0)}% Y=${(innerCenterY/height*100).toFixed(0)}%`, 'color:#f59e0b;font-weight:bold');

    // 判断：Inner 是否在图像中心区域（领口应在中心偏上）
    const isInnerCentral =
      innerCenterX > width * 0.2 && innerCenterX < width * 0.8 &&
      innerCenterY > height * 0.15 && innerCenterY < height * 0.85;

    if (!isInnerCentral) {
      console.log('%c  ⚠️ Inner 区域不在图像中心! 可能坐标映射错误!', 'color:#ef4444;font-weight:bold;background:#000');
    } else {
      console.log('%c  ✓ Inner 区域位于图像中心（符合领口预期）', 'color:#22c55e;font-weight:bold;background:#000');
    }
    console.log('%c' + '█'.repeat(60), 'color:#f59e0b;font-weight:bold;background:#000');
  }

  // ──────────────────────────────────────
  // 生成网格
  // ──────────────────────────────────────
  onProgress?.('结构图-生成网格', 46);
  console.log('[Pipeline] STRUCTURE_MODE: 基于轮廓+泛洪结果生成网格');

  const finalCols = actualGridInfo && actualGridInfo.cols > 0 ? actualGridInfo.cols : targetCols;
  const finalRows = actualGridInfo && actualGridInfo.rows > 0 ? actualGridInfo.rows : targetRows;

  // ══════════════════════════════════════════
  // 结构图模式：强制使用均匀网格分布
  //
  // 原因：detectGridSize 返回的 vLinePositions/hLinePositions
  //       坐标可能与 floodResult 不匹配（检测线位置偏差、
  //       边缘裁剪不一致等），导致 CellTypeOverlay 与
  //       FloodFill 结果完全错位。
  //
  // 均匀分布保证：
  //   vLines[0]=0, vLines[finalCols]=width
  //   hLines[0]=0, hLines[finalRows]=height
  //   每个格子的采样坐标直接对应 floodResult 索引
  // ══════════════════════════════════════════
  const vLines = Array.from({ length: finalCols + 1 }, (_, i) => (i * width) / finalCols);
  const hLines = Array.from({ length: finalRows + 1 }, (_, i) => (i * height) / finalRows);

  console.log(`[StructurePattern Grid] 强制均匀分布: ${finalCols}cols x ${finalRows}rows`);
  console.log(`[StructurePattern Grid] vLines: [${vLines[0].toFixed(1)}, ..., ${vLines[finalCols].toFixed(1)}] (image width=${width})`);
  console.log(`[StructurePattern Grid] hLines: [${hLines[0].toFixed(1)}, ..., ${hLines[finalRows].toFixed(1)}] (image height=${height})`);

  if (actualGridInfo?.vLinePositions.length) {
    console.log(`[StructurePattern Grid] ⚠️ 已忽略 detectGridSize 的 vLinePositions(${actualGridInfo.vLinePositions.length}条)，使用均匀分布`);
  }
  if (actualGridInfo?.hLinePositions.length) {
    console.log(`[StructurePattern Grid] ⚠️ 已忽略 detectGridSize 的 hLinePositions(${actualGridInfo.hLinePositions.length}条)，使用均匀分布`);
  }

  // ════════════════════════════════════
  // GridOnFloodFill 调试图：网格线叠加在FloodFill上
  // 用于验证坐标映射是否正确
  // ════════════════════════════════════
  {
    const gfCanvas = document.createElement('canvas');
    gfCanvas.width = width;
    gfCanvas.height = height;
    const gfx = gfCanvas.getContext('2d')!;

    // 绘制 FloodFill 底图
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = floodResult[y * width + x];
        switch (t) {
          case 0: gfx.fillStyle = '#3b82f6'; break; // outer → 蓝
          case 1: gfx.fillStyle = '#ef4444'; break; // inner → 红
          case 2: gfx.fillStyle = '#000000'; break; // contour → 黑
        }
        gfx.fillRect(x, y, 1, 1);
      }
    }

    // 叠加网格线（白色半透明）
    gfx.strokeStyle = 'rgba(255,255,255,0.7)';
    gfx.lineWidth = 1;
    for (let i = 0; i < vLines.length; i++) {
      gfx.beginPath();
      gfx.moveTo(vLines[i], 0);
      gfx.lineTo(vLines[i], height);
      gfx.stroke();
    }
    for (let i = 0; i < hLines.length; i++) {
      gfx.beginPath();
      gfx.moveTo(0, hLines[i]);
      gfx.lineTo(width, hLines[i]);
      gfx.stroke();
    }

    // 标注信息面板
    gfx.fillStyle = 'rgba(0,0,0,0.8)';
    gfx.fillRect(4, 4, 340, 70);
    gfx.fillStyle = '#fff';
    gfx.font = '11px monospace';
    gfx.fillText(`Image: ${width}x${height}`, 10, 18);
    gfx.fillText(`Grid: ${finalCols} cols x ${finalRows} rows`, 10, 32);
    gfx.fillText(`vLines: [${vLines[0]?.toFixed(0)}, ..., ${vLines[vLines.length-1]?.toFixed(0)}]`, 10, 46);
    gfx.fillText(`hLines: [${hLines[0]?.toFixed(0)}, ..., ${hLines[hLines.length-1]?.toFixed(0)}]`, 10, 60);

    debugImages.push({ stage: 'GridOnFloodFill', dataUrl: gfCanvas.toDataURL('image/png') });

    console.log(`[GridOnFloodFill] Image=${width}x${height}, Grid=${finalCols}x${finalRows}`);
    console.log(`[GridOnFloodFill] vLines count=${vLines.length}, range=[${vLines[0]?.toFixed(1)}, ${vLines[vLines.length-1]?.toFixed(1)}]`);
    console.log(`[GridOnFloodFill] hLines count=${hLines.length}, range=[${hLines[0]?.toFixed(1)}, ${hLines[hLines.length-1]?.toFixed(1)}]`);
  }

  // ════════════════════════════════════
  // 坐标映射诊断：vLines/hLines vs 图像尺寸 vs FloodFill
  // ════════════════════════════════════
  console.log('%c╔══════════════════════════════════════════════════╗', 'color:#f59e0b;font-weight:bold');
  console.log('%c║       坐标映射诊断 (Coordinate Mapping)          ║', 'color:#f59e0b;font-weight:bold');
  console.log('%c╠══════════════════════════════════════════════════╣', 'color:#f59e0b');
  console.log(`║  Image Size:     ${String(width).padStart(6)} x ${String(height).padStart(6)}                  ║`);
  console.log(`║  Grid:           ${String(finalCols).padStart(6)} cols x ${String(finalRows).padStart(6)} rows            ║`);
  console.log(`║  vLines count:   ${String(vLines.length).padStart(6)}                          ║`);
  console.log(`║  hLines count:   ${String(hLines.length).padStart(6)}                          ║`);
  console.log('%c╠══════════════════════════════════════════════════╣', 'color:#f59e0b');
  console.log(`║  vLines (前5):   [${vLines.slice(0,5).map(v=>v?.toFixed(1)).join(', ')}]        ║`);
  console.log(`║  vLines (后5):   [..., ${vLines.slice(-5).map(v=>v?.toFixed(1)).join(', ')}]  ║`);
  console.log(`║  hLines (前5):   [${hLines.slice(0,5).map(h=>h?.toFixed(1)).join(', ')}]        ║`);
  console.log(`║  hLines (后5):   [..., ${hLines.slice(-5).map(h=>h?.toFixed(1)).join(', ')}]  ║`);
  console.log('%c╠══════════════════════════════════════════════════╣', 'color:#f59e0b');

  // 检查 vLines/hLines 是否在图像范围内
  const vMax = Math.max(...vLines.filter(v => typeof v === 'number' && !isNaN(v)));
  const hMax = Math.max(...hLines.filter(h => typeof h === 'number' && !isNaN(h)));
  const vMin = Math.min(...vLines.filter(v => typeof v === 'number' && !isNaN(v)));
  const hMin = Math.min(...hLines.filter(h => typeof h === 'number' && !isNaN(h)));
  console.log(`║  vLine range:    ${vMin.toFixed(1)} ~ ${vMax.toFixed(1)}  (image width=${width})  ${vMax > width ? '⚠️超出!' : '✓ OK'}  ║`);
  console.log(`║  hLine range:    ${hMin.toFixed(1)} ~ ${hMax.toFixed(1)}  (image height=${height}) ${hMax > height ? '⚠️超出!' : '✓ OK'}  ║`);

  // 检查是否有 NaN/undefined
  const vNaN = vLines.filter(v => v === undefined || v === null || (typeof v === 'number' && isNaN(v))).length;
  const hNaN = hLines.filter(h => h === undefined || h === null || (typeof h === 'number' && isNaN(h))).length;
  if (vNaN > 0 || hNaN > 0) {
    console.log(`%c║  ⚠️ NaN/undefined: vLines=${vNaN}, hLines=${hNaN}              ║`, 'color:#ef4444;font-weight:bold');
  } else {
    console.log(`║  NaN check:      ✓ 无 NaN/undefined                      ║`);
  }
  console.log('%c╚══════════════════════════════════════════════════╝', 'color:#f59e0b');

  // 中心格子采样预检：FloodFill 中心的像素类型是什么？
  const centerPx = Math.floor(width / 2);
  const centerPy = Math.floor(height / 2);
  const quarterPx = Math.floor(width / 4);
  const quarterPy = Math.floor(height / 4);
  console.log(`[坐标预检] 图像中心(${centerPx},${centerPx}) floodType=${floodResult[centerPy * width + centerPx]}`);
  console.log(`[坐标预检] 1/4位置(${quarterPx},${quarterPy}) floodType=${floodResult[quarterPy * width + quarterPx]}`);
  console.log(`[坐标预检] 3/4位置(${quarterPx*3},${quarterPy*3}) floodType=${floodResult[quarterPy*3*width+quarterPx*3]}`);

  // ══════════════════════════════════════════
  // ★★★ V型边缘能量评分 + Grid Region Propagation ★★★
  //
  // 新方案（替代旧的 edgeRatio 边缘采样）：
  //   Phase 1: calculateLineEnergy() — 沿格子中心线采样灰度剖面，
  //            计算V型能量评分（网格线在灰度剖面上呈现V形特征）
  //   Phase 2: Grid Region Propagation — 空间传播平滑，
  //            利用网格线的连续性增强信号
  //   Phase 3: combinedGridScore — 综合评分 → EmptyGrid/Hole 分类
  // ══════════════════════════════════════════

  console.log('%c' + '█'.repeat(60), 'color:#22c55e;font-weight:bold;background:#000');
  console.log('%c★ V型边缘能量评分 + Grid Region Propagation ★', 'color:#22c55e;font-weight:bold;background:#000');
  console.log(`%c  Grid: ${finalCols} x ${finalRows}, Image: ${width} x ${height}`, 'color:#22c55e;font-weight:bold');
  console.log('%c' + '█'.repeat(60), 'color:#22c55e;font-weight:bold;background:#000');

  // ──────────────────────────────────────
  // Phase 1: calculateLineEnergy() — V型灰度剖面能量评分
  //
  // 原理：
  //   对每个格子，沿水平和垂直方向穿过格子中心取灰度剖面。
  //   网格线在灰度剖面上呈现"V"形特征：
  //     - 水平网格线 → 水平剖面中间出现深色V谷
  //     - 垂直网格线 → 垂直剖面中间出现深色V谷
  //
  //   V能量 = 剖面二阶导数的峰值强度
  //   二阶导数在灰度突变处产生尖峰，峰高正比于边缘锐度
  // ──────────────────────────────────────

  interface CellEnergyData {
    row: number;
    col: number;
    hProfile: number[];       // 水平灰度剖面
    vProfile: number[];       // 垂直灰度剖面
    hEnergy: number;          // 水平V能量
    vEnergy: number;          // 垂直V能量
    lineEnergy: number;       // 原始线能量 (h+v)
    propagatedEnergy: number; // 传播后能量
    combinedGridScore: number;// 最终综合评分
  }

  const PROFILE_SAMPLES = Math.max(16, Math.min(64, Math.round((width / finalCols) * 0.8))); // 每条剖面的采样点数

  /**
   * calculateLineEnergy — 单格子的V型灰度剖面能量计算
   *
   * @param gray 原始灰度图
   * @param w, h 图像宽高
   * @param vLines, hLines 网格线坐标数组
   * @param row, col 格子行列号
   * @returns 能量数据
   */
  function calculateLineEnergy(
    _gray: Uint8ClampedArray, _w: number, _h: number,
    _vLines: number[], _hLines: number[],
    _row: number, _col: number,
    _profileSamples: number
  ): CellEnergyData {
    const cx0 = _vLines[_col], cx1 = _vLines[_col + 1];
    const cy0 = _hLines[_row], cy1 = _hLines[_row + 1];
    const cellW = cx1 - cx0;
    const cellH = cy1 - cy0;
    const centerX = (cx0 + cx1) / 2;
    const centerY = (cy0 + cy1) / 2;

    // ---- 水平剖面：穿过格子中心的水平线 ----
    const hProfile: number[] = [];
    for (let s = 0; s < _profileSamples; s++) {
      const frac = s / (_profileSamples - 1);
      const px = cx0 + frac * cellW;
      const py = centerY;
      const ix = Math.round(Math.max(0, Math.min(_w - 1, px)));
      const iy = Math.round(Math.max(0, Math.min(_h - 1, py)));
      hProfile.push(_gray[iy * _w + ix]);
    }

    // ---- 垂直剖面：穿过格子中心的垂直线 ----
    const vProfile: number[] = [];
    for (let s = 0; s < _profileSamples; s++) {
      const frac = s / (_profileSamples - 1);
      const px = centerX;
      const py = cy0 + frac * cellH;
      const ix = Math.round(Math.max(0, Math.min(_w - 1, px)));
      const iy = Math.round(Math.max(0, Math.min(_h - 1, py)));
      vProfile.push(_gray[iy * _w + ix]);
    }

    // ---- V型能量计算：二阶差分法 ----
    // 二阶差分 ≈ 二阶导数，在灰度突变处产生尖峰
    function computeVEnergy(profile: number[]): number {
      if (profile.length < 5) return 0;

      // 一阶差分
      const grad = new Array(profile.length - 1);
      for (let i = 0; i < profile.length - 1; i++) {
        grad[i] = profile[i + 1] - profile[i];
      }

      // 二阶差分（曲率）
      const curvature = new Array(grad.length - 1);
      for (let i = 0; i < grad.length - 1; i++) {
        curvature[i] = grad[i + 1] - grad[i]; // 正值=向上凸(V底), 负值=向下凸(V顶)
      }

      // V能量 = |二阶差分| 的加权和，中间区域权重更高
      // （网格线应穿过格子中央）
      let energy = 0;
      const mid = curvature.length / 2;
      for (let i = 0; i < curvature.length; i++) {
        // 高斯权重：中间高、两边低
        const distFromCenter = Math.abs(i - mid) / mid;
        const gaussianWeight = Math.exp(-distFromCenter * distFromCenter * 4); // σ≈0.5
        energy += Math.abs(curvature[i]) * gaussianWeight;
      }
      return energy / curvature.length; // 归一化
    }

    const hEnergy = computeVEnergy(hProfile);
    const vEnergy = computeVEnergy(vProfile);

    // 线能量 = max(h, v) + 0.3 * min(h, v)
    // 强调至少一个方向有明显网格线，同时奖励双向都有
    const lineEnergy = Math.max(hEnergy, vEnergy) + 0.3 * Math.min(hEnergy, vEnergy);

    return {
      row: _row, col: _col,
      hProfile, vProfile, hEnergy, vEnergy,
      lineEnergy, propagatedEnergy: 0, combinedGridScore: 0,
    };
  }

  // ── Phase 1 执行：计算所有格子的线能量 ──
  const allCellEnergies: CellEnergyData[] = [];

  for (let row = 0; row < finalRows; row++) {
    for (let col = 0; col < finalCols; col++) {
      const energy = calculateLineEnergy(gray, width, height, vLines, hLines, row, col, PROFILE_SAMPLES);
      allCellEnergies.push(energy);
    }
  }

  // 统计线能量分布
  const rawEnergies = allCellEnergies.map(e => e.lineEnergy);
  const rawMin = Math.min(...rawEnergies), rawMax = Math.max(...rawEnergies);
  const rawMean = rawEnergies.reduce((a, b) => a + b, 0) / rawEnergies.length;
  console.log(`[Phase1 LineEnergy] 范围=[${rawMin.toFixed(4)}, ${rawMax.toFixed(4)}] 均值=${rawMean.toFixed(4)} samples=${PROFILE_SAMPLES}`);

  // ──────────────────────────────────────
  // Phase 2: Grid Region Propagation
  //
  // 利用网格线的空间连续性进行传播：
  //   - 高能量格子向邻居传递部分能量（网格线是连续的）
  //   - 低能量但被高能量包围的格子获得提升（可能是弱网格线）
  //   - 孤立的低能量格子保持低分（真正的Hole）
  //
  // 公式：propagated[i] = α × original[i] + β × mean(neighbors' original)
  //   α=0.6（保留自身特征）, β=0.4（邻居影响）
  // ──────────────────────────────────────
  const PROP_ALPHA = 0.6; // 自身权重
  const PROP_BETA = 0.4;  // 邻居权重
  const PROP_ROUNDS = 2;   // 传播轮数

  for (let round = 0; round < PROP_ROUNDS; round++) {
    for (const cell of allCellEnergies) {
      const { row, col } = cell;
      let neighborSum = 0, neighborCount = 0;

      // 8邻域
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr, nc = col + dc;
          if (nr >= 0 && nr < finalRows && nc >= 0 && nc < finalCols) {
            const nIdx = nr * finalCols + nc;
            neighborSum += allCellEnergies[nIdx].lineEnergy;
            neighborCount++;
          }
        }
      }

      const neighborAvg = neighborCount > 0 ? neighborSum / neighborCount : 0;
      if (round === 0) {
        cell.propagatedEnergy = PROP_ALPHA * cell.lineEnergy + PROP_BETA * neighborAvg;
      } else {
        cell.propagatedEnergy = PROP_ALPHA * cell.propagatedEnergy + PROP_BETA * neighborAvg;
      }
    }
  }

  // 传播后统计
  const propEnergies = allCellEnergies.map(e => e.propagatedEnergy);
  const propMean = propEnergies.reduce((a, b) => a + b, 0) / propEnergies.length;
  console.log(`[Phase2 Propagation] α=${PROP_ALPHA} β=${PROP_BETA} rounds=${PROP_ROUNDS} 传播后均值=${propMean.toFixed(4)} (原始=${rawMean.toFixed(4)})`);

  // ──────────────────────────────────────
  // Phase 3: combinedGridScore → EmptyGrid/Hole 分类
  //
  // combinedGridScore = 加权组合多个特征：
  //   0.50 × propagatedEnergy（传播后的线能量，主特征）
  //   0.25 × max(hEnergy, vEnergy)（最强方向原始能量）
  //   0.15 × min(hEnergy, vEnergy)（最弱方向，双向有则加分）
  //   0.10 × edgePresence（四边暗像素占比，辅助验证）
  //
  // 分类方法：Otsu 自适应阈值（与旧方法相同，但输入改为combinedGridScore）
  // ──────────────────────────────────────

  // 先计算辅助特征：edgePresence（四边暗像素占比，用于交叉验证）
  const EDGE_SAMPLE_W = 3;
  for (const cell of allCellEnergies) {
    const { row, col } = cell;
    const x0 = vLines[col], x1 = vLines[col + 1];
    const y0 = hLines[row], y1 = hLines[row + 1];

    let darkPx = 0, totalPx = 0;
    // 四边采样
    for (let ex = Math.round(x0); ex <= Math.round(x1); ex++) {
      for (let ey = Math.max(0, Math.round(y0) - EDGE_SAMPLE_W); ey <= Math.min(height - 1, Math.round(y0) + EDGE_SAMPLE_W); ey++) {
        if (gray[ey * width + ex] < 180) darkPx++;
        totalPx++;
      }
      for (let ey = Math.max(0, Math.round(y1) - EDGE_SAMPLE_W); ey <= Math.min(height - 1, Math.round(y1) + EDGE_SAMPLE_W); ey++) {
        if (gray[ey * width + ex] < 180) darkPx++;
        totalPx++;
      }
    }
    for (let ey = Math.round(y0); ey <= Math.round(y1); ey++) {
      for (let ex = Math.max(0, Math.round(x0) - EDGE_SAMPLE_W); ex <= Math.min(width - 1, Math.round(x0) + EDGE_SAMPLE_W); ex++) {
        if (gray[ey * width + ex] < 180) darkPx++;
        totalPx++;
      }
      for (let ex = Math.max(0, Math.round(x1) - EDGE_SAMPLE_W); ex <= Math.min(width - 1, Math.round(x1) + EDGE_SAMPLE_W); ex++) {
        if (gray[ey * width + ex] < 180) darkPx++;
        totalPx++;
      }
    }
    const edgePresence = totalPx > 0 ? darkPx / totalPx : 0;

    // 组合评分
    cell.combinedGridScore =
      0.50 * cell.propagatedEnergy +
      0.25 * Math.max(cell.hEnergy, cell.vEnergy) +
      0.15 * Math.min(cell.hEnergy, cell.vEnergy) +
      0.10 * edgePresence;
  }

  // Otsu 阈值分割
  function computeOtsuThreshold(scores: number[]): number {
    const NUM_BINS = 256;
    const hist = new Float64Array(NUM_BINS).fill(0);

    // 将分数归一化到 [0, NUM_BINS-1]
    const sMin = Math.min(...scores), sMax = Math.max(...scores);
    const range = sMax - sMin || 1;
    for (const s of scores) {
      hist[Math.min(NUM_BINS - 1, Math.floor(((s - sMin) / range) * (NUM_BINS - 1)))]++;
    }
    const total = scores.length;
    let sumAll = 0;
    for (let i = 0; i < NUM_BINS; i++) sumAll += i * hist[i];

    let sumB = 0, wB = 0;
    let varMax = 0, thresholdIdx = 0;
    for (let t = 0; t < NUM_BINS; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > varMax) {
        varMax = varBetween;
        thresholdIdx = t;
      }
    }
    // 反归一化回原始范围
    return sMin + (thresholdIdx / (NUM_BINS - 1)) * range;
  }

  const otsuThresh = computeOtsuThreshold(allCellEnergies.map(e => e.combinedGridScore));
  const combinedScores = allCellEnergies.map(e => e.combinedGridScore);
  console.log(`[Phase3 CombinedGridScore] Otsu阈值=${otsuThresh.toFixed(4)} 范围=[${Math.min(...combinedScores).toFixed(4)}, ${Math.max(...combinedScores).toFixed(4)}]`);

  // ── 分类 + 空间平滑 ──
  let emptyGridCount = 0, holeCount = 0;
  const grid: GridCell[][] = [];

  for (let row = 0; row < finalRows; row++) {
    const gridRow: GridCell[] = [];
    for (let col = 0; col < finalCols; col++) {
      const idx = row * finalCols + col;
      const ed = allCellEnergies[idx];
      const hasGrid = ed.combinedGridScore >= otsuThresh;

      let color: string, emptyType: 'outer' | 'inner', regionType: string;
      if (hasGrid) {
        color = '#F5F5F5'; emptyType = 'outer'; regionType = 'EmptyGrid';
        emptyGridCount++;
      } else {
        color = '#FFFFFF'; emptyType = 'inner'; regionType = 'Hole';
        holeCount++;
      }

      gridRow.push({
        row, col, color, active: true, emptyType, _regionType: regionType,
        _debug: {
          combinedGridScore: ed.combinedGridScore,
          otsuThresh,
          hEnergy: ed.hEnergy,
          vEnergy: ed.vEnergy,
          lineEnergy: ed.lineEnergy,
          propagatedEnergy: ed.propagatedEnergy,
        },
      });
    }
    grid.push(gridRow);
  }

  // 空间平滑：消除散落的 Hole 孤岛
  {
    let flippedRound1 = 0, flippedRound2 = 0;

    const toFlip: Array<[number, number]> = [];
    for (let r = 0; r < finalRows; r++) {
      for (let c = 0; c < finalCols; c++) {
        if (grid[r][c].emptyType !== 'inner') continue;
        let emptyNeighbor = 0, totalNeighbor = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < finalRows && nc >= 0 && nc < finalCols) {
              totalNeighbor++;
              if (grid[nr][nc].emptyType === 'outer') emptyNeighbor++;
            }
          }
        }
        if (totalNeighbor > 0 && emptyNeighbor / totalNeighbor >= 0.625) toFlip.push([r, c]);
      }
    }
    for (const [r, c] of toFlip) {
      grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
      holeCount--; emptyGridCount++; flippedRound1++;
    }

    const toFlip2: Array<[number, number]> = [];
    for (let r = 0; r < finalRows; r++) {
      for (let c = 0; c < finalCols; c++) {
        if (grid[r][c].emptyType !== 'inner') continue;
        let emptyNeighbor = 0, totalNeighbor = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < finalRows && nc >= 0 && nc < finalCols) {
              totalNeighbor++;
              if (grid[nr][nc].emptyType === 'outer') emptyNeighbor++;
            }
          }
        }
        if (totalNeighbor > 0 && emptyNeighbor / totalNeighbor >= 0.50) toFlip2.push([r, c]);
      }
    }
    for (const [r, c] of toFlip2) {
      grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
      holeCount--; emptyGridCount++; flippedRound2++;
    }

    console.log(`[空间平滑] R1(≥62.5%): ${flippedRound1} | R2(≥50%): ${flippedRound2} → EmptyGrid=${emptyGridCount}, Hole=${holeCount}`);
  }

  // ════════════════════════════════════
  // ★ 边缘填充：修复上下左右边缘的漏检格子 ★
  //
  // 问题：图像边缘（尤其是顶行和底行）的网格线能量偏低
  //   原因：
  //     - 边缘格子的灰度剖面采样可能部分越界（中心线靠近边界）
  //     - 边缘格子的有效邻居少，传播增益不足
  //     - 图像扫描时边缘可能有渐变/裁剪导致线变弱
  //
  // 策略：列/行扫描法
  //   对每列：从顶部向下、从底部向上找到第一个 EmptyGrid，
  //   将此位置之外的所有 Hole 翻转为 EmptyGrid
  //   （因为结构图的网格线从边缘连续延伸，如果某列有网格线，
  //    则该列边缘区域必然也有网格线，只是能量偏低导致漏检）
  // ════════════════════════════════════
  {
    let edgeFlippedTotal = 0;

    // ── 按列处理：上下边缘 ──
    for (let c = 0; c < finalCols; c++) {
      // 从顶部向下找第一个 EmptyGrid
      let topFirstEmpty = -1;
      for (let r = 0; r < finalRows; r++) {
        if (grid[r][c].emptyType === 'outer') { topFirstEmpty = r; break; }
      }
      // 将 topFirstEmpty 上方的所有 Hole 翻转
      if (topFirstEmpty > 0) {
        for (let r = 0; r < topFirstEmpty; r++) {
          if (grid[r][c].emptyType === 'inner') {
            grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
            holeCount--; emptyGridCount++; edgeFlippedTotal++;
          }
        }
      }

      // 从底部向上找第一个 EmptyGrid
      let bottomFirstEmpty = -1;
      for (let r = finalRows - 1; r >= 0; r--) {
        if (grid[r][c].emptyType === 'outer') { bottomFirstEmpty = r; break; }
      }
      // 将 bottomFirstEmpty 下方的所有 Hole 翻转
      if (bottomFirstEmpty >= 0 && bottomFirstEmpty < finalRows - 1) {
        for (let r = finalRows - 1; r > bottomFirstEmpty; r--) {
          if (grid[r][c].emptyType === 'inner') {
            grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
            holeCount--; emptyGridCount++; edgeFlippedTotal++;
          }
        }
      }
    }

    // ── 按行处理：左右边缘 ──
    for (let r = 0; r < finalRows; r++) {
      // 从左向右找第一个 EmptyGrid
      let leftFirstEmpty = -1;
      for (let c = 0; c < finalCols; c++) {
        if (grid[r][c].emptyType === 'outer') { leftFirstEmpty = c; break; }
      }
      if (leftFirstEmpty > 0) {
        for (let c = 0; c < leftFirstEmpty; c++) {
          if (grid[r][c].emptyType === 'inner') {
            grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
            holeCount--; emptyGridCount++; edgeFlippedTotal++;
          }
        }
      }

      // 从右向左找第一个 EmptyGrid
      let rightFirstEmpty = -1;
      for (let c = finalCols - 1; c >= 0; c--) {
        if (grid[r][c].emptyType === 'outer') { rightFirstEmpty = c; break; }
      }
      if (rightFirstEmpty >= 0 && rightFirstEmpty < finalCols - 1) {
        for (let c = finalCols - 1; c > rightFirstEmpty; c--) {
          if (grid[r][c].emptyType === 'inner') {
            grid[r][c].emptyType = 'outer'; grid[r][c].color = '#F5F5F5';
            holeCount--; emptyGridCount++; edgeFlippedTotal++;
          }
        }
      }
    }

    console.log(`[边缘填充] 列+行扫描 → 翻转${edgeFlippedTotal}个 → EmptyGrid=${emptyGridCount}, Hole=${holeCount}`);
  }

  console.log('%c╔══════════════════════════════════════╗', 'color:#22c55e;font-weight:bold');
  console.log('%c║   V型能量+RegionProp 结果             ║', 'color:#22c55e;font-weight:bold');
  console.log(`%c║  Total: ${String(finalRows*finalCols).padStart(6)}                    ║`, 'color:#22c55e');
  console.log(`%c║  EmptyGrid(灰): ${String(emptyGridCount).padStart(4)}  有网格线     ║`, 'color:#22c55e');
  console.log(`%c║  Hole(白):     ${String(holeCount).padStart(4)}  无网格线     ║`, 'color:#22c55e');
  console.log(`%c║  阈值: Otsu=${otsuThresh.toFixed(2)}  combinedGridScore           ║`, 'color:#22c55e');
  console.log(`%c║  权重: 0.5×propagated + 0.25×maxHV + 0.15×minHV + 0.1×edge ║`, 'color:#22c55e');
  console.log('%c╚══════════════════════════════════════╝', 'color:#22c55e;font-weight:bold');

  // ════════════════════════════════════
  // 调试图: V-Energy Overlay
  // ════════════════════════════════════
  {
    const veCanvas = document.createElement('canvas');
    veCanvas.width = width;
    veCanvas.height = height;
    const vex = veCanvas.getContext('2d')!;

    // 底图：灰度图
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = gray[y * width + x];
        vex.fillStyle = `rgb(${v},${v},${v})`;
        vex.fillRect(x, y, 1, 1);
      }
    }

    // 叠加分类结果
    for (let r = 0; r < finalRows; r++) {
      for (let c = 0; c < finalCols; c++) {
        const cell = grid[r][c];
        const cx0 = vLines[c], cx1 = vLines[c + 1];
        const cy0 = hLines[r], cy1 = hLines[r + 1];

        if (cell.emptyType === 'outer') {
          vex.fillStyle = 'rgba(59,130,246,0.30)';
        } else {
          vex.fillStyle = 'rgba(239,68,68,0.40)';
        }
        vex.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);

        vex.strokeStyle = cell.emptyType === 'outer' ? 'rgba(59,130,246,0.8)' : 'rgba(239,68,68,0.8)';
        vex.lineWidth = 1;
        vex.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
      }
    }

    // 信息面板
    vex.fillStyle = 'rgba(0,0,0,0.80)';
    vex.fillRect(2, 2, 420, 75);
    vex.fillStyle = '#fff';
    vex.font = '11px monospace';
    vex.fillText(`V型能量+RegionProp: EmptyGrid/Hole分类`, 10, 16);
    vex.fillText(`Image: ${width}x${height} | Grid: ${finalCols}x${finalRows}`, 10, 30);
    vex.fillText(`Blue=EmptyGrid(${emptyGridCount}) 有网格 | Red=Hole(${holeCount}) 无网格`, 10, 44);
    vex.fillText(`Otsu=${otsuThresh.toFixed(3)} | profileSamples=${PROFILE_SAMPLES} | propRounds=${PROP_ROUNDS}`, 10, 58);
    vex.fillText(`combinedGridScore = 0.5×prop + 0.25×maxHV + 0.15×minHV + 0.1×edge`, 10, 72);

    debugImages.push({ stage: 'VEnergy_Overlay', dataUrl: veCanvas.toDataURL('image/png') });
  }

  // ════════════════════════════════════
  // 调试试: V-Profile 可视化（选几个典型格子）
  // ════════════════════════════════════
  {
    // 选出最高和最低 combinedGridScore 的各3个格子
    const sorted = [...allCellEnergies].sort((a, b) => b.combinedGridScore - a.combinedGridScore);
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3);

    const vpCanvas = document.createElement('canvas');
    vpCanvas.width = 500;
    vpCanvas.height = 300;
    const vpx = vpCanvas.getContext('2d')!;

    vpx.fillStyle = '#1a1a2e';
    vpx.fillRect(0, 0, 500, 300);

    vpx.fillStyle = '#fff';
    vpx.font = 'bold 12px monospace';
    vpx.fillText('V-Profile 可视化 (Top3 EmptyGrid / Bottom3 Hole)', 10, 16);

    const plotW = 140, plotH = 70;
    const profilesToPlot = [
      ...top3.map(e => ({ data: e, label: `EG[${e.row},${e.col}] score=${e.combinedGridScore.toFixed(2)}`, color: '#3b82f6' })),
      ...bottom3.map(e => ({ data: e, label: `H[${e.row},${e.col}] score=${e.combinedGridScore.toFixed(2)}`, color: '#ef4444' })),
    ];

    profilesToPlot.forEach((item, pi) => {
      const px = 10 + (pi % 3) * (plotW + 10);
      const py = 30 + Math.floor(pi / 3) * (plotH + 40);

      // 背景
      vpx.fillStyle = 'rgba(255,255,255,0.05)';
      vpx.fillRect(px, py, plotW, plotH);

      // 标签
      vpx.fillStyle = item.color;
      vpx.font = '9px monospace';
      vpx.fillText(item.label, px, py - 3);

      // 水平剖面
      const prof = item.data.hProfile;
      const pMax = Math.max(...prof), pMin = Math.min(...prof);
      const pRange = pMax - pMin || 1;
      vpx.strokeStyle = '#22c55e';
      vpx.lineWidth = 1;
      vpx.beginPath();
      for (let i = 0; i < prof.length; i++) {
        const sx = px + (i / (prof.length - 1)) * plotW;
        const sy = py + plotH - ((prof[i] - pMin) / pRange) * plotH * 0.85 - 2;
        if (i === 0) vpx.moveTo(sx, sy); else vpx.lineTo(sx, sy);
      }
      vpx.stroke();
    });

    debugImages.push({ stage: 'VProfile_Visual', dataUrl: vpCanvas.toDataURL('image/png') });
  }

  // 统计（基于 regionType）
  let holeStat = 0, emptyGridStat = 0, otherStat = 0;
  for (const row of grid) {
    for (const cell of row) {
      // @ts-expect-error
      const rt: string = cell._regionType;
      if (rt === 'Hole') holeStat++;
      else if (rt === 'EmptyGrid') emptyGridStat++;
      else otherStat++;
    }
  }
  console.log(`[Stage5] STRUCTURE_PATTERN 网格统计: Hole(白)=${holeStat}, EmptyGrid(灰)=${emptyGridStat}, 其他=${otherStat}`);

  return {
    grid,
    extractedColors: [
      { hex: PATTERN_WHITE, count: holeStat },
      { hex: GRID_BACKGROUND, count: emptyGridStat },
    ],
    palette: [PATTERN_WHITE, GRID_BACKGROUND],
    debugImages,
  };
}

// ════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════

/** 创建调试 Canvas（从单通道数据） */
function createDebugCanvas(channel: Uint8ClampedArray, w: number, h: number, mode: 'gray' | 'binary'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  for (let i = 0; i < channel.length; i++) {
    const v = channel[i];
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = mode === 'binary' ? v : v;
    imgData.data[i * 4 + 2] = mode === 'binary' ? v : v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/** 统计特定值的像素占比 */
function countPixels(data: Uint8ClampedArray, targetValue: number, w: number, h: number): number {
  let c = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === targetValue) c++;
  }
  return (c / data.length) * 100;
}

/**
 * 网格线检测与移除 — 检测规则网格线，删除并保留非规则轮廓（衣领、数字、文字）
 *
 * 算法步骤：
 *   1. 行投影：统计每行黑像素密度 → 检测水平网格线（等间距高密度行）
 *   2. 列投影：统计每列黑像素密度 → 检测垂直网格线（等间距高密度列）
 *   3. 标记网格线像素并删除
 *   4. 保留非规则内容（衣领轮廓、数字、文字）
 */
interface GridRemovalResult {
  /** 移除网格线后的图像 */
  cleaned: Uint8ClampedArray;
  /** 检测到的水平网格线 Y 坐标数组 */
  gridRows: number[];
  /** 检测到的垂直网格线 X 坐标数组 */
  gridCols: number[];
}
function removeGridLines(binary: Uint8ClampedArray, w: number, h: number): GridRemovalResult {
  const result = new Uint8ClampedArray(binary);
  const isGridRow = new Uint8Array(h); // 1=该行为网格线
  const isGridCol = new Uint8Array(w); // 1=该列为网格线

  // === Step 1: 行投影 — 检测水平网格线 ===
  const rowDensity = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let blackCount = 0;
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x] === 0) blackCount++;
    }
    rowDensity[y] = blackCount / w;
  }

  // 计算行密度的中位数和标准差
  const sortedRows = [...rowDensity].sort((a, b) => a - b);
  const rowMedian = sortedRows[Math.floor(h / 2)];
  const rowMean = rowDensity.reduce((s, v) => s + v, 0) / h;
  const rowStdDev = Math.sqrt(rowDensity.reduce((s, v) => s + (v - rowMean) ** 2, 0) / h);

  // 高密度行候选：密度 > 中位数 + 0.5*标准差
  const rowThreshold = Math.max(rowMedian + rowStdDev * 0.5, 0.15);
  const highDensityRows: number[] = [];
  for (let y = 0; y < h; y++) {
    if (rowDensity[y] > rowThreshold) {
      highDensityRows.push(y);
    }
  }

  // 分析行间距，找出规则的网格线
  if (highDensityRows.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < highDensityRows.length; i++) {
      gaps.push(highDensityRows[i] - highDensityRows[i - 1]);
    }
    gaps.sort((a, b) => a - b);

    // 取中位数间距作为基准网格间距
    const medianGap = gaps[Math.floor(gaps.length / 2)];

    // 允许 ±30% 偏差的为规则网格线
    const tolerance = medianGap * 0.30;

    // 使用聚类方式确认网格线组
    const gridLineGroups: number[][] = [];
    let currentGroup: number[] = [highDensityRows[0]];

    for (let i = 1; i < highDensityRows.length; i++) {
      const gap = highDensityRows[i] - highDensityRows[i - 1];
      if (gap <= medianGap + tolerance && gap >= medianGap * 0.5) {
        currentGroup.push(highDensityRows[i]);
      } else {
        if (currentGroup.length >= 2) {
          gridLineGroups.push(currentGroup);
        }
        currentGroup = [highDensityRows[i]];
      }
    }
    if (currentGroup.length >= 2) {
      gridLineGroups.push(currentGroup);
    }

    // 标记属于最大规则组的行
    if (gridLineGroups.length > 0) {
      gridLineGroups.sort((a, b) => b.length - a.length);
      const primaryGroup = gridLineGroups[0];
      for (const row of primaryGroup) {
        isGridRow[row] = 1;
      }
    } else {
      // 如果没有形成规则组，使用简单阈值
      for (const row of highDensityRows) {
        isGridRow[row] = 1;
      }
    }
  }

  // === Step 2: 列投影 — 检测垂直网格线 ===
  const colDensity = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let blackCount = 0;
    for (let y = 0; y < h; y++) {
      if (binary[y * w + x] === 0) blackCount++;
    }
    colDensity[x] = blackCount / h;
  }

  const sortedCols = [...colDensity].sort((a, b) => a - b);
  const colMedian = sortedCols[Math.floor(w / 2)];
  const colMean = colDensity.reduce((s, v) => s + v, 0) / w;
  const colStdDev = Math.sqrt(colDensity.reduce((s, v) => s + (v - colMean) ** 2, 0) / w);

  const colThreshold = Math.max(colMedian + colStdDev * 0.5, 0.15);
  const highDensityCols: number[] = [];
  for (let x = 0; x < w; x++) {
    if (colDensity[x] > colThreshold) {
      highDensityCols.push(x);
    }
  }

  if (highDensityCols.length >= 3) {
    const gaps: number[] = [];
    for (let i = 1; i < highDensityCols.length; i++) {
      gaps.push(highDensityCols[i] - highDensityCols[i - 1]);
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)];
    const tolerance = medianGap * 0.30;

    const gridColGroups: number[][] = [];
    let currentGroup: number[] = [highDensityCols[0]];
    for (let i = 1; i < highDensityCols.length; i++) {
      const gap = highDensityCols[i] - highDensityCols[i - 1];
      if (gap <= medianGap + tolerance && gap >= medianGap * 0.5) {
        currentGroup.push(highDensityCols[i]);
      } else {
        if (currentGroup.length >= 2) {
          gridColGroups.push(currentGroup);
        }
        currentGroup = [highDensityCols[i]];
      }
    }
    if (currentGroup.length >= 2) {
      gridColGroups.push(currentGroup);
    }

    if (gridColGroups.length > 0) {
      gridColGroups.sort((a, b) => b.length - a.length);
      const primaryGroup = gridColGroups[0];
      for (const col of primaryGroup) {
        isGridCol[col] = 1;
      }
    } else {
      for (const col of highDensityCols) {
        isGridCol[col] = 1;
      }
    }
  }

  // === Step 3 & 4: 删除网格线像素，保留非规则轮廓 ===
  // 网格线判定：同时满足行和列方向的网格线特征
  // 扩展检测：对已识别的网格行列做轻微扩展（±1px），确保完整覆盖
  const gridRowSet = new Set<number>();
  const gridColSet = new Set<number>();
  for (let y = 0; y < h; y++) {
    if (isGridRow[y]) {
      gridRowSet.add(y);
      if (y > 0) gridRowSet.add(y - 1);       // 向上扩展
      if (y < h - 1) gridRowSet.add(y + 1);     // 向下扩展
    }
  }
  for (let x = 0; x < w; x++) {
    if (isGridCol[x]) {
      gridColSet.add(x);
      if (x > 0) gridColSet.add(x - 1);
      if (x < w - 1) gridColSet.add(x + 1);
    }
  }

  let removedPx = 0;
  let keptPx = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (result[idx] !== 0) continue; // 只处理黑像素

      // 判断是否在网格线上：
      // - 在网格行上 且 在网格列上 → 网格交叉点，删除
      // - 在网格行上 且 不在网格列上 但该行是纯网格线(无局部非规则特征) → 可能是水平网格线段
      // - 在网格列上 且 不在网格行上 但该列是纯网格线(无局部非规则特征) → 可能是垂直网格线段
      const onGridRow = gridRowSet.has(y);
      const onGridCol = gridColSet.has(x);

      if (onGridRow && onGridCol) {
        // 网格交叉点 — 直接删除
        result[idx] = 255;
        removedPx++;
      } else if (onGridRow || onGridCol) {
        // 单方向网格线 — 需要检查局部连通性判断是否为非规则轮廓的一部分
        // 非规则轮廓（衣领、数字）通常具有局部密集的邻域黑像素聚集
        let localBlackNeighbor = 0;
        let localTotal = 0;
        const checkRadius = 3;
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
          for (let dx = -checkRadius; dx <= checkRadius; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
              localTotal++;
              if (binary[ny * w + nx] === 0) localBlackNeighbor++;
            }
          }
        }
        const localDensity = localBlackNeighbor / localTotal;

        // 局部密度低 → 孤立网格线段 → 删除
        // 局部密度高 → 属于非规则轮廓（衣领/数字/文字）→ 保留
        if (localDensity < 0.25) {
          result[idx] = 255;
          removedPx++;
        } else {
          keptPx++;
        }
      } else {
        // 不在任何网格线上 → 保留（可能是衣领轮廓、数字、文字）
        keptPx++;
      }
    }
  }

  const totalBlackBefore = Array.from(binary).filter(v => v === 0).length;
  const detectedGridRows = Array.from(isGridRow).map((v, i) => v === 1 ? i : -1).filter(v => v >= 0);
  const detectedGridCols = Array.from(isGridCol).map((v, i) => v === 1 ? i : -1).filter(v => v >= 0);

  console.log(`[GridRemoval] 网格行=${detectedGridRows.length}, 网格列=${detectedGridCols.length}`);
  console.log(`[GridRemoval] 移除=${removedPx}px, 保留=${keptPx}px, 原始黑像素=${totalBlackBefore}px, 保留率=${(keptPx / totalBlackBefore * 100).toFixed(1)}%`);

  return { cleaned: result, gridRows: detectedGridRows, gridCols: detectedGridCols };
}

/** 形态学闭运算 (Dilation then Erosion) */
function morphClose(binary: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  let result = morphDilate(binary, w, h, radius);
  result = morphErode(result, w, h, radius);
  return result;
}

/** 形态学膨胀 */
function morphDilate(binary: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w && binary[ny * w + nx] === 0) {
            found = true;
          }
        }
      }
      out[y * w + x] = found ? 0 : 255;
    }
  }
  return out;
}

/** 形态学腐蚀 */
function morphErode(binary: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allBlack = true;
      for (let dy = -radius; dy <= radius && allBlack; dy++) {
        for (let dx = -radius; dx <= radius && allBlack; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w || binary[ny * w + nx] !== 0) {
            allBlack = false;
          }
        }
      }
      out[y * w + x] = allBlack ? 0 : 255;
    }
  }
  return out;
}

/** BFS 连通域标记（返回标签矩阵，0=背景） */
function labelConnectedComponents(binary: Uint8ClampedArray, w: number, h: number): Int32Array {
  const labels = new Int32Array(w * h);
  let currentLabel = 0;
  const visited = new Uint8Array(w * h);

  for (let startIdx = 0; startIdx < labels.length; startIdx++) {
    if (binary[startIdx] !== 0 || visited[startIdx]) continue;

    currentLabel++;
    const queue: number[] = [startIdx];
    visited[startIdx] = 1;

    while (queue.length > 0) {
      const idx = queue.shift()!;
      labels[idx] = currentLabel;
      const y = Math.floor(idx / w);
      const x = idx % w;

      const neighbors = [
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
      ];
      for (const nIdx of neighbors) {
        if (nIdx >= 0 && !visited[nIdx] && binary[nIdx] === 0) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  return labels;
}

/** 泛洪填充分类：0=outer(外部空), 1=inner(内部空洞), 2=contour(轮廓) */
function floodFillClassify(binary: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(w * h);
  // 先标记所有前景(黑)为轮廓
  for (let i = 0; i < result.length; i++) {
    result[i] = binary[i] === 0 ? 2 : 255; // 2=contour, 255=未分类
  }

  // 从图像四边开始 BFS 泛洪，将连通的白区标记为 outer(0)
  const visited = new Uint8Array(w * h);
  const edgeQueue: number[] = [];

  // 收集所有边缘白点作为起点
  for (let x = 0; x < w; x++) {
    if (result[x] === 255) { edgeQueue.push(x); visited[x] = 1; }
    if (result[(h - 1) * w + x] === 255) { edgeQueue.push((h - 1) * w + x); visited[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    if (result[y * w] === 255) { edgeQueue.push(y * w); visited[y * w] = 1; }
    if (result[y * w + w - 1] === 255) { edgeQueue.push(y * w + w - 1); visited[y * w + w - 1] = 1; }
  }

  while (edgeQueue.length > 0) {
    const idx = edgeQueue.shift()!;
    result[idx] = 0; // outer

    const y = Math.floor(idx / w);
    const x = idx % w;
    const neighbors = [
      y > 0 ? idx - w : -1,
      y < h - 1 ? idx + w : -1,
      x > 0 ? idx - 1 : -1,
      x < w - 1 ? idx + 1 : -1,
    ];

    for (const nIdx of neighbors) {
      if (nIdx >= 0 && !visited[nIdx] && result[nIdx] === 255) {
        visited[nIdx] = 1;
        edgeQueue.push(nIdx);
      }
    }
  }

  // 剩余未访问的白区 = 内部空洞(inner)
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 255) result[i] = 1; // inner
  }

  // 统计
  let outerC = 0, innerC = 0, contourC = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === 0) outerC++;
    else if (result[i] === 1) innerC++;
    else contourC++;
  }
  console.log(`[FloodFill] Outer=${outerC} (${(outerC/result.length*100).toFixed(1)}%), Inner=${innerC} (${(innerC/result.length*100).toFixed(1)}%), Contour=${contourC} (${(contourC/result.length*100).toFixed(1)}%)`);

  // ════════════════════════════════════
  // Hole Topology Report
  //
  // 分析 Inner 区域的连通分量：
  // - 真正的 Hole 应该是 1~2 个小的封闭区域（如领口）
  // - 如果 Inner 占比过高或连通分量过多，说明分类有问题
  // ════════════════════════════════════
  {
    const visited = new Uint8Array(w * h);
    const innerRegions: Array<{ count: number; bounds: { minR: number; maxR: number; minC: number; maxC: number }; touchesEdge: boolean }> = [];

    for (let start = 0; start < result.length; start++) {
      if (visited[start] || result[start] !== 1) continue;
      // BFS 找一个 Inner 连通分量
      const queue = [start];
      visited[start] = 1;
      let count = 0;
      let minR = Math.floor(start / w), maxR = minR;
      let minC = start % w, maxC = minC;
      let touchesEdge = false;

      while (queue.length > 0) {
        const idx = queue.shift()!;
        count++;
        const r = Math.floor(idx / w);
        const c = idx % w;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (c < minC) minC = c; if (c > maxC) maxC = c;
        if (r === 0 || r >= h - 1 || c === 0 || c >= w - 1) touchesEdge = true;

        const nbs: number[] = [];
        if (r > 0 && result[idx - w] === 1 && !visited[idx - w]) nbs.push(idx - w);
        if (r < h - 1 && result[idx + w] === 1 && !visited[idx + w]) nbs.push(idx + w);
        if (c > 0 && result[idx - 1] === 1 && !visited[idx - 1]) nbs.push(idx - 1);
        if (c < w - 1 && result[idx + 1] === 1 && !visited[idx + 1]) nbs.push(idx + 1);
        for (const n of nbs) { visited[n] = 1; queue.push(n); }
      }

      innerRegions.push({ count, bounds: { minR, maxR, minC, maxC }, touchesEdge });
    }

    // 按面积排序
    innerRegions.sort((a, b) => b.count - a.count);

    console.log('%c╔══════════════════════════════════════════════╗', 'color:#dc2626;font-weight:bold');
    console.log('%c║       Hole Topology Report                 ║', 'color:#dc2626;font-weight:bold');
    console.log('%c╠══════════════════════════════════════════════╣', 'color:#dc2626');
    console.log(`║  Inner 连通域数量:     ${String(innerRegions.length).padStart(6)}                      ║`);
    console.log(`║  Inner 像素占比:       ${(innerC / result.length * 100).toFixed(1)}%                        ║`);
    console.log(`║  Outer 像素占比:       ${(outerC / result.length * 100).toFixed(1)}%                        ║`);

    if (innerRegions.length > 0) {
      console.log('%c║  ── Inner 连通域详情 ─────────────────────── ║', 'color:#f59e0b');
      innerRegions.slice(0, 10).forEach((reg, i) => {
        const w_ = reg.bounds.maxC - reg.bounds.minC + 1;
        const h_ = reg.bounds.maxR - reg.bounds.minR + 1;
        const pct = reg.count / innerC * 100;
        const edgeMark = reg.touchesEdge ? ' ⚠️TOUCHES_EDGE!' : '';
        console.log(`║    #${i + 1} area=${String(reg.count).padStart(8)} (${pct.toFixed(1)}%) bounds=[${reg.bounds.minR}-${reg.bounds.maxR},${reg.bounds.minC}-${reg.bounds.maxC}] size=${w_}x${h_}${edgeMark.padEnd(20)} ║`);
      });
    }

    // 关键诊断
    if (innerRegions.length === 0) {
      console.log('%c║  ✅ 无 Inner 区域 → 全部为 Outer/EmptyGrid      ║', 'color:#22c55e');
    } else if (innerRegions.length <= 3 && innerC / result.length < 0.3) {
      console.log('%c║  ✅ Inner 区域合理 → 少量封闭空洞              ║', 'color:#22c55e');
    } else if (innerC / result.length > 0.5) {
      console.log('%c║  ❌ CRITICAL: Inner>50%! 轮廓可能包围了大部分图像! ║', 'color:#ef4444;font-weight:bold');
      console.log('%c║     可能原因: 主轮廓选择错误或轮廓过厚          ║', 'color:#ef4444');
    } else if (innerRegions.some(r => r.touchesEdge)) {
      console.log('%c║  ⚠️ WARNING: 有Inner区域接触边缘! FloodFill泄漏? ║', 'color:#f59e0b');
    } else {
      console.log('%c║  ⚠️ Inner连通域较多，需检查轮廓提取            ║', 'color:#f59e0b');
    }
    console.log('%c╚══════════════════════════════════════════════╝', 'color:#dc2626');

    // 存储供后续使用
    (result as any)._innerRegions = innerRegions;
  }

  return result;
}

export interface GridDetectionResult {
  cols: number;
  rows: number;
  hLinePositions: number[];
  vLinePositions: number[];
  cellWidth: number;
  cellHeight: number;
  confidence: number;
}

function computeGrayProfile(imageData: ImageData, direction: 'h' | 'v'): Float64Array {
  const { width, height, data } = imageData;
  const len = direction === 'h' ? height : width;
  const profile = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    const grays: number[] = [];
    if (direction === 'h') {
      for (let x = 0; x < width; x++) {
        const idx = (i * width + x) * 4;
        grays.push((data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000);
      }
    } else {
      for (let y = 0; y < height; y++) {
        const idx = (y * width + i) * 4;
        grays.push((data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000);
      }
    }
    grays.sort((a, b) => a - b);
    const darkCount = Math.max(1, Math.floor(grays.length * 0.1));
    let sum = 0;
    for (let k = 0; k < darkCount; k++) sum += grays[k];
    profile[i] = sum / darkCount;
  }
  return profile;
}

function detectVerticalGridLinesByEdge(imageData: ImageData): { cellSize: number; count: number; confidence: number } {
  const { width, height, data } = imageData;
  const edgeStrength = new Float64Array(width);

  for (let x = 1; x < width - 1; x++) {
    let totalEdge = 0;
    for (let y = 0; y < height; y++) {
      const idxL = (y * width + x - 1) * 4;
      const idxC = (y * width + x) * 4;
      const idxR = (y * width + x + 1) * 4;
      const diffL = Math.abs(data[idxC] - data[idxL]) + Math.abs(data[idxC + 1] - data[idxL + 1]) + Math.abs(data[idxC + 2] - data[idxL + 2]);
      const diffR = Math.abs(data[idxR] - data[idxC]) + Math.abs(data[idxR + 1] - data[idxC + 1]) + Math.abs(data[idxR + 2] - data[idxC + 2]);
      totalEdge += Math.max(diffL, diffR);
    }
    edgeStrength[x] = totalEdge / height;
  }

  const maxEdge = Math.max(...edgeStrength) || 1;
  const threshold = maxEdge * 0.3;

  const peaks: number[] = [];
  for (let x = 2; x < width - 2; x++) {
    if (edgeStrength[x] > threshold &&
        edgeStrength[x] >= edgeStrength[x - 1] && edgeStrength[x] >= edgeStrength[x + 1] &&
        edgeStrength[x] > edgeStrength[x - 2] * 0.5 && edgeStrength[x] > edgeStrength[x + 2] * 0.5) {
      peaks.push(x);
    }
  }

  const filtered: number[] = [];
  for (const p of peaks) {
    if (filtered.length === 0 || p - filtered[filtered.length - 1] > 3) {
      filtered.push(p);
    }
  }

  if (filtered.length < 3) return { cellSize: 0, count: 0, confidence: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < filtered.length; i++) gaps.push(filtered[i] - filtered[i - 1]);

  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];

  if (medianGap < 5 || medianGap > width / 3) return { cellSize: 0, count: 0, confidence: 0 };

  const estimatedCount = Math.round(width / medianGap);

  console.log(`边缘检测(垂直): 找到${filtered.length}个峰值, 中位间距=${medianGap}, 估计列数=${estimatedCount}`);

  return { cellSize: medianGap, count: estimatedCount, confidence: 0.85 };
}

function detectHorizontalGridLinesByEdge(imageData: ImageData): { cellSize: number; count: number; confidence: number } {
  const { width, height, data } = imageData;
  const edgeStrength = new Float64Array(height);

  for (let y = 1; y < height - 1; y++) {
    let totalEdge = 0;
    for (let x = 0; x < width; x++) {
      const idxT = ((y - 1) * width + x) * 4;
      const idxC = (y * width + x) * 4;
      const idxB = ((y + 1) * width + x) * 4;
      const diffT = Math.abs(data[idxC] - data[idxT]) + Math.abs(data[idxC + 1] - data[idxT + 1]) + Math.abs(data[idxC + 2] - data[idxT + 2]);
      const diffB = Math.abs(data[idxB] - data[idxC]) + Math.abs(data[idxB + 1] - data[idxC + 1]) + Math.abs(data[idxB + 2] - data[idxC + 2]);
      totalEdge += Math.max(diffT, diffB);
    }
    edgeStrength[y] = totalEdge / width;
  }

  const maxEdge = Math.max(...edgeStrength) || 1;
  const threshold = maxEdge * 0.3;

  const peaks: number[] = [];
  for (let y = 2; y < height - 2; y++) {
    if (edgeStrength[y] > threshold &&
        edgeStrength[y] >= edgeStrength[y - 1] && edgeStrength[y] >= edgeStrength[y + 1] &&
        edgeStrength[y] > edgeStrength[y - 2] * 0.5 && edgeStrength[y] > edgeStrength[y + 2] * 0.5) {
      peaks.push(y);
    }
  }

  const filtered: number[] = [];
  for (const p of peaks) {
    if (filtered.length === 0 || p - filtered[filtered.length - 1] > 3) {
      filtered.push(p);
    }
  }

  if (filtered.length < 3) return { cellSize: 0, count: 0, confidence: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < filtered.length; i++) gaps.push(filtered[i] - filtered[i - 1]);

  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];

  if (medianGap < 5 || medianGap > height / 3) return { cellSize: 0, count: 0, confidence: 0 };

  const estimatedCount = Math.round(height / medianGap);

  console.log(`边缘检测(水平): 找到${filtered.length}个峰值, 中位间距=${medianGap}, 估计行数=${estimatedCount}`);

  return { cellSize: medianGap, count: estimatedCount, confidence: 0.85 };
}

function computeDerivativePeaks(profile: Float64Array, totalLen: number): { positions: number[]; count: number; avgGap: number } {
  const deriv = new Float64Array(profile.length);
  for (let i = 1; i < profile.length; i++) {
    deriv[i] = Math.abs(profile[i] - profile[i - 1]);
  }

  const maxDeriv = Math.max(...deriv) || 1;
  const threshold = maxDeriv * 0.2;

  const peaks: number[] = [];
  for (let i = 2; i < profile.length - 2; i++) {
    if (deriv[i] > threshold &&
        deriv[i] >= deriv[i - 1] && deriv[i] >= deriv[i + 1] &&
        deriv[i] > deriv[i - 2] * 0.5 && deriv[i] > deriv[i + 2] * 0.5) {
      peaks.push(i);
    }
  }

  const filtered: number[] = [];
  for (const p of peaks) {
    if (filtered.length === 0 || p - filtered[filtered.length - 1] > totalLen * 0.003) {
      filtered.push(p);
    }
  }

  if (filtered.length < 2) return { positions: filtered, count: 0, avgGap: 0 };

  const gaps: number[] = [];
  for (let i = 1; i < filtered.length; i++) gaps.push(filtered[i] - filtered[i - 1]);
  gaps.sort((a, b) => a - b);

  const q1 = gaps[Math.floor(gaps.length * 0.1)];
  const q3 = gaps[Math.floor(gaps.length * 0.9)];
  const iqr = q3 - q1;
  const lower = q1 - iqr * 1.0;
  const upper = q3 + iqr * 1.0;
  const validGaps = gaps.filter(g => g >= lower && g <= upper);

  if (validGaps.length === 0) return { positions: filtered, count: 0, avgGap: 0 };
  const avgGap = validGaps.reduce((s, g) => s + g, 0) / validGaps.length;
  const count = Math.round(totalLen / avgGap);

  return { positions: filtered, count, avgGap };
}

function computeAutocorrelation(profile: Float64Array): Float64Array {
  const n = profile.length;
  const mean = profile.reduce((s, v) => s + v, 0) / n;
  const centered = new Float64Array(n);
  for (let i = 0; i < n; i++) centered[i] = profile[i] - mean;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += centered[i] * centered[i];
  if (variance === 0) return new Float64Array(n);

  const maxLag = Math.floor(n / 2);
  const result = new Float64Array(n);
  for (let lag = 0; lag < maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += centered[i] * centered[i + lag];
    }
    result[lag] = sum / variance;
  }
  return result;
}

function findPeriodFromAutocorrelation(autocorr: Float64Array, minPeriod: number, maxPeriod: number): { period: number; confidence: number } {
  const n = Math.min(autocorr.length, maxPeriod);
  let bestPeriod = 0;
  let bestScore = -1;

  for (let p = minPeriod; p < n; p++) {
    let score = 0;
    let harmonics = 0;
    for (let k = 1; k * p < n; k++) {
      score += autocorr[k * p];
      harmonics++;
    }
    score = harmonics > 0 ? score / harmonics : 0;
    score += autocorr[p] * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestPeriod = p;
    }
  }

  if (bestPeriod > 0 && bestScore > 0.1) {
    const refinedPeriod = refinePeriod(autocorr, bestPeriod);
    return { period: refinedPeriod, confidence: Math.min(bestScore, 1.0) };
  }
  return { period: 0, confidence: 0 };
}

function refinePeriod(autocorr: Float64Array, approxPeriod: number): number {
  const searchRadius = Math.max(2, Math.floor(approxPeriod * 0.1));
  const start = Math.max(1, approxPeriod - searchRadius);
  const end = Math.min(autocorr.length - 1, approxPeriod + searchRadius);

  let bestP = approxPeriod;
  let bestVal = -Infinity;
  for (let p = start; p <= end; p++) {
    if (autocorr[p] > bestVal) {
      bestVal = autocorr[p];
      bestP = p;
    }
  }
  return bestP;
}

function computeColorChangeProfile(imageData: ImageData, direction: 'h' | 'v'): Float64Array {
  const { width, height, data } = imageData;
  const len = direction === 'h' ? height : width;
  const profile = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    let totalChange = 0;
    let count = 0;
    if (direction === 'h') {
      for (let x = 1; x < width; x++) {
        const idx1 = (i * width + x) * 4;
        const idx2 = (i * width + x - 1) * 4;
        const dr = data[idx1] - data[idx2];
        const dg = data[idx1 + 1] - data[idx2 + 1];
        const db = data[idx1 + 2] - data[idx2 + 2];
        totalChange += Math.sqrt(dr * dr + dg * dg + db * db);
        count++;
      }
    } else {
      for (let y = 1; y < height; y++) {
        const idx1 = (y * width + i) * 4;
        const idx2 = ((y - 1) * width + i) * 4;
        const dr = data[idx1] - data[idx2];
        const dg = data[idx1 + 1] - data[idx2 + 1];
        const db = data[idx1 + 2] - data[idx2 + 2];
        totalChange += Math.sqrt(dr * dr + dg * dg + db * db);
        count++;
      }
    }
    profile[i] = count > 0 ? totalChange / count : 0;
  }
  return profile;
}

function detectGridByColorBoundaries(imageData: ImageData, direction: 'h' | 'v'): { cellSize: number; count: number; confidence: number } {
  const changeProfile = computeColorChangeProfile(imageData, direction);
  const totalLen = direction === 'h' ? imageData.height : imageData.width;

  const smoothed = new Float64Array(changeProfile.length);
  const winSize = Math.max(1, Math.floor(totalLen / 200));
  for (let i = 0; i < changeProfile.length; i++) {
    let sum = 0, cnt = 0;
    for (let j = -winSize; j <= winSize; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < changeProfile.length) {
        sum += changeProfile[idx];
        cnt++;
      }
    }
    smoothed[i] = sum / cnt;
  }

  const autocorr = computeAutocorrelation(smoothed);
  const minPeriod = Math.max(3, Math.floor(totalLen / 200));
  const maxPeriod = Math.floor(totalLen / 3);
  const acResult = findPeriodFromAutocorrelation(autocorr, minPeriod, maxPeriod);

  if (acResult.period > 0 && acResult.confidence > 0.08) {
    const count = Math.round(totalLen / acResult.period);
    return { cellSize: acResult.period, count, confidence: acResult.confidence * 0.8 };
  }

  return { cellSize: 0, count: 0, confidence: 0 };
}

function detectGridLines(imageData: ImageData, direction: 'h' | 'v'): { positions: number[]; cellSize: number; count: number; confidence: number } {
  const totalLen = direction === 'h' ? imageData.height : imageData.width;

  if (direction === 'v') {
    const edgeResult = detectVerticalGridLinesByEdge(imageData);
    if (edgeResult.count >= 10 && edgeResult.cellSize > 0) {
      const positions: number[] = [];
      for (let i = 0; i <= edgeResult.count; i++) {
        positions.push(Math.min(Math.round(i * edgeResult.cellSize), totalLen - 1));
      }
      return { positions, cellSize: edgeResult.cellSize, count: edgeResult.count, confidence: edgeResult.confidence };
    }
  }

  if (direction === 'h') {
    const edgeResult = detectHorizontalGridLinesByEdge(imageData);
    if (edgeResult.count >= 5 && edgeResult.cellSize > 0) {
      const positions: number[] = [];
      for (let i = 0; i <= edgeResult.count; i++) {
        positions.push(Math.min(Math.round(i * edgeResult.cellSize), totalLen - 1));
      }
      return { positions, cellSize: edgeResult.cellSize, count: edgeResult.count, confidence: edgeResult.confidence };
    }
  }

  const profile = computeGrayProfile(imageData, direction);

  const derivResult = computeDerivativePeaks(profile, totalLen);

  const autocorr = computeAutocorrelation(profile);
  const minPeriod = Math.max(3, Math.floor(totalLen / 200));
  const maxPeriod = Math.floor(totalLen / 3);
  const acResult = findPeriodFromAutocorrelation(autocorr, minPeriod, maxPeriod);

  const colorResult = detectGridByColorBoundaries(imageData, direction);

  let cellSize: number;
  let count: number;
  let confidence: number;
  let positions: number[];

  const results: { cellSize: number; count: number; confidence: number; source: string }[] = [];

  if (acResult.period > 0 && acResult.confidence > 0.1) {
    results.push({ cellSize: acResult.period, count: Math.round(totalLen / acResult.period), confidence: acResult.confidence, source: 'autocorr' });
  }
  if (derivResult.count > 0 && derivResult.avgGap > 0) {
    results.push({ cellSize: derivResult.avgGap, count: derivResult.count, confidence: 0.5, source: 'deriv' });
  }
  if (colorResult.cellSize > 0 && colorResult.count > 0) {
    results.push({ ...colorResult, source: 'color' });
  }

  if (results.length === 0) {
    return { positions: [], cellSize: 0, count: 0, confidence: 0 };
  }

  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];

  cellSize = best.cellSize;
  count = best.count;
  confidence = best.confidence;

  positions = [];
  for (let i = 0; i <= count; i++) {
    positions.push(Math.min(Math.round(i * cellSize), totalLen - 1));
  }

  if (derivResult.positions.length >= 3 && cellSize > 0) {
    const refinedPositions = refineLinePositions(derivResult.positions, cellSize, totalLen);
    if (refinedPositions.length >= 2) {
      positions = refinedPositions;
      count = positions.length - 1;
      confidence = Math.min(confidence + 0.15, 1.0);
    }
  }

  return { positions, cellSize, count, confidence };
}

function refineLinePositions(detectedPeaks: number[], cellSize: number, totalLen: number): number[] {
  if (detectedPeaks.length < 2 || cellSize <= 0) return detectedPeaks;

  const positions: number[] = [0];
  let current = 0;

  while (current + cellSize < totalLen + cellSize * 0.5) {
    const expected = current + cellSize;
    const nearby = detectedPeaks.find(p => Math.abs(p - expected) < cellSize * 0.3);
    const next = nearby !== undefined ? nearby : Math.round(expected);
    if (next >= totalLen) break;
    positions.push(next);
    current = next;
  }

  if (positions[positions.length - 1] < totalLen - cellSize * 0.3) {
    positions.push(totalLen - 1);
  }

  return positions;
}

/**
 * 修正网格线初始偏移：边缘检测可能把图像边界误识别为第一条网格线
 * 通过检测边缘强度找到真正的第一条网格线位置
 */
function correctGridLineOffset(positions: number[], totalLen: number, direction: 'h' | 'v', imageData: ImageData): number[] {
  if (positions.length < 3) return positions;
  const cellSize = positions.length > 1 ? positions[1] - positions[0] : 20;
  // 如果第一条线离边界太近（<5px），可能是误检测
  if (positions[0] > 5 && positions[0] < totalLen * 0.1) return positions; // 偏移正常，不需要修正

  // 计算边缘强度剖面，找真正的第一条网格线
  const w = imageData.width, h = imageData.height;
  const edgeProfile: number[] = [];
  const scanLen = direction === 'h' ? h : w;

  for (let i = 0; i < scanLen; i++) {
    let edgeSum = 0;
    let count = 0;
    // 沿垂直方向扫描水平线，或沿水平方向扫描垂直线
    if (direction === 'h') {
      // 水平线：在y=i处，扫描x方向的变化
      for (let x = Math.max(1, 0); x < w - 1; x += 2) {
        const idxL = (i * w + x - 1) * 4;
        const idxR = (i * w + x + 1) * 4;
        if (idxL >= 0 && idxR < w * h * 4) {
          edgeSum += Math.abs(imageData.data[idxL] - imageData.data[idxR]) +
                     Math.abs(imageData.data[idxL+1] - imageData.data[idxR+1]) +
                     Math.abs(imageData.data[idxL+2] - imageData.data[idxR+2]);
          count++;
        }
      }
    } else {
      // 垂直线：在x=i处，扫描y方向的变化
      for (let y = Math.max(1, 0); y < h - 1; y += 2) {
        const idxU = ((y - 1) * w + i) * 4;
        const idxD = ((y + 1) * w + i) * 4;
        if (idxU >= 0 && idxD < w * h * 4) {
          edgeSum += Math.abs(imageData.data[idxU] - imageData.data[idxD]) +
                     Math.abs(imageData.data[idxU+1] - imageData.data[idxD+1]) +
                     Math.abs(imageData.data[idxU+2] - imageData.data[idxD+2]);
          count++;
        }
      }
    }
    edgeProfile.push(count > 0 ? edgeSum / count : 0);
  }

  // 在前2个cellSize范围内搜索第一个显著峰值
  const searchRange = Math.min(Math.round(cellSize * 2), Math.floor(scanLen * 0.15));
  let maxEdgeVal = 0;
  let firstRealLinePos = positions[0]; // 默认不偏移

  for (let i = 2; i < searchRange; i++) { // 跳过前2像素（图像边界）
    if (edgeProfile[i] > maxEdgeVal) {
      maxEdgeVal = edgeProfile[i];
      firstRealLinePos = i;
    }
  }

  // 如果找到的第一个强边缘位置与当前position[0]差距>3px，则修正
  if (Math.abs(firstRealLinePos - positions[0]) > 3 && maxEdgeVal > edgeProfile[positions[0]] * 1.5) {
    const shift = firstRealLinePos - positions[0];
    return positions.map(p => Math.min(Math.max(0, p + shift), totalLen - 1));
  }

  return positions;
}

export function detectGridSize(imageData: ImageData): GridDetectionResult {
  const hResult = detectGridLines(imageData, 'h');
  const vResult = detectGridLines(imageData, 'v');

  console.log('=== 网格检测调试 ===');
  console.log(`图片尺寸: ${imageData.width} x ${imageData.height}, 宽高比: ${(imageData.width / imageData.height).toFixed(2)}`);
  console.log(`水平检测(h=行): count=${hResult.count}, cellSize=${hResult.cellSize}, confidence=${hResult.confidence.toFixed(3)}, source=${hResult.cellSize > 0 ? 'detected' : 'failed'}`);
  console.log(`垂直检测(v=列): count=${vResult.count}, cellSize=${vResult.cellSize}, confidence=${vResult.confidence.toFixed(3)}, source=${vResult.cellSize > 0 ? 'detected' : 'failed'}`);

  let cols = vResult.count >= 2 && vResult.count <= 200 ? vResult.count : 0;
  let rows = hResult.count >= 2 && hResult.count <= 200 ? hResult.count : 0;

  const imgAspect = imageData.width / imageData.height;
  const gridAspect = cols > 0 && rows > 0 ? cols / rows : 0;

  console.log(`初始结果: cols=${cols}, rows=${rows}, gridAspect=${gridAspect.toFixed(2)}`);

  if (cols > 0 && rows > 0 && Math.abs(imgAspect - gridAspect) > 0.5) {
    if (imgAspect > 1 && gridAspect < 1) {
      console.log(`⚠️ 宽高比不匹配! 图片宽高(${imgAspect.toFixed(2)}) vs 网格宽高(${gridAspect.toFixed(2)}), 交换行列`);
      const temp = cols;
      cols = rows;
      rows = temp;
    } else if (imgAspect < 1 && gridAspect > 1) {
      console.log(`⚠️ 宽高比不匹配! 交换行列`);
      const temp = cols;
      cols = rows;
      rows = temp;
    }
  }

  console.log(`最终结果: cols=${cols}, rows=${rows}`);

  const confidence = (hResult.confidence + vResult.confidence) / 2;

  // 关键修复：检测并修正网格线的初始偏移
  // 边缘检测可能把图像边界(x=0/y=0)误识别为第一条网格线，导致所有格子坐标偏移
  const correctedVPos = correctGridLineOffset(vResult.positions, imageData.width, 'v', imageData);
  const correctedHPos = correctGridLineOffset(hResult.positions, imageData.height, 'h', imageData);

  if (correctedVPos.length !== vResult.positions.length || correctedHPos.length !== hResult.positions.length) {
    const vShift = correctedVPos.length > 0 && vResult.positions.length > 0 ? correctedVPos[0] - vResult.positions[0] : 0;
    const hShift = correctedHPos.length > 0 && hResult.positions.length > 0 ? correctedHPos[0] - hResult.positions[0] : 0;
    if (Math.abs(vShift) > 3 || Math.abs(hShift) > 3) {
      console.log(`✅ 网格偏移修正: 垂直+${vShift}px, 水平+${hShift}px`);
    }
  }

  return {
    cols,
    rows,
    hLinePositions: correctedHPos,
    vLinePositions: correctedVPos,
    cellWidth: vResult.cellSize,
    cellHeight: hResult.cellSize,
    confidence,
  };
}

/** Median Cut 颜色盒子（LAB 色彩空间） */
interface ColorBox {
  colors: RGBColor[]; // 原始 RGB 采样点
  count: number;
  /** LAB 空间范围（用于选择分裂通道） */
  minL: number; maxL: number;
  minA: number; maxA: number;
  minB: number; maxB: number;
}

function createBox(colors: RGBColor[]): ColorBox {
  if (colors.length === 0) return { colors: [], count: 0, minL: 100, maxL: 0, minA: 128, maxA: -128, minB: 128, maxB: -128 };
  let minL = 100, maxL = 0, minA = 128, maxA = -128, minB = 128, maxB = -128;
  for (const c of colors) {
    const lab = rgbToLab(c.r, c.g, c.b);
    if (lab.l < minL) minL = lab.l; if (lab.l > maxL) maxL = lab.l;
    if (lab.a < minA) minA = lab.a; if (lab.a > maxA) maxA = lab.a;
    if (lab.b < minB) minB = lab.b; if (lab.b > maxB) maxB = lab.b;
  }
  return { colors, count: colors.length, minL, maxL, minA, maxA, minB, maxB };
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] | null {
  const rangeL = box.maxL - box.minL;
  const rangeA = box.maxA - box.minA;
  const rangeB = box.maxB - box.minB;

  const weightedL = rangeL * 0.7;
  const weightedA = rangeA * 1.3;
  const weightedB = rangeB * 1.3;

  // [LOG] 切分决策
  let channel: 'l' | 'a' | 'b';
  if (weightedL >= weightedA && weightedL >= weightedB) channel = 'l';
  else if (weightedA >= weightedL && weightedA >= weightedB) channel = 'a';
  else channel = 'b';

  console.log(`[MedianCut] 切分 ${box.count}色盒: L[${box.minL.toFixed(0)}-${box.maxL.toFixed(0)}] A[${box.minA.toFixed(0)}-${box.maxA.toFixed(0)}] B[${box.minB.toFixed(0)}-${box.maxB.toFixed(0)}] → 沿${channel.toUpperCase()}轴`);

  // 按 LAB 通道值排序后中位切分
  const sorted = [...box.colors].sort((a, b) => {
    const la = rgbToLab(a.r, a.g, a.b);
    const lb = rgbToLab(b.r, b.g, b.b);
    return la[channel] - lb[channel];
  });
  const mid = Math.floor(sorted.length / 2);
  if (mid === 0 || mid === sorted.length) return null;
  return [createBox(sorted.slice(0, mid)), createBox(sorted.slice(mid))];
}

/** 在 LAB 空间计算颜色均值，再转回 RGB */
function getAverageColor(colors: RGBColor[]): RGBColor {
  if (colors.length === 0) return { r: 0, g: 0, b: 0 };
  let sumL = 0, sumA = 0, sumB = 0;
  for (const c of colors) {
    const lab = rgbToLab(c.r, c.g, c.b);
    sumL += lab.l; sumA += lab.a; sumB += lab.b;
  }
  return labToRgb({
    l: sumL / colors.length,
    a: sumA / colors.length,
    b: sumB / colors.length,
  });
}

/** 在 RGB 空间用 CIEDE2000 距离找 medoid：到所有其他像素总距离最小的像素 */
function getMedoidColor(colors: RGBColor[]): RGBColor {
  if (colors.length === 0) return { r: 0, g: 0, b: 0 };
  if (colors.length === 1) return colors[0];

  // 采样控制：像素过多时随机采样以控制计算量
  const maxSamples = 500;
  const candidates = colors.length <= maxSamples
    ? colors
    : Array.from({ length: maxSamples }, () => colors[Math.floor(Math.random() * colors.length)]);

  let bestColor = candidates[0];
  let bestDist = Infinity;

  for (const candidate of candidates) {
    let totalDist = 0;
    for (const other of colors) {
      totalDist += ciede2000(candidate, other);
    }
    if (totalDist < bestDist) {
      bestDist = totalDist;
      bestColor = candidate;
    }
  }

  return bestColor;
}

/** K-means 精炼：在 LAB 空间使用 DeltaE 距离进行聚类 */
function kMeansRefine(colors: RGBColor[], initialCenters: RGBColor[], maxIter: number = 10): RGBColor[] {
  const k = initialCenters.length;
  if (k === 0 || colors.length === 0) return initialCenters;

  console.log(`[KMeans] 开始精炼: ${colors.length}个采样点, ${k}个初始中心, 最大${maxIter}轮迭代`);

  // 将初始中心转为 LAB 空间
  let centersLab = initialCenters.map(c => rgbToLab(c.r, c.g, c.b));

  console.log(`[KMeans] 初始中心 (LAB):`);
  centersLab.forEach((c, i) => {
    const rgb = labToRgb(c);
    console.log(`  中心${i}: L=${c.l.toFixed(1)} a=${c.a.toFixed(1)} b=${c.b.toFixed(1)} → #${rgbToHex(rgb.r, rgb.g, rgb.b)}`);
  });

  for (let iter = 0; iter < maxIter; iter++) {
    const clusters: LABColor[][] = Array.from({ length: k }, () => []);
    const clustersRgb: RGBColor[][] = Array.from({ length: k }, () => []);

    // 分配阶段：用 DeltaE 距离分配到最近中心
    for (const c of colors) {
      const lab = rgbToLab(c.r, c.g, c.b);
      let minDist = Infinity;
      let minIdx = 0;
      for (let i = 0; i < k; i++) {
        const d = labDeltaE(lab, centersLab[i]);
        if (d < minDist) { minDist = d; minIdx = i; }
      }
      clusters[minIdx].push(lab);
      clustersRgb[minIdx].push(c);
    }

    // [LOG] 每轮迭代输出聚类分布
    if (iter < 3 || iter === maxIter - 1) {
      const distStr = clusters.map((cl, i) => `C${i}:${cl.length}`).join(' ');
      console.log(`[KMeans] 迭代${iter + 1}: [${distStr}]`);
    }

    // 更新中心：在 LAB 空间取均值
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (clusters[i].length === 0) continue;
      let sumL = 0, sumA = 0, sumB = 0;
      for (const lab of clusters[i]) { sumL += lab.l; sumA += lab.a; sumB += lab.b; }
      const newCenter = { l: sumL / clusters[i].length, a: sumA / clusters[i].length, b: sumB / clusters[i].length };
      if (newCenter.l !== centersLab[i].l || newCenter.a !== centersLab[i].a || newCenter.b !== centersLab[i].b) {
        centersLab[i] = newCenter;
        changed = true;
      }
    }

    if (!changed) {
      console.log(`[KMeans] ✓ 第${iter + 1}轮收敛 (中心不再变化)`);
      break;
    }
  }

  // 将 LAB 中心转回 RGB 返回
  const result = centersLab.map(lab => labToRgb(lab));

  console.log(`[KMeans] 最终中心:`);
  result.forEach((rgb, i) => {
    console.log(`  中心${i}: #${rgbToHex(rgb.r, rgb.g, rgb.b)}`);
  });

  return result;
}

export function extractColors(
  imageData: ImageData,
  maxColors: number = 32,
  actualGridInfo?: GridDetectionResult,
  backgroundColor?: RGBColor
): ExtractedColor[] {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const allColors: RGBColor[] = [];
  const bg = backgroundColor || { r: 255, g: 255, b: 255 };

  if (actualGridInfo && actualGridInfo.vLinePositions.length > 1 && actualGridInfo.hLinePositions.length > 1) {
    const margin = 0.20;
    for (let row = 0; row < actualGridInfo.hLinePositions.length - 1; row++) {
      for (let col = 0; col < actualGridInfo.vLinePositions.length - 1; col++) {
        const y0 = actualGridInfo.hLinePositions[row];
        const y1 = actualGridInfo.hLinePositions[row + 1];
        const x0 = actualGridInfo.vLinePositions[col];
        const x1 = actualGridInfo.vLinePositions[col + 1];
        const cellH = y1 - y0;
        const cellW = x1 - x0;
        const sy = Math.round(y0 + cellH * margin);
        const ey = Math.round(y1 - cellH * margin);
        const sx = Math.round(x0 + cellW * margin);
        const ex = Math.round(x1 - cellW * margin);

        const checkW = ex - sx, checkH = ey - sy;
        if (checkW >= 4 && checkH >= 4 && isTextRegion(imageData, sx, sy, checkW, checkH, bg)) {
          continue;
        }

        const rList: number[] = [], gList: number[] = [], bList: number[] = [];
        for (let y = sy; y < ey; y++) {
          for (let x = sx; x < ex; x++) {
            if (y < 0 || y >= h || x < 0 || x >= w) continue;
            const idx = (y * w + x) * 4;
            if (data[idx + 3] < 128) continue;
            rList.push(data[idx]); gList.push(data[idx + 1]); bList.push(data[idx + 2]);
          }
        }
        if (rList.length > 0) {
          rList.sort((a, b) => a - b);
          gList.sort((a, b) => a - b);
          bList.sort((a, b) => a - b);
          const mid = Math.floor(rList.length / 2);
          allColors.push({
            r: rList[mid],
            g: gList[mid],
            b: bList[mid]
          });
        }
      }
    }
  } else {
    const step = Math.max(1, Math.floor(Math.sqrt(w * h) / 300));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] < 128) continue;
        allColors.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
  }

  if (allColors.length === 0) return [];

  const nonGridColors = allColors.filter(c => !isGridLineColor(c.r, c.g, c.b));
  const sampleColors = nonGridColors.length > allColors.length * 0.3 ? nonGridColors : allColors;

  let boxes: ColorBox[] = [createBox(sampleColors)];
  const targetBoxes = Math.min(maxColors * 5, sampleColors.length);

  console.log(`[LAB聚类] 开始: ${sampleColors.length}个采样点, 目标${targetBoxes}个色盒`);

  while (boxes.length < targetBoxes) {
    let bestIdx = -1, bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.colors.length <= 1) continue;
      // LAB 空间体积（L范围 × a范围 × b范围）
      const rangeL = box.maxL - box.minL;
      const rangeA = box.maxA - box.minA;
      const rangeB = box.maxB - box.minB;
      const volume = rangeL * rangeA * rangeB;
      const score = volume * Math.log(box.count + 1);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    const result = splitBox(boxes[bestIdx]);
    if (!result) break;
    boxes.splice(bestIdx, 1, ...result);
  }

  console.log(`[LAB聚类] Median Cut完成: ${boxes.length}个色盒`);

  const rawCenters = boxes
    .map(box => getMedoidColor(box.colors))
    .filter((v, i, a) => a.findIndex(t => rgbToHex(t.r, t.g, t.b) === rgbToHex(v.r, v.g, v.b)) === i);

  console.log(`[LAB聚类] 去重后: ${rawCenters.length}个初始中心`);

  const refinedCenters = kMeansRefine(sampleColors, rawCenters, 15);

  const rawColors = refinedCenters.map(center => {
    const hex = rgbToHex(center.r, center.g, center.b);
    let count = 0;
    for (const c of sampleColors) {
      if (ciede2000(c, center) < 6) count++;
    }
    return { hex, count };
  }).filter(c => c.count > 0);

  console.log(
    `[LAB聚类] KMeans精炼后: ${rawColors.length}色`
  );

  const sortedRaw = rawColors.sort((a, b) => b.count - a.count);
  const merged: ExtractedColor[] = [];

  for (const c of sortedRaw) {
    const mergeDist = merged.length === 0 ? 12 : 15;
    const existing = merged.find(m => ciede2000(hexToRgb(m.hex), hexToRgb(c.hex)) < mergeDist);
    if (existing) {
      const existingRgb = hexToRgb(existing.hex);
      const newRgb = hexToRgb(c.hex);
      const total = existing.count + c.count;
      existing.hex = rgbToHex(
        Math.round((existingRgb.r * existing.count + newRgb.r * c.count) / total),
        Math.round((existingRgb.g * existing.count + newRgb.g * c.count) / total),
        Math.round((existingRgb.b * existing.count + newRgb.b * c.count) / total)
      );
      existing.count = total;
    } else {
      merged.push({ ...c });
    }
  }

  // 只过滤掉纯白色（亮度>245且低饱和度），保留浅灰色供图案匹配
  const filtered = merged.filter(c => {
    const rgb = hexToRgb(c.hex);
    const b = (rgb.r + rgb.g + rgb.b) / 3;
    const maxC = Math.max(rgb.r, rgb.g, rgb.b);
    const minC = Math.min(rgb.r, rgb.g, rgb.b);
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
    // 只有极高亮度的纯白才过滤（这是背景纸色，不是图案颜色）
    if (b > 245 && sat < 0.05) return false;
    return true;
  });

  console.log(`[LAB聚类] 合并后${merged.length}色 → 过滤后${filtered.length}色 (移除纯白)`);

  // 关键修复：拆分被白色主导的混合簇
  // 当大量白色像素导致浅灰被合并到近白簇时，通过亮度直方图检测多峰并拆分
  const splitResults: ExtractedColor[] = [];
  for (const c of filtered) {
    const rgb = hexToRgb(c.hex);
    const bright = (rgb.r + rgb.g + rgb.b) / 3;

    // 检查这个簇是否可能包含多种颜色（高像素数 + 中等亮度）
    if (c.count > sampleColors.length * 0.05 && bright > 205 && bright < 248) {
      // 收集该簇附近的所有采样点
      const clusterPoints = sampleColors.filter(p => ciede2000(p, rgb) < 25);

      if (clusterPoints.length > 100) {
        // 构建亮度直方图
        const hist = new Array(256).fill(0);
        for (const p of clusterPoints) {
          const pb = Math.round((p.r + p.g + p.b) / 3);
          hist[Math.max(0, Math.min(255, pb))]++;
        }

        // 找直方图的峰值和谷值
        // 用滑动窗口找局部最小值（谷值）作为分界点
        let bestValley = -1;
        let bestValleyScore = 0;

        // 在亮度 220-250 范围内搜索谷值（白色和浅灰的分界通常在这里）
        for (let v = 225; v <= 248; v++) {
          // 谷值评分：左边高 + 右边高 + 中间低
          const leftSum = hist.slice(Math.max(0, v - 15), v).reduce((a, b) => a + b, 0);
          const rightSum = hist.slice(v + 1, Math.min(256, v + 16)).reduce((a, b) => a + b, 0);
          const centerVal = hist[v];
          const score = (leftSum + rightSum) * 2 - centerVal * 3;

          if (score > bestValleyScore) {
            bestValleyScore = score;
            bestValley = v;
          }
        }

        // 如果找到有效谷值，按此分界拆分
        if (bestValley >= 0 && bestValleyScore > clusterPoints.length * 0.3) {
          const darker = clusterPoints.filter(p => (p.r + p.g + p.b) / 3 < bestValley);
          const brighter = clusterPoints.filter(p => (p.r + p.g + p.b) / 3 >= bestValley);

          if (darker.length > 30 && brighter.length > 30) {
            const avgDarker = getAverageColor(darker);
            const avgBrighter = getAverageColor(brighter);
            const bDark = (avgDarker.r + avgDarker.g + avgDarker.b) / 3;
            const bBright = (avgBrighter.r + avgBrighter.g + avgBrighter.b) / 3;

            // 两部分亮度差必须足够大
            if (Math.abs(bBright - bDark) > 8) {
              const hexDark = rgbToHex(avgDarker.r, avgDarker.g, avgDarker.b);
              const hexBright = rgbToHex(avgBrighter.r, avgBrighter.g, avgBrighter.b);

              // 检查亮部是否为纯白（如果是则过滤掉）
              const maxCB = Math.max(avgBrighter.r, avgBrighter.g, avgBrighter.b);
              const minCB = Math.min(avgBrighter.r, avgBrighter.g, avgBrighter.b);
              const satB = maxCB > 0 ? (maxCB - minCB) / maxCB : 0;
              const isPureWhite = bBright > 245 && satB < 0.05;

              if (!isPureWhite) {
                splitResults.push({ hex: hexDark, count: darker.length });
                splitResults.push({ hex: hexBright, count: brighter.length });
                console.log(`  拆分混合簇 ${c.hex}(${c.count}px) → ${hexDark}(${darker.length}px,亮=${bDark.toFixed(0)}) + ${hexBright}(${brighter.length}px,亮=${bBright.toFixed(0)}) [谷值@${bestValley}]`);
                continue;
              } else {
                // 亮部是纯白，只保留暗部作为真正的图案色
                splitResults.push({ hex: hexDark, count: darker.length });
                console.log(`  拆分混合簇 ${c.hex}(${c.count}px) → ${hexDark}(${darker.length}px,亮=${bDark.toFixed(0)}) + 纯白已过滤 [谷值@${bestValley}]`);
                continue;
              }
            }
          }
        }
      }
    }
    splitResults.push(c);
  }

  console.log(`extractColors: 原始${merged.length}色 → 过滤后${filtered.length}色 → 拆分后${splitResults.length}色`);

  // ============================================================
  // 四类灰/棕颜色强制保留验证（LAB 色彩空间）
  // 必须保留: Light Gray, Dark Gray, Light Brown, Dark Brown
  // 若任意类别缺失，则从采样数据中提取补充
  // ============================================================
  const finalColors = ensureRequiredCategories(splitResults, sampleColors, maxColors);

  console.log(`[LAB聚类] 最终输出 ${finalColors.length} 色:`);
  finalColors.forEach((c, i) => {
    const rgb = hexToRgb(c.hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    console.log(`  ${i + 1}. #${c.hex.toUpperCase()} (${c.count}px) H=${hsl.h.toFixed(0)}° S=${hsl.s.toFixed(1)}% L=${hsl.l.toFixed(1)}%`);
  });

  return finalColors.sort((a, b) => b.count - a.count).slice(0, maxColors);
}

/**
 * 确保八类基础颜色在结果中独立存在（色相优先规则）。
 *
 * 必须保留的类别（基于 HSL 色彩空间）：
 *   - White:       L > 95,  S < 5              (纯白)
 *   - Light Gray:  L ∈ [70, 95], S < 15        (高亮低饱和度近中性)
 *   - Dark Gray:   L ∈ [15, 45], S < 15        (低亮低饱和度近中性)
 *   - Light Blue:  H ∈ [180, 270], L > 50      (浅蓝色系)
 *   - Dark Blue:   H ∈ [180, 270], L ≤ 50      (深蓝色系)
 *   - Light Brown: H ∈ [20, 50],  L > 50       (浅棕色/米色)
 *   - Brown:       H ∈ [20, 50],  L ∈ [30, 55] (标准棕色)
 *   - Dark Brown:  H ∈ [20, 50],  L < 30       (深褐色)
 *
 * 核心规则：
 *   - 即使亮度接近，也不得合并不同色相类别
 *   - Blue 被归类为 Gray → 识别失败，重新聚类
 *   - Brown 被归类为 Gray → 识别失败，重新聚类
 */
function ensureRequiredCategories(
  colors: ExtractedColor[],
  sampleColors: RGBColor[],
  maxColors: number
): ExtractedColor[] {
  interface RequiredCategory {
    name: string;
    /** HSL 空间判定条件（色相优先） */
    matchFn: (hsl: { h: number; s: number; l: number }) => boolean;
    /** 理想 HSL 值（用于合成颜色） */
    idealHsl: { h: number; s: number; l: number };
    /** 搜索优先级权重 */
    searchPriority: (hsl: { h: number; s: number; l: number }) => number;
  }

  const categories: RequiredCategory[] = [
    // === 无彩色系（灰度）===
    {
      name: 'White',
      matchFn: (hsl) => hsl.l > 95 && hsl.s < 5,
      idealHsl: { h: 0, s: 0, l: 100 },
      searchPriority: (hsl) => -(Math.abs(hsl.l - 100) + hsl.s),
    },
    {
      name: 'Light_Gray',
      matchFn: (hsl) => hsl.l >= 70 && hsl.l <= 95 && hsl.s < 15,
      idealHsl: { h: 0, s: 0, l: 85 },
      searchPriority: (hsl) => -(Math.abs(hsl.l - 85) + hsl.s),
    },
    {
      name: 'Dark_Gray',
      matchFn: (hsl) => hsl.l >= 15 && hsl.l <= 45 && hsl.s < 15,
      idealHsl: { h: 0, s: 0, l: 30 },
      searchPriority: (hsl) => -(Math.abs(hsl.l - 30) + hsl.s),
    },

    // === 蓝色系 (Hue: 180°-270°) ===
    {
      name: 'Light_Blue',
      matchFn: (hsl) => hsl.h >= 180 && hsl.h <= 270 && hsl.l > 50 && hsl.s > 10,
      idealHsl: { h: 210, s: 40, l: 75 }, // 浅蓝 #6BA3D4
      searchPriority: (hsl) => -(Math.abs(hsl.h - 210) + Math.abs(hsl.l - 75)),
    },
    {
      name: 'Dark_Blue',
      matchFn: (hsl) => hsl.h >= 180 && hsl.h <= 270 && hsl.l <= 50 && hsl.s > 10,
      idealHsl: { h: 220, s: 60, l: 35 }, // 深蓝 #2B4C7E
      searchPriority: (hsl) => -(Math.abs(hsl.h - 220) + Math.abs(hsl.l - 35)),
    },

    // === 棕色系 (Hue: 20°-50°, 橙-黄区域) ===
    {
      name: 'Light_Brown',
      matchFn: (hsl) => hsl.h >= 20 && hsl.h <= 50 && hsl.l > 50 && hsl.s > 10,
      idealHsl: { h: 35, s: 35, l: 70 }, // 浅棕/米色 #C9B896
      searchPriority: (hsl) => -(Math.abs(hsl.h - 35) + Math.abs(hsl.l - 70)),
    },
    {
      name: 'Brown',
      matchFn: (hsl) => hsl.h >= 20 && hsl.h <= 50 && hsl.l >= 30 && hsl.l <= 55 && hsl.s > 15,
      idealHsl: { h: 30, s: 50, l: 42 }, // 标准棕 #8B6914 → 实际 #A0522D
      searchPriority: (hsl) => -(Math.abs(hsl.h - 30) + Math.abs(hsl.l - 42)),
    },
    {
      name: 'Dark_Brown',
      matchFn: (hsl) => hsl.h >= 20 && hsl.h <= 50 && hsl.l < 30 && hsl.s > 10,
      idealHsl: { h: 28, s: 55, l: 22 }, // 深褐 #5D3A1A
      searchPriority: (hsl) => -(Math.abs(hsl.h - 28) + Math.abs(hsl.l - 22)),
    },
  ];

  console.log(`\n[HSL验证] 开始检查 ${categories.length} 类必需颜色...`);

  // ============================================================
  // Step 1: 检查哪些类别已存在（基于 HSL 分类）
  // ============================================================
  const present = new Map<string, { color: ExtractedColor; hsl: { h: number; s: number; l: number } }>();

  for (const c of colors) {
    const rgb = hexToRgb(c.hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    for (const cat of categories) {
      if (cat.matchFn(hsl)) {
        // 如果该类别已存在，选择更匹配的
        if (!present.has(cat.name)) {
          present.set(cat.name, { color: c, hsl });
          console.log(`[HSL验证] ✓ 发现 ${cat.name}: #${c.hex.toUpperCase()} (H=${hsl.h.toFixed(0)}° S=${hsl.s.toFixed(1)}% L=${hsl.l.toFixed(1)}%)`);
        }
        break;
      }
    }
  }

  // ============================================================
  // Step 2: 验证关键规则 — 检测误分类
  // ============================================================
  const misclassified: string[] = [];

  // 规则: Blue 不能被归类为 Gray
  for (const c of colors) {
    const rgb = hexToRgb(c.hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    // 检查是否是蓝色但被错误分类为灰色
    if ((hsl.h >= 180 && hsl.h <= 270) && hsl.s > 10) {
      const isClassifiedAsGray = present.has('Light_Gray') || present.has('Dark_Gray');
      if (isClassifiedAsGray && !present.has('Light_Blue') && !present.has('Dark_Blue')) {
        misclassified.push(`Blue(#${c.hex.toUpperCase()}) 被误判为 Gray`);
      }
    }

    // 检查是否是棕色但被错误分类为灰色
    if ((hsl.h >= 20 && hsl.h <= 50) && hsl.s > 10) {
      const isClassifiedAsGray = present.has('Light_Gray') || present.has('Dark_Gray');
      if (isClassifiedAsGray && !present.has('Light_Brown') && !present.has('Brown') && !present.has('Dark_Brown')) {
        misclassified.push(`Brown(#${c.hex.toUpperCase()}) 被误判为 Gray`);
      }
    }
  }

  if (misclassified.length > 0) {
    console.log(`\n[HSL验证] ✗ 检测到严重误分类:`);
    misclassified.forEach(m => console.log(`  - ${m}`));
    console.log(`[HSL验证] 触发强制补充模式...`);
  }

  // ============================================================
  // Step 3: 补充缺失类别
  // ============================================================
  const missing = categories.filter(c => !present.has(c.name));

  if (missing.length === 0 && misclassified.length === 0) {
    console.log(`\n[HSL验证] ✓ 全部 ${categories.length} 类颜色均已正确识别:`);
    [...present.keys()].forEach(k => console.log(`  - ${k}`));
    return colors;
  }

  console.log(`\n[HSL验证] 缺失类别: ${missing.map(m => m.name).join(', ')}`);

  const added: ExtractedColor[] = [];

  for (const cat of missing) {
    let bestSample: RGBColor | null = null;
    let bestScore = Infinity;

    // 在采样数据中搜索最佳代表色
    for (const s of sampleColors) {
      const shsl = rgbToHsl(s.r, s.g, s.b);
      if (!cat.matchFn(shsl)) continue;

      const score = cat.searchPriority(shsl);
      if (score < bestScore) {
        bestScore = score;
        bestSample = s;
      }
    }

    if (bestSample) {
      // 收集该类别附近的采样点
      const centerHsl = rgbToHsl(bestSample.r, bestSample.g, bestSample.b);
      const nearby = sampleColors.filter(s => {
        const shsl = rgbToHsl(s.r, s.g, s.b);
        // HSL空间的距离计算（考虑色相环特性）
        const dh = Math.min(Math.abs(shsl.h - centerHsl.h), 360 - Math.abs(shsl.h - centerHsl.h));
        const ds = Math.abs(shsl.s - centerHsl.s);
        const dl = Math.abs(shsl.l - centerHsl.l);
        return (dh < 30 && ds < 25 && dl < 20) && cat.matchFn(shsl);
      });

      const avgColor = nearby.length >= 3 ? getAverageColor(nearby) : bestSample;
      const hex = rgbToHex(avgColor.r, avgColor.g, avgColor.b);
      added.push({ hex, count: nearby.length });

      const finalHsl = rgbToHsl(avgColor.r, avgColor.g, avgColor.b);
      console.log(`[HSL验证] ✓ 补充 ${cat.name}: #${hex.toUpperCase()} (${nearby.length}px, H=${finalHsl.h.toFixed(0)}° S=${finalHsl.s.toFixed(1)}% L=${finalHsl.l.toFixed(1)}%)`);
    } else {
      // 使用合成的理想颜色
      const syntheticRgb = hslToRgb(cat.idealHsl.h, cat.idealHsl.s, cat.idealHsl.l);
      const hex = rgbToHex(syntheticRgb.r, syntheticRgb.g, syntheticRgb.b);
      added.push({ hex, count: 0 }); // count=0 表示合成色

      console.log(`[HSL验证] ⚠ 合成 ${cat.name}: #${hex.toUpperCase()} (理想HSL=[${cat.idealHsl.h}°,${cat.idealHsl.s}%,${cat.idealHsl.l}%])`);
    }
  }

  // ============================================================
  // Step 4: 合并结果（合成色强制添加）
  // ============================================================
  const result = [...colors];

  for (const a of added) {
    if (a.count === 0) {
      // 合成颜色强制添加（不进行去重检查）
      result.push(a);
      console.log(`[HSL验证] 强制添加合成色 #${a.hex.toUpperCase()}`);
    } else {
      // 检查是否与已有颜色过于接近（DeltaE < 8）
      const tooClose = result.find(r => {
        const rLab = hexToRgb(r.hex);
        const aLab = hexToRgb(a.hex);
        const rLAB = rgbToLab(rLab.r, rLab.g, rLab.b);
        const aLAB = rgbToLab(aLab.r, aLab.g, aLab.b);
        return labDeltaE(rLAB, aLAB) < 8;
      });

      if (!tooClose) {
        result.push(a);
      } else {
        console.log(`[HSL验证] 跳过 #${a.hex.toUpperCase()} — 与已有 #${tooClose.hex.toUpperCase()} 过于接近`);
      }
    }
  }

  console.log(`\n[HSL验证] 最终结果: ${colors.length}色 → ${result.length}色 (补充${added.length})`);

  return result;
}

/** HSL → RGB (用于生成合成颜色) */
function hslToRgb(h: number, s: number, l: number): RGBColor {
  h /= 360; s /= 100; l /= 100;

  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255))),
  };
}

/** 辅助：根据 LAB 坐标判断颜色所属的灰/棕类别名称 */
function classifyGrayBrownCategory(hex: string): string | null {
  const rgb = hexToRgb(hex);
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b);

  // 计算色调角（hue angle），用于区分不同色相
  // hue: 0°=红, 90°=黄, 180°=绿, 270°=蓝
  let hue = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  if (hue < 0) hue += 360;

  // === 灰色判定：必须同时满足低饱和度和中性色调 ===
  // Chroma阈值降低到15（原20），避免低饱和度彩色误判
  if (chroma < 15) {
    // 额外检查：灰色应该接近中性轴（|hue| 接近 0° 或 180°）
    // 允许轻微偏移（±25°），但排除明显的蓝色(b<0)或红色(a>0,b>0)
    const isNeutralGray = Math.abs(lab.a) < 10 && Math.abs(lab.b) < 10;

    if (isNeutralGray || chroma < 8) {
      if (lab.l >= 70 && lab.l <= 95) return 'Light_Gray';
      if (lab.l >= 15 && lab.l <= 45) return 'Dark_Gray';
    }
  }

  // === 棕色判定：必须在橙-棕色调范围内 ===
  // 棕色的特征：a>0(红), b>0(黄), 且 b/a 在合理比例(0.3~2.0)
  // 排除纯红色(a大,b小)和黄色(a小,b大)
  if (lab.a > 8 && lab.b > 3) {
    const brownRatio = lab.b / lab.a; // 棕色典型比值: 0.5~1.8
    if (brownRatio >= 0.3 && brownRatio <= 2.0) {
      // 额外检查：排除高饱和度红色（a > 40 表示明显偏红）
      if (lab.a < 45) {
        if (lab.l >= 50 && lab.l <= 80) return 'Light_Brown';
        if (lab.l >= 15 && lab.l <= 45) return 'Dark_Brown';
      }
    }
  }

  // 不属于四类灰/棕（可能是蓝色、红色、绿色等其他颜色）
  return null;
}

export function denoiseImage(imageData: ImageData, radius: number = 1): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width, height = imageData.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rArr: number[] = [], gArr: number[] = [], bArr: number[] = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = (ny * width + nx) * 4;
            rArr.push(data[idx]); gArr.push(data[idx + 1]); bArr.push(data[idx + 2]);
          }
        }
      }
      rArr.sort((a, b) => a - b); gArr.sort((a, b) => a - b); bArr.sort((a, b) => a - b);
      const mid = Math.floor(rArr.length / 2);
      const idx = (y * width + x) * 4;
      imageData.data[idx] = rArr[mid]; imageData.data[idx + 1] = gArr[mid]; imageData.data[idx + 2] = bArr[mid];
    }
  }
  return imageData;
}

export function enhanceContrast(imageData: ImageData, factor: number = 1.3): ImageData {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000);
    histogram[gray]++;
  }
  let cumSum = 0;
  const totalPixels = data.length / 4;
  const cdf = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    cumSum += histogram[i];
    cdf[i] = cumSum / totalPixels;
  }
  const cdfMin = cdf.find(v => v > 0) || 0;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const val = data[i + c];
      const eq = Math.round((cdf[val] - cdfMin) / (1 - cdfMin) * 255);
      const enhanced = Math.round(((eq - 128) * factor) + 128);
      data[i + c] = Math.min(255, Math.max(0, enhanced));
    }
  }
  return imageData;
}

export function sharpenImage(imageData: ImageData, strength: number = 0.8): ImageData {
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 4 + strength, -1, 0, -1, 0];
  const kSum = 4 + strength - 4;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const sidx = ((y + ky - 1) * width + (x + kx - 1)) * 4;
            sum += src[sidx + c] * kernel[ky * 3 + kx];
          }
        }
        data[idx + c] = Math.min(255, Math.max(0, Math.round(sum / kSum)));
      }
    }
  }
  return imageData;
}

export function findClosestColor(color: string, palette: string[], maxDist: number = 25): string {
  if (palette.length === 0) return color;
  const colorRgb = hexToRgb(color);
  let closest = palette[0];
  let minDist = ciede2000(colorRgb, hexToRgb(closest));

  for (let i = 1; i < palette.length; i++) {
    const dist = ciede2000(colorRgb, hexToRgb(palette[i]));
    if (dist < minDist) {
      minDist = dist;
      closest = palette[i];
    }
  }

  if (minDist > maxDist) {
    return color;
  }

  return closest;
}

export function imageToGrid(
  imageData: ImageData,
  targetCols: number,
  targetRows: number,
  palette: string[],
  actualGridInfo?: GridDetectionResult,
  backgroundColor?: RGBColor,
  onProgress?: (progress: number) => void
): GridCell[][] {
  const grid: GridCell[][] = [];
  const imgW = imageData.width;
  const imgH = imageData.height;
  const totalCells = targetRows * targetCols;
  let processedCells = 0;
  const bg = backgroundColor || { r: 255, g: 255, b: 255 };

  // 规则命中计数器（用于诊断浅灰识别问题）
  const ruleStats = { R1: 0, R1_5_white: 0, R1_5_gray: 0, R2_white: 0, R2_match: 0, R3_match: 0, textRegion: 0, empty: 0 };

  // 关键诊断：直接从ImageData读取浅灰图案区的原始像素值
  // 测试图片参数: COLS=44, ROWS=43, CELL_SIZE=20, offsetX=10, offsetY=10
  console.log(`\n=== 原始像素诊断 (imgW=${imgW}, imgH=${imgH}) ===`);
  const DIAG_CELLS = [
    [25,14], [25,16], [26,15], [27,17], [28,14],  // 横条浅灰(空心区内)
    [10,2], [15,1], [20,3],                          // 左侧竖条浅灰
    [18,41], [24,42], [30,40],                       // 右侧竖条浅灰
    [13,20], [15,22], [20,20],                       // 空心纯白区
    [6,2], [38,32],                                  // 深灰符号
    [5,5], [35,20],                                  // 外圈白色格
  ];
  for (const [r, c] of DIAG_CELLS) {
    const cx = Math.round(10 + c * 20 + 10);
    const cy = Math.round(10 + r * 20 + 10);
    if (cx >= 0 && cx < imgW && cy >= 0 && cy < imgH) {
      const idx = (cy * imgW + cx) * 4;
      const pr = imageData.data[idx];
      const pg = imageData.data[idx + 1];
      const pb = imageData.data[idx + 2];
      console.log(`  原始像素[${String(r).padStart(2)},${String(c).padStart(2)}] @(${String(cx).padStart(4)},${String(cy).padStart(4)}) = RGB(${pr},${pg},${pb}) b=${Math.round((pr+pg+pb)/3)}`);
    }
  }

  // 诊断网格线位置是否正确
  if (actualGridInfo && actualGridInfo.vLinePositions.length > 1 && actualGridInfo.hLinePositions.length > 1) {
    console.log(`\n=== 网格线位置诊断 ===`);
    console.log(`检测到 ${actualGridInfo.vLinePositions.length} 条垂直线, ${actualGridInfo.hLinePositions.length} 条水平线`);
    // 显示前几条和关键位置的网格线
    const vp = actualGridInfo.vLinePositions;
    const hp = actualGridInfo.hLinePositions;
    console.log(`垂直线(前8): ${vp.slice(0,8).map(v=>v.toFixed(0)).join(', ')}`);
    console.log(`水平线(前8): ${hp.slice(0,8).map(h=>h.toFixed(0)).join(', ')}`);
    // 关键格子[25,14]的实际采样范围
    if (vp.length > 15 && hp.length > 26) {
      const x0_25_14 = vp[14], x1_25_14 = vp[15];
      const y0_25_14 = hp[25], y1_25_14 = hp[26];
      const margin = 0.20;
      const sx = Math.max(0, Math.round(x0_25_14 + (x1_25_14-x0_25_14)*margin));
      const ex = Math.min(imgW, Math.round(x1_25_14 - (x1_25_14-x0_25_14)*margin));
      const sy = Math.max(0, Math.round(y0_25_14 + (y1_25_14-y0_25_14)*margin));
      const ey = Math.min(imgH, Math.round(y1_25_14 - (y1_25_14-y0_25_14)*margin));
      console.log(`\n格子[25,14] 网格范围:`);
      console.log(`  垂直: x[${14}]=${x0_25_14?.toFixed(0)} ~ x[${15}]=${x1_25_14?.toFixed(0)} (宽=${(x1_25_14-x0_25_14)?.toFixed(0)})`);
      console.log(`  水平: y[${25}]=${y0_25_14?.toFixed(0)} ~ y[${26}]=${y1_25_14?.toFixed(0)} (高=${(y1_25_14-y0_25_14)?.toFixed(0)})`);
      console.log(`  采样区域: (${sx},${sy}) ~ (${ex},${ey})`);
      console.log(`  预期固定坐标: (300, 520) ~ (320, 540)`);
      // 对比：读取网格采样区域中心的像素
      const mcx = Math.round((sx+ex)/2), mcy = Math.round((sy+ey)/2);
      if (mcx < imgW && mcy < imgH) {
        const midx = (mcy * imgW + mcx) * 4;
        console.log(`  网格采样中心(${mcx},${mcy}) = RGB(${imageData.data[midx]},${imageData.data[midx+1]},${imageData.data[midx+2]})`);
      }
    }
  }

  if (actualGridInfo && actualGridInfo.vLinePositions.length > 1 && actualGridInfo.hLinePositions.length > 1) {
    const vLines = actualGridInfo.vLinePositions;
    const hLines = actualGridInfo.hLinePositions;
    const gridRows = hLines.length - 1;
    const gridCols = vLines.length - 1;

    for (let row = 0; row < targetRows; row++) {
      grid[row] = [];
      for (let col = 0; col < targetCols; col++) {
        let srcRow = row;
        let srcCol = col;

        if (gridRows !== targetRows || gridCols !== targetCols) {
          srcRow = Math.min(Math.floor(row * gridRows / targetRows), gridRows - 1);
          srcCol = Math.min(Math.floor(col * gridCols / targetCols), gridCols - 1);
        }

        if (srcRow >= gridRows || srcCol >= gridCols) {
          grid[row][col] = { row, col, color: palette.length > 0 ? palette[0] : GRID_BACKGROUND, symbol: undefined };
          continue;
        }

        const y0 = hLines[srcRow];
        const y1 = hLines[srcRow + 1];
        const x0 = vLines[srcCol];
        const x1 = vLines[srcCol + 1];
        const cellH = y1 - y0;
        const cellW = x1 - x0;

        const margin = 0.20;
        const sy = Math.max(0, Math.round(y0 + cellH * margin));
        const ey = Math.min(imgH, Math.round(y1 - cellH * margin));
        const sx = Math.max(0, Math.round(x0 + cellW * margin));
        const ex = Math.min(imgW, Math.round(x1 - cellW * margin));

        const checkW1 = ex - sx, checkH1 = ey - sy;
        if (checkW1 >= 4 && checkH1 >= 4 && isTextRegion(imageData, sx, sy, checkW1, checkH1, bg)) {
          grid[row][col] = { row, col, color: GRID_BACKGROUND, symbol: undefined };
          processedCells++;
          if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
          continue;
        }

        const rList: number[] = [], gList: number[] = [], bList: number[] = [];
        for (let y = sy; y < ey; y++) {
          for (let x = sx; x < ex; x++) {
            const idx = (y * imgW + x) * 4;
            rList.push(imageData.data[idx]); gList.push(imageData.data[idx + 1]); bList.push(imageData.data[idx + 2]);
          }
        }

        if (rList.length === 0) {
          grid[row][col] = { row, col, color: GRID_BACKGROUND, symbol: undefined };
          processedCells++;
          if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
          continue;
        }

        rList.sort((a, b) => a - b); gList.sort((a, b) => a - b); bList.sort((a, b) => a - b);
        const mid = Math.floor(rList.length / 2);
        const avgR = rList[mid], avgG = gList[mid], avgB = bList[mid];
        const brightness = (avgR + avgG + avgB) / 3;

        let finalColor: string;
        // Rule1: 极高亮度纯白 → 归白
        if (brightness > 252) {
          finalColor = PATTERN_WHITE;
          ruleStats.R1++;
        } else if (brightness > 246 && backgroundColor && palette.length >= 2) {
          // Rule1.5: 极高亮度(>246) 且比任何非白色都更接近白色 → 归白
          // 阈值从238提高到246，避免浅灰图案(b~228-240)被误杀
          const distToWhite = ciede2000({r:avgR,g:avgG,b:avgB}, {r:255,g:255,b:255});
          let minNonWhiteDist = Infinity;
          for (let i = 1; i < palette.length; i++) {
            const pr = hexToRgb(palette[i]);
            const d = ciede2000({r:avgR,g:avgG,b:avgB}, pr);
            if (d < minNonWhiteDist) minNonWhiteDist = d;
          }
          if (distToWhite < minNonWhiteDist * 1.3) {
            finalColor = PATTERN_WHITE;
            ruleStats.R1_5_white++;
          } else {
            const hex = rgbToHex(avgR, avgG, avgB);
            finalColor = palette.length > 0 ? findClosestColor(hex, palette) : hex;
            ruleStats.R1_5_gray++;
          }
        } else if (backgroundColor) {
          // Rule2: 极接近背景色（diff<8）→ 归白
          const bgR = backgroundColor.r, bgG = backgroundColor.g, bgB = backgroundColor.b;
          const colorDiff = Math.abs(avgR - bgR) + Math.abs(avgG - bgG) + Math.abs(avgB - bgB);

          if (colorDiff < 8) {
            finalColor = PATTERN_WHITE;
            ruleStats.R2_white++;
          } else {
            const hex = rgbToHex(avgR, avgG, avgB);
            finalColor = palette.length > 0 ? findClosestColor(hex, palette) : hex;
            ruleStats.R2_match++;
          }
        } else {
          const hex = rgbToHex(avgR, avgG, avgB);
          finalColor = palette.length > 0 ? findClosestColor(hex, palette) : hex;
          ruleStats.R3_match++;
        }

        // 调试日志：采样关键区域格子（前5列 + 浅灰图案区 + 深灰符号区）
        const isInGrayArea = (srcRow >= 12 && srcRow <= 28 && srcCol >= 14 && srcCol <= 29);
        const isInDarkArea = (srcRow >= 36 && srcRow <= 40 && srcCol >= 38 && srcCol <= 42);
        if ((row === 0 && col < 8) || isInGrayArea || isInDarkArea) {
          let ruleName = 'unknown';
          if (brightness > 252) ruleName = 'R1(b>252)';
          else if (brightness > 238 && backgroundColor && palette.length >= 2) {
            const dtw = ciede2000({r:avgR,g:avgG,b:avgB}, {r:255,g:255,b:255});
            let mnw = Infinity;
            for (let i = 1; i < palette.length; i++) { const pr=hexToRgb(palette[i]); const d=ciede2000({r:avgR,g:avgG,b:avgB},pr); if(d<mnw)mnw=d; }
            ruleName = finalColor===PATTERN_WHITE ? `R1.5(白d=${dtw.toFixed(1)}<灰d*1.3=${(mnw*1.3).toFixed(1)})` : `R1.5→${finalColor}(白d=${dtw.toFixed(1)}>=灰d*1.3)`;
          } else if (backgroundColor) {
            const cd = Math.abs(avgR-backgroundColor.r)+Math.abs(avgG-backgroundColor.g)+Math.abs(avgB-backgroundColor.b);
            ruleName = cd < 8 ? `R2(diff=${cd})` : `R3(${finalColor})`;
          } else {
            ruleName = `R3(${finalColor})`;
          }
          console.log(`[${srcRow},${srcCol}] RGB(${avgR},${avgG},${avgB}) b=${brightness.toFixed(0)} → ${finalColor} (${ruleName})`);
        }

        grid[row][col] = { row, col, color: finalColor, symbol: undefined };
        processedCells++;
        if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
      }
    }
  } else {
    const cellWidth = imgW / targetCols;
    const cellHeight = imgH / targetRows;
    const margin = 0.18;

    for (let row = 0; row < targetRows; row++) {
      grid[row] = [];
      for (let col = 0; col < targetCols; col++) {
        const startX = Math.max(0, Math.floor((col + margin) * cellWidth));
        const endX = Math.min(imgW, Math.ceil((col + 1 - margin) * cellWidth));
        const startY = Math.max(0, Math.floor((row + margin) * cellHeight));
        const endY = Math.min(imgH, Math.ceil((row + 1 - margin) * cellHeight));

        const checkW2 = endX - startX, checkH2 = endY - startY;
        if (checkW2 >= 4 && checkH2 >= 4 && isTextRegion(imageData, startX, startY, checkW2, checkH2, bg)) {
          grid[row][col] = { row, col, color: GRID_BACKGROUND, symbol: undefined };
          processedCells++;
          if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
          continue;
        }

        const rList2: number[] = [], gList2: number[] = [], bList2: number[] = [];
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * imgW + x) * 4;
            rList2.push(imageData.data[idx]); gList2.push(imageData.data[idx + 1]); bList2.push(imageData.data[idx + 2]);
          }
        }

        if (rList2.length === 0) {
          grid[row][col] = { row, col, color: GRID_BACKGROUND, symbol: undefined };
          processedCells++;
          if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
          continue;
        }

        rList2.sort((a, b) => a - b); gList2.sort((a, b) => a - b); bList2.sort((a, b) => a - b);
        const mid2 = Math.floor(rList2.length / 2);
        const avgR2 = rList2[mid2], avgG2 = gList2[mid2], avgB2 = bList2[mid2];
        const brightness2 = (avgR2 + avgG2 + avgB2) / 3;

        let finalColor2: string;
        // Rule1: 极高亮度纯白 → 归白
        if (brightness2 > 252) {
          finalColor2 = PATTERN_WHITE;
        } else if (brightness2 > 238 && backgroundColor && palette.length >= 2) {
          // Rule1.5: 高亮度 + 比任何非白色都更接近白色 → 归白
          const distToWhite2 = ciede2000({r:avgR2,g:avgG2,b:avgB2}, {r:255,g:255,b:255});
          let minNonWhiteDist2 = Infinity;
          for (let i = 1; i < palette.length; i++) {
            const pr2 = hexToRgb(palette[i]);
            const d2 = ciede2000({r:avgR2,g:avgG2,b:avgB2}, pr2);
            if (d2 < minNonWhiteDist2) minNonWhiteDist2 = d2;
          }
          if (distToWhite2 < minNonWhiteDist2 * 1.3) {
            finalColor2 = PATTERN_WHITE;
          } else {
            const hex2 = rgbToHex(avgR2, avgG2, avgB2);
            finalColor2 = palette.length > 0 ? findClosestColor(hex2, palette) : hex2;
          }
        } else if (backgroundColor) {
          // Rule2: 极接近背景色（diff<8）→ 归白
          const bgR = backgroundColor.r, bgG = backgroundColor.g, bgB = backgroundColor.b;
          const colorDiff2 = Math.abs(avgR2 - bgR) + Math.abs(avgG2 - bgG) + Math.abs(avgB2 - bgB);

          if (colorDiff2 < 8) {
            finalColor2 = PATTERN_WHITE;
          } else {
            const hex2 = rgbToHex(avgR2, avgG2, avgB2);
            finalColor2 = palette.length > 0 ? findClosestColor(hex2, palette) : hex2;
          }
        } else {
          const hex2 = rgbToHex(avgR2, avgG2, avgB2);
          finalColor2 = palette.length > 0 ? findClosestColor(hex2, palette) : hex2;
        }

        grid[row][col] = { row, col, color: finalColor2, symbol: undefined };
        processedCells++;
        if (onProgress && processedCells % Math.ceil(totalCells / 20) === 0) onProgress(Math.round((processedCells / totalCells) * 100));
      }
    }
  }

  // 详细颜色统计诊断
  const colorStats = new Map<string, number>();
  const whiteSamples: {row:number,col:number,r:number,g:number,b:number,brightness:number}[] = [];
  const graySamples: {row:number,col:number,r:number,g:number,b:number,brightness:number}[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = grid[r][c].color;
      colorStats.set(color, (colorStats.get(color) || 0) + 1);
    }
  }
  console.log(`\n[网格颜色统计] ${targetCols}x${targetRows} = ${totalCells}格:`);
  console.log(`[规则命中统计] R1:${ruleStats.R1} | R1.5→白:${ruleStats.R1_5_white} R1.5→灰:${ruleStats.R1_5_gray} | R2→白:${ruleStats.R2_white} R2→匹配:${ruleStats.R2_match} | R3匹配:${ruleStats.R3_match} | 文本区:${ruleStats.textRegion} 空格:${ruleStats.empty}`);
  const sortedColors = [...colorStats.entries()].sort((a,b)=>b[1]-a[1]);
  sortedColors.forEach(([color, count]) => {
    console.log(`  ${color}: ${count}格 (${(count/totalCells*100).toFixed(1)}%)`);
  });
  return grid;
}

function isTextRegion(imageData: ImageData, x: number, y: number, w: number, h: number, _bg: RGBColor): boolean {
  if (w < 4 || h < 4) return false;
  const { data, width, height } = imageData;
  const binary: number[] = [];
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const ix = x + px, iy = y + py;
      if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
        const idx = (iy * width + ix) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        if (data[idx + 3] >= 128 && brightness > 30) {
          binary.push(1);
        } else {
          binary.push(0);
        }
      } else {
        binary.push(0);
      }
    }
  }
  const filled = binary.filter(v => v === 1).length;
  const filledRatio = filled / binary.length;
  if (filledRatio < 0.05 || filledRatio > 0.9) return false;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (binary[py * w + px] === 1) {
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const aspectRatio = bh > 0 ? bw / bh : 1;

  let transitions = 0;
  for (let py = 1; py < h - 1; py++) {
    for (let px = 1; px < w - 1; px++) {
      if (binary[py * w + px] !== binary[py * w + px - 1]) transitions++;
      if (binary[py * w + px] !== binary[(py - 1) * w + px]) transitions++;
    }
  }
  const transPerPixel = filled > 0 ? transitions / filled : 0;

  let topHalf = 0, bottomHalf = 0;
  const midY = Math.floor(h / 2);
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === 1) {
      if (Math.floor(i / w) < midY) topHalf++; else bottomHalf++;
    }
  }
  const vertAsymmetry = Math.abs(topHalf - bottomHalf) / Math.max(1, topHalf + bottomHalf);

  let leftHalf = 0, rightHalf = 0;
  const midX = Math.floor(w / 2);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (binary[py * w + px] === 1) {
        if (px < midX) leftHalf++; else rightHalf++;
      }
    }
  }
  const horizAsymmetry = Math.abs(leftHalf - rightHalf) / Math.max(1, leftHalf + rightHalf);

  const isTextLike =
    (aspectRatio > 8.0 || aspectRatio < 0.1) ||
    (transPerPixel > 8.0 && filledRatio > 0.15 && filledRatio < 0.65) ||
    (vertAsymmetry > 0.8 && aspectRatio > 4.0) ||
    (horizAsymmetry > 0.8 && transPerPixel > 5.0) ||
    (filledRatio > 0.3 && filledRatio < 0.65 && transPerPixel > 6.0);

  return isTextLike;
}

interface SymbolTemplate {
  name: string;
  symbol: string;
  patterns: number[][][];
  threshold: number;
  features: { solidity: [number, number]; aspectRatio: [number, number]; centerDensity: [number, number]; eulerApprox: [number, number] };
}

const CROCHET_SYMBOLS: SymbolTemplate[] = [
  {
    name: '短针', symbol: 'crochet-sc',
    patterns: [
      [[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],[1,1,1,1,1,1],[0,1,1,1,1,0],[0,0,1,1,0,0]],
      [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.44,
    features: { solidity: [0.6, 1.0], aspectRatio: [0.7, 1.5], centerDensity: [0.7, 1.0], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '长针', symbol: 'crochet-dc',
    patterns: [
      [[0,0,1,1,0,0],[0,1,0,0,1,0],[1,0,0,0,0,1],[1,0,0,0,0,1],[0,1,0,0,1,0],[0,0,1,1,0,0]],
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.40,
    features: { solidity: [0.3, 0.65], aspectRatio: [0.8, 1.3], centerDensity: [0.15, 0.45], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '减针', symbol: 'crochet-sc2tog',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1]],
      [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1]],
    ],
    threshold: 0.42,
    features: { solidity: [0.35, 0.75], aspectRatio: [0.5, 1.0], centerDensity: [0.35, 0.7], eulerApprox: [0.5, 1.5] },
  },
  {
    name: '加针', symbol: 'crochet-sc-plus',
    patterns: [
      [[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]],
      [[1,1,1,1,1],[0,1,1,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.42,
    features: { solidity: [0.35, 0.75], aspectRatio: [1.0, 2.0], centerDensity: [0.35, 0.7], eulerApprox: [0.5, 1.5] },
  },
  {
    name: '引拔针', symbol: 'crochet-slip-stitch',
    patterns: [
      [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
      [[0,0,1,0,0,0,0],[0,0,0,1,0,0,0],[0,1,0,0,1,0,0],[0,0,0,1,0,0,0],[0,0,1,0,0,0,0]],
    ],
    threshold: 0.38,
    features: { solidity: [0.25, 0.55], aspectRatio: [0.8, 1.3], centerDensity: [0.12, 0.45], eulerApprox: [1.5, 3.0] },
  },
  {
    name: '锁针', symbol: 'crochet-chain',
    patterns: [
      [[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]],
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.36,
    features: { solidity: [0.28, 0.55], aspectRatio: [0.9, 1.2], centerDensity: [0.08, 0.35], eulerApprox: [0.5, 1.5] },
  },
  {
    name: '爆米花针', symbol: 'crochet-5-dc-popcorn',
    patterns: [
      [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[0,1,1,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.42,
    features: { solidity: [0.55, 0.85], aspectRatio: [0.85, 1.2], centerDensity: [0.6, 1.0], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '枣形针', symbol: 'crochet-3-dc-cluster',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.44,
    features: { solidity: [0.5, 0.85], aspectRatio: [0.85, 1.2], centerDensity: [0.55, 1.0], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '中长针', symbol: 'crochet-hdc',
    patterns: [
      [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[0,1,0,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.38,
    features: { solidity: [0.4, 0.75], aspectRatio: [0.7, 1.3], centerDensity: [0.4, 0.8], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '特长针', symbol: 'crochet-tr',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.36,
    features: { solidity: [0.28, 0.55], aspectRatio: [0.9, 1.2], centerDensity: [0.08, 0.35], eulerApprox: [0.5, 1.5] },
  },
];

const KNITTING_SYMBOLS: SymbolTemplate[] = [
  {
    name: '下针', symbol: 'knit',
    patterns: [
      [[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
      [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
    ],
    threshold: 0.38,
    features: { solidity: [0.15, 0.45], aspectRatio: [0.2, 0.6], centerDensity: [0.4, 0.9], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '上针', symbol: 'purl',
    patterns: [
      [[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0]],
      [[0,0,0],[1,1,1],[0,0,0],[1,1,1],[0,0,0]],
    ],
    threshold: 0.38,
    features: { solidity: [0.2, 0.5], aspectRatio: [1.8, 4.0], centerDensity: [0.3, 0.7], eulerApprox: [1.5, 3.0] },
  },
  {
    name: '右并针', symbol: 'decreaseright',
    patterns: [
      [[1,0,0,0,0],[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1]],
    ],
    threshold: 0.36,
    features: { solidity: [0.15, 0.4], aspectRatio: [0.8, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '左并针', symbol: 'decreaseleft',
    patterns: [
      [[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0]],
    ],
    threshold: 0.36,
    features: { solidity: [0.15, 0.4], aspectRatio: [0.8, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '绕线加针', symbol: 'yarn-over',
    patterns: [
      [[0,0,1,0,0],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
      [[0,1,0],[1,0,1],[0,1,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.8, 1.3], centerDensity: [0.1, 0.4], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '扭针', symbol: 'k1-tbl',
    patterns: [
      [[0,0,1,1,0],[0,1,0,0,1],[0,1,0,0,0],[1,0,0,1,0],[0,1,1,0,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.7, 1.3], centerDensity: [0.2, 0.5], eulerApprox: [0.5, 1.5] },
  },
  {
    name: '滑针', symbol: 'slip',
    patterns: [
      [[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0]],
      [[1,1,1,1,1,1,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.1, 0.4], aspectRatio: [1.5, 8.0], centerDensity: [0.2, 0.8], eulerApprox: [0.5, 2.0] },
  },
  {
    name: '空针', symbol: 'cast-on-u',
    patterns: [
      [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]],
      [[1,0,0,1],[1,0,0,1],[0,1,1,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.55], aspectRatio: [0.6, 1.3], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '左上二并一', symbol: 'decrease3to1left',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1]],
      [[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.6, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '左下二并一', symbol: 'decreaseleft-purl',
    patterns: [
      [[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0]],
      [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.6, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '中上针', symbol: 'purl-dot',
    patterns: [
      [[0,1,1,0],[1,0,0,1],[1,0,0,1],[0,1,1,0]],
      [[0,0,1,0,0],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.8, 1.3], centerDensity: [0.05, 0.35], eulerApprox: [0.8, 1.3] },
  },
  {
    name: '右上二并一', symbol: 'decrease3to1right',
    patterns: [
      [[0,1,0,1,0],[0,1,0,1,0],[1,0,0,0,1]],
      [[0,0,1,0,0,0],[0,0,1,0,0,0],[0,0,0,1,0,0],[0,0,0,1,0,0],[0,0,0,0,1,0],[0,0,0,0,1,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.5, 1.5], centerDensity: [0.2, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '右下二并一', symbol: 'decreaseright-purl',
    patterns: [
      [[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0]],
      [[0,0,0,0,1,0],[0,0,0,0,1,0],[0,0,0,1,0,0],[0,0,0,1,0,0],[0,0,1,0,0,0],[0,0,1,0,0,0]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.5, 1.5], centerDensity: [0.2, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '挑针', symbol: 'passleft',
    patterns: [
      [[1,1,1,1,1],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[1,1,1,1,1]],
      [[1,1,1],[0,0,0],[1,1,1],[0,0,0],[1,1,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.3, 0.65], aspectRatio: [0.8, 1.5], centerDensity: [0.4, 0.8], eulerApprox: [1.2, 2.5] },
  },
  {
    name: '交叉针', symbol: 'crossleft',
    patterns: [
      [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
      [[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.25, 0.55], aspectRatio: [0.8, 1.3], centerDensity: [0.1, 0.4], eulerApprox: [1.2, 2.5] },
  },
  {
    name: '锁针', symbol: 'crochet-chain',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,0,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.36,
    features: { solidity: [0.28, 0.55], aspectRatio: [0.9, 1.2], centerDensity: [0.08, 0.35], eulerApprox: [0.5, 1.5] },
  },
  {
    name: '引拔针', symbol: 'crochet-slip-stitch',
    patterns: [
      [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
    ],
    threshold: 0.38,
    features: { solidity: [0.25, 0.55], aspectRatio: [0.8, 1.3], centerDensity: [0.12, 0.45], eulerApprox: [1.5, 3.0] },
  },
  {
    name: '中长针', symbol: 'crochet-hdc',
    patterns: [
      [[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[0,1,0,1,0],[0,0,1,0,0]],
    ],
    threshold: 0.38,
    features: { solidity: [0.4, 0.75], aspectRatio: [0.7, 1.3], centerDensity: [0.4, 0.8], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '短针', symbol: 'crochet-sc',
    patterns: [
      [[0,0,1,1,0,0],[0,1,1,1,1,0],[1,1,1,1,1,1],[1,1,1,1,1,1],[0,1,1,1,1,0],[0,0,1,1,0,0]],
    ],
    threshold: 0.44,
    features: { solidity: [0.6, 1.0], aspectRatio: [0.7, 1.5], centerDensity: [0.7, 1.0], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '短针加针', symbol: 'crochet-sc-plus',
    patterns: [
      [[0,0,1,0,1,0,0],[0,1,1,0,1,1,0],[1,1,1,1,1,1,1],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0]],
    ],
    threshold: 0.40,
    features: { solidity: [0.45, 0.8], aspectRatio: [0.5, 0.9], centerDensity: [0.5, 0.9], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '卷针', symbol: 'crochet-dc',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,1,1,0,0],[0,1,1,1,1,1,0],[1,1,1,1,1,1,1],[0,1,1,1,1,1,0],[0,0,1,1,1,0,0],[0,0,0,1,0,0,0]],
    ],
    threshold: 0.42,
    features: { solidity: [0.5, 0.85], aspectRatio: [0.85, 1.2], centerDensity: [0.55, 1.0], eulerApprox: [0.8, 1.2] },
  },
  {
    name: '左上两针并一针', symbol: 'decrease3to1left',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.6, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '右上两针并一针', symbol: 'decrease3to1right',
    patterns: [
      [[0,0,0,1,0,0,0],[0,0,1,0,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1]],
    ],
    threshold: 0.34,
    features: { solidity: [0.2, 0.5], aspectRatio: [0.6, 1.5], centerDensity: [0.15, 0.5], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '左上三针并一针', symbol: 'decrease4to1left',
    patterns: [
      [[0,0,0,0,1,0,0,0,0],[0,0,0,1,0,1,0,0,0],[0,0,1,0,0,0,1,0,0],[0,1,0,0,0,0,0,1,0],[1,0,0,0,0,0,0,0,1]],
    ],
    threshold: 0.32,
    features: { solidity: [0.15, 0.45], aspectRatio: [0.4, 1.2], centerDensity: [0.1, 0.4], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '右上三针并一针', symbol: 'decrease4to1right',
    patterns: [
      [[0,0,0,0,1,0,0,0,0],[0,0,0,1,0,1,0,0,0],[0,0,1,0,0,0,1,0,0],[0,1,0,0,0,0,0,1,0],[1,0,0,0,0,0,0,0,1]],
    ],
    threshold: 0.32,
    features: { solidity: [0.15, 0.45], aspectRatio: [0.4, 1.2], centerDensity: [0.1, 0.4], eulerApprox: [0.8, 1.5] },
  },
  {
    name: '中间三针并一针', symbol: 'dec-4-to-1-center',
    patterns: [
      [[0,0,0,0,1,0,0,0,0],[0,0,0,1,0,1,0,0,0],[0,0,1,0,0,0,1,0,0],[0,1,0,0,0,0,0,1,0],[1,0,0,0,0,0,0,0,1]],
    ],
    threshold: 0.32,
    features: { solidity: [0.15, 0.45], aspectRatio: [0.4, 1.2], centerDensity: [0.1, 0.4], eulerApprox: [0.8, 1.5] },
  },
];

const ALL_SYMBOLS = [...CROCHET_SYMBOLS, ...KNITTING_SYMBOLS];

function isTextLikePattern(binary: Float64Array, w: number, h: number, edges: Float64Array, confidence: number): boolean {
  const filledRatio = binary.filter(v => v > 0.5).length / binary.length;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x] > 0.5) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const aspectRatio = bh > 0 ? bw / bh : 1;

  const edgeSum = edges.reduce((s, v) => s + v, 0);
  const avgEdgeDensity = edgeSum / edges.length;

  let horizontalTransitions = 0;
  let verticalTransitions = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (binary[y * w + x] !== binary[y * w + x - 1]) horizontalTransitions++;
      if (binary[y * w + x] !== binary[(y - 1) * w + x]) verticalTransitions++;
    }
  }
  const totalTransitions = horizontalTransitions + verticalTransitions;
  const filledPixels = filledRatio * w * h;
  const transitionPerPixel = filledPixels > 0 ? totalTransitions / filledPixels : 0;

  let topHalfFill = 0, bottomHalfFill = 0;
  const midY = Math.floor(h / 2);
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] > 0.5) {
      const py = Math.floor(i / w);
      if (py < midY) topHalfFill++;
      else bottomHalfFill++;
    }
  }
  const verticalAsymmetry = Math.abs(topHalfFill - bottomHalfFill) / Math.max(1, topHalfFill + bottomHalfFill);

  let leftHalfFill = 0, rightHalfFill = 0;
  const midX = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x] > 0.5) {
        if (x < midX) leftHalfFill++;
        else rightHalfFill++;
      }
    }
  }
  const horizontalAsymmetry = Math.abs(leftHalfFill - rightHalfFill) / Math.max(1, leftHalfFill + rightHalfFill);

  const boundingBoxFill = (bw * bh) > 0 ? (filledRatio * w * h) / (bw * bh) : 0;

  const isWideAndThinText = aspectRatio > 2.0 && bw > 4 && transitionPerPixel > 1.8;
  const isTallAndNarrowText = aspectRatio < 0.45 && bh > 4 && transitionPerPixel > 1.8;
  const hasHighEdgeDensity = avgEdgeDensity > 0.3 && confidence < 0.6;
  const hasManyTransitions = transitionPerPixel > 3.0 && confidence < 0.65;
  const hasVerticalImbalance = verticalAsymmetry > 0.55 && aspectRatio > 1.5 && confidence < 0.6;
  const isLowConfidenceComplex = confidence < 0.45 && filledRatio > 0.12 && filledRatio < 0.7 && transitionPerPixel > 2.0;

  const isDenseIrregular = filledRatio > 0.35 && boundingBoxFill > 0.6 && transitionPerPixel > 2.0 && confidence < 0.55;
  const isHighTransitionLowConf = transitionPerPixel > 2.5 && confidence < 0.5 && filledRatio > 0.15 && filledRatio < 0.65;
  const isAsymmetricComplex = (verticalAsymmetry > 0.5 || horizontalAsymmetry > 0.5) && transitionPerPixel > 2.0 && confidence < 0.55;

  return (
    isWideAndThinText ||
    isTallAndNarrowText ||
    hasHighEdgeDensity ||
    hasManyTransitions ||
    hasVerticalImbalance ||
    isLowConfidenceComplex ||
    isDenseIrregular ||
    isHighTransitionLowConf ||
    isAsymmetricComplex
  );
}

function toGrayscale(imageData: ImageData, x: number, y: number, w: number, h: number): Float64Array {
  const gray = new Float64Array(w * h);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = Math.min(x + dx, imageData.width - 1);
      const py = Math.min(y + dy, imageData.height - 1);
      const idx = (py * imageData.width + px) * 4;
      gray[dy * w + dx] = (imageData.data[idx] * 299 + imageData.data[idx + 1] * 587 + imageData.data[idx + 2] * 114) / 1000;
    }
  }
  return gray;
}

function computeEdges(gray: Float64Array, w: number, h: number): Float64Array {
  const edges = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
                 -2*gray[y*w+(x-1)] + 2*gray[y*w+(x+1)]
                 -gray[(y+1)*w+(x-1)] + gray[(y+1)*w+(x+1)];
      const gy = -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
                 +gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  const maxEdge = Math.max(...edges) || 1;
  for (let i = 0; i < edges.length; i++) edges[i] /= maxEdge;
  return edges;
}

function otsuThreshold(gray: Float64Array): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.min(255, Math.max(0, Math.round(v)))]++;

  let bestThreshold = 128;
  let bestVar = 0;
  const total = gray.length;

  for (let t = 1; t < 255; t++) {
    let w0 = 0, w1 = 0, sum0 = 0, sum1 = 0;
    for (let i = 0; i <= t; i++) { w0 += hist[i]; sum0 += i * hist[i]; }
    for (let i = t + 1; i < 256; i++) { w1 += hist[i]; sum1 += i * hist[i]; }
    if (w0 === 0 || w1 === 0) continue;
    const m0 = sum0 / w0;
    const m1 = sum1 / w1;
    const betweenVar = w0 * w1 * (m0 - m1) * (m0 - m1);
    if (betweenVar > bestVar) { bestVar = betweenVar; bestThreshold = t; }
  }

  return bestThreshold;
}

function binarizeRegion(gray: Float64Array, w: number, h: number): Float64Array {
  const binary = new Float64Array(w * h);
  const threshold = otsuThreshold(gray);
  for (let i = 0; i < gray.length; i++) binary[i] = gray[i] < threshold ? 1 : 0;
  return binary;
}

function extractShapeFeatures(binary: Float64Array, w: number, h: number): { solidity: number; aspectRatio: number; centerDensity: number; eulerApprox: number } {
  let filledPixels = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let centerFilled = 0, centerTotal = 0;
  const cx = w / 2, cy = h / 2;
  const innerRadius = Math.min(w, h) * 0.25;

  let transitions = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = binary[y * w + x];
      if (v > 0.5) {
        filledPixels++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= innerRadius) {
        centerTotal++;
        if (v > 0.5) centerFilled++;
      }
      if (x > 0 && binary[y * w + x] !== binary[y * w + x - 1]) transitions++;
      if (y > 0 && binary[y * w + x] !== binary[(y - 1) * w + x]) transitions++;
    }
  }

  const bw = Math.max(maxX - minX + 1, 1);
  const bh = Math.max(maxY - minY + 1, 1);
  const solidity = (bw * bh) > 0 ? filledPixels / (bw * bh) : 0;
  const aspectRatio = bh > 0 ? bw / bh : 1;
  const centerDensity = centerTotal > 0 ? centerFilled / centerTotal : 0;
  const eulerApprox = filledPixels > 0 ? transitions / (2 * filledPixels) : 0;

  return { solidity, aspectRatio, centerDensity, eulerApprox };
}

function matchFeatures(actual: { solidity: number; aspectRatio: number; centerDensity: number; eulerApprox: number }, expected: { solidity: [number, number]; aspectRatio: [number, number]; centerDensity: [number, number]; eulerApprox: [number, number] }): boolean {
  const checks = [
    actual.solidity >= expected.solidity[0] - 0.08 && actual.solidity <= expected.solidity[1] + 0.08,
    actual.aspectRatio >= expected.aspectRatio[0] - 0.2 && actual.aspectRatio <= expected.aspectRatio[1] + 0.2,
    actual.centerDensity >= expected.centerDensity[0] - 0.08 && actual.centerDensity <= expected.centerDensity[1] + 0.08,
    actual.eulerApprox >= expected.eulerApprox[0] - 0.3 && actual.eulerApprox <= expected.eulerApprox[1] + 0.3,
  ];
  return checks.filter(Boolean).length >= 3;
}

function matchTemplateMultiScale(gray: Float64Array, edges: Float64Array, binary: Float64Array, w: number, h: number, tmpl: SymbolTemplate): number {
  let bestScore = 0;

  for (const pattern of tmpl.patterns) {
    const ph = pattern.length, pw = pattern[0].length;

    for (let scale = 0.5; scale <= 1.6; scale += 0.08) {
      const sw = Math.round(pw * scale), sh = Math.round(ph * scale);
      if (sw > w || sh > h || sw < 3 || sh < 3) continue;

      const offsetX = Math.floor((w - sw) / 2), offsetY = Math.floor((h - sh) / 2);

      let matches = 0, total = 0;
      let edgeMatchSum = 0, edgeTotal = 0;
      let weightedMatches = 0;

      for (let ty = 0; ty < sh; ty++) {
        for (let tx = 0; tx < sw; tx++) {
          const sy = offsetY + ty, sx = offsetX + tx;
          if (sy < 0 || sy >= h || sx < 0 || sx >= w) continue;

          const srcY = Math.round(ty / scale);
          const srcX = Math.round(tx / scale);
          const isDark = binary[sy * w + sx] > 0.5;
          const expectedDark = pattern[srcY]?.[srcX] === 1;

          if (isDark === expectedDark) {
            matches++;
            const edgeWeight = expectedDark ? (1 + edges[sy * w + sx]) : 1;
            weightedMatches += edgeWeight;
          }
          total++;

          if (expectedDark) {
            edgeMatchSum += 1 - edges[sy * w + sx];
            edgeTotal++;
          }
        }
      }

      if (total === 0) continue;
      const patternScore = matches / total;
      const weightedScore = weightedMatches / (total * 1.5);
      const edgeBonus = edgeTotal > 0 ? (edgeMatchSum / edgeTotal) * 0.12 : 0;
      const score = Math.max(patternScore, weightedScore) + edgeBonus;
      if (score > bestScore) bestScore = score;
    }
  }

  return bestScore;
}

// ============================================================
// Rule 15: 负空间检测 (NEGATIVE_SPACE Detection) — v5 Algorithm
// ============================================================
// 检测服装开孔区域（领口、袖窿等），这些区域的白色格子不应被转换为可编辑格子。
//
// 算法采用双重策略：
//   1. 独立区域形状分析 (Shape Analysis)：针对领口等独立白色区域
//      - Flood-fill 找连通白区
//      - 计算行宽剖面 (row-width profile)
//      - U形判定：widthRatio(上/下) > 1.3, fillDensity < 0.8
//
//   2. 边缘图案邻居检测 (Edge Pattern-Neighbor Detection)：针对袖窿等边缘凹陷
//      - 逐行扫描左/右边缘白色游程 (white run)
//      - 游程短于阈值(≤10格)且紧邻图案 → 判定为袖窿

export interface NegativeSpaceResult {
  /** 检测到的负空间格子坐标集合 */
  cells: Set<string>;
  /** 检测到的区域详情 */
  regions: NegativeSpaceRegion[];
}

export interface NegativeSpaceRegion {
  type: 'NECKLINE' | 'LEFT_ARMHOLE' | 'RIGHT_ARMHOLE' | 'LEFT_ARMHOLE_EDGE' | 'RIGHT_ARMHOLE_EDGE';
  cellCount: number;
  bounds?: { minRow: number; maxRow: number; minCol: number; maxCol: number };
}

export function detectNegativeSpace(grid: GridCell[][]): NegativeSpaceResult {
  const cells = new Set<string>();
  const regions: NegativeSpaceRegion[] = [];

  if (!grid || grid.length === 0 || grid[0].length === 0) {
    return { cells, regions };
  }

  const ROWS = grid.length;
  const COLS = grid[0].length;

  // --- Step A: 构建亮度图，找出高亮白色格子 ---
  const BRIGHT_THRESHOLD = 252;
  const brightMap: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let totalBright = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // 通过颜色判断亮度：纯白或接近纯白的颜色视为高亮
      const color = grid[r][c]?.color || '';
      if (isBrightColor(color)) {
        brightMap[r][c] = true;
        totalBright++;
      }
    }
  }

  if (totalBright === 0) {
    return { cells, regions };
  }

  // --- Step B: Flood-fill 找所有连通的亮白区域 ---
  const visited: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(-1)); // -1=未访问, >=0=区域索引
  interface BrightRegion {
    count: number;
    bounds: { minR: number; maxR: number; minC: number; maxC: number };
    avgBrightness: number;
  }
  const brightRegions: BrightRegion[] = [];

  function floodFill(sr: number, sc: number, regionIdx: number): BrightRegion {
    const stack: [number, number][] = [[sr, sc]];
    let minR = sr, maxR = sr, minC = sc, maxC = sc;
    let cnt = 0;

    while (stack.length > 0) {
      const [cr, cc] = stack.pop()!;
      if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS) continue;
      if (visited[cr][cc] !== -1 || !brightMap[cr][cc]) continue;
      visited[cr][cc] = regionIdx;
      cnt++;
      if (cr < minR) minR = cr; if (cr > maxR) maxR = cr;
      if (cc < minC) minC = cc; if (cc > maxC) maxC = cc;
      stack.push([cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]);
    }

    return { count: cnt, bounds: { minR, maxR, minC, maxC }, avgBrightness: 255 };
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (brightMap[r][c] && visited[r][c] === -1) {
        brightRegions.push(floodFill(r, c, brightRegions.length));
      }
    }
  }

  console.log(`[Rule15] 亮白区域: ${brightRegions.length} 个, 总计 ${totalBright}/${ROWS * COLS} 格`);

  // --- Step C: 对每个区域进行形状分类 ---
  for (let i = 0; i < brightRegions.length; i++) {
    const reg = brightRegions[i];
    const b = reg.bounds;
    const rw = b.maxC - b.minC + 1;
    const rh = b.maxR - b.minR + 1;

    // 计算行宽剖面（用于U形判定）
    const rowWidths: number[] = [];
    for (let rr = b.minR; rr <= b.maxR; rr++) {
      let wCnt = 0;
      for (let cc = b.minC; cc <= b.maxC; cc++) {
        if (visited[rr][cc] === i) wCnt++;
      }
      rowWidths.push(wCnt);
    }

    // 宽度比：上半部分平均宽度 / 下半部分平均宽度 (>1 表示上宽下窄，即U形)
    let topHalfAvg = 0, botHalfAvg = 0;
    const halfLen = Math.ceil(rowWidths.length / 2);
    const botLen = rowWidths.length - halfLen;
    for (let j = 0; j < rowWidths.length; j++) {
      if (j < halfLen) topHalfAvg += rowWidths[j];
      else botHalfAvg += rowWidths[j];
    }
    topHalfAvg /= Math.max(1, halfLen);
    botHalfAvg /= Math.max(1, botLen);
    const widthRatio = botHalfAvg > 0.5 ? topHalfAvg / botHalfAvg : 999;

    // 边缘接触分析
    const touchesTop = b.minR === 0;
    const touchesBottom = b.maxR === ROWS - 1;
    const touchesLeft = b.minC === 0;
    const touchesRight = b.maxC === COLS - 1;
    const fillDensity = reg.count / (rw * rh);
    const aspectRatio = rw / Math.max(1, rh);

    // --- NECKLINE: U形，上宽下窄，不接触底部 ---
    const isNeckline = !touchesBottom && rh >= 4 && rw >= 6 &&
      widthRatio > 1.3 && fillDensity < 0.8 && aspectRatio > 1.0;

    // --- LEFT_ARMHOLE: D形，接触左边缘，垂直方向延伸 ---
    const isLeftArmhole = touchesLeft && !touchesRight && !touchesBottom &&
      rh >= 5 && rw >= 3 && aspectRatio < 4 && reg.count >= 8;

    // --- RIGHT_ARMHOLE: D形，接触右边缘 ---
    const isRightArmhole = touchesRight && !touchesLeft && !touchesBottom &&
      rh >= 5 && rw >= 3 && aspectRatio < 4 && reg.count >= 8;

    // 排除大型矩形背景区域（后续单独做凹形检测）
    const isBackgroundRect = (touchesTop && rw >= COLS * 0.6) ||
      (touchesLeft && touchesRight && rh >= ROWS * 0.25);

    if ((isNeckline || isLeftArmhole || isRightArmhole) && !isBackgroundRect) {
      const type: NegativeSpaceRegion['type'] = isNeckline ? 'NECKLINE'
        : isLeftArmhole ? 'LEFT_ARMHOLE' : 'RIGHT_ARMHOLE';

      regions.push({
        type,
        cellCount: reg.count,
        bounds: { minRow: b.minR, maxRow: b.maxR, minCol: b.minC, maxCol: b.maxC },
      });

      // 标记该区域内所有属于此区域的亮白格子为负空间
      for (let mr = b.minR; mr <= b.maxR; mr++) {
        for (let mc = b.minC; mc <= b.maxC; mc++) {
          if (visited[mr][mc] === i) {
            cells.add(`${mr},${mc}`);
          }
        }
      }

      console.log(`[Rule15] ✓ ${type}: rows[${b.minR}-${b.maxR}] cols[${b.minC}-${b.maxC}] (${reg.count}格, wr=${widthRatio.toFixed(2)})`);
    } else if (!isBackgroundRect) {
      console.log(`[Rule15]   区域${i}: 跳过 (${reg.count}格, ${rw}x${rh}, wr=${widthRatio.toFixed(2)})`);
    }
  }

  // --- Step D: 在大型背景区域中检测凹形袖窿 (Concavity Detection) ---
  // 袖窿往往是主白色区域内部的"凹陷"——边缘白色格子紧邻图案格子
  for (let bi = 0; bi < brightRegions.length; bi++) {
    const bgReg = brightRegions[bi];
    const b = bgReg.bounds;
    const isBG = (b.minR === 0 && (b.maxC - b.minC + 1) >= COLS * 0.6) ||
      (b.minC === 0 && b.maxC === COLS - 1 && (b.maxR - b.minR + 1) >= ROWS * 0.25);

    if (!isBG || bgReg.count < 50) continue;

    console.log(`[Rule15] 分析背景区域${bi} (${bgReg.count}格)，检测边缘凹形...`);

    let leftArmholeCount = 0;
    let rightArmholeCount = 0;

    for (let epr = b.minR; epr <= Math.min(b.maxR, ROWS - 3); epr++) {
      // 左边缘检查：从col 0开始向右找连续白色游程
      let leftWhiteRun = 0;
      for (let lpc = 0; lpc < COLS * 0.3; lpc++) {
        if (visited[epr][lpc] === bi) {
          leftWhiteRun++;
        } else {
          break; // 遇到非白色（图案）格子
        }
      }
      // 白色游程短(≤10格)且不在最顶部 → 左袖窿
      if (leftWhiteRun > 0 && leftWhiteRun <= 10 && epr >= 2) {
        for (let lac = 0; lac < leftWhiteRun; lac++) {
          cells.add(`${epr},${lac}`);
        }
        leftArmholeCount += leftWhiteRun;
      }

      // 右边缘检查：从最右侧列向左找连续白色游程
      let rightWhiteRun = 0;
      for (let rpc = COLS - 1; rpc >= COLS * 0.7; rpc--) {
        if (visited[epr][rpc] === bi) {
          rightWhiteRun++;
        } else {
          break;
        }
      }
      if (rightWhiteRun > 0 && rightWhiteRun <= 10 && epr >= 2) {
        for (let rac = COLS - rightWhiteRun; rac < COLS; rac++) {
          cells.add(`${epr},${rac}`);
        }
        rightArmholeCount += rightWhiteRun;
      }
    }

    if (leftArmholeCount >= 5) {
      regions.push({ type: 'LEFT_ARMHOLE_EDGE', cellCount: leftArmholeCount });
      console.log(`[Rule15] ✓ LEFT_ARMHOLE_EDGE: ${leftArmholeCount}格`);
    }
    if (rightArmholeCount >= 5) {
      regions.push({ type: 'RIGHT_ARMHOLE_EDGE', cellCount: rightArmholeCount });
      console.log(`[Rule15] ✓ RIGHT_ARMHOLE_EDGE: ${rightArmholeCount}格`);
    }
  }

  console.log(`[Rule15] 共检测到 ${regions.length} 个负空间区域, ${cells.size} 个格子`);

  return { cells, regions };
}

/**
 * 基于连通区域分析的空格子分类（BFS 泛洪）
 *
 * 核心原则：不依据颜色区分空格子和空白区域，而是基于空间连通性：
 *
 * 1. 所有与图像边缘连通的空白区域 → OUTER_EMPTY_CELL
 *    - 渲染规则：显示浅灰色网格
 * 2. 所有不与图像边缘连通的封闭空白区域 → INNER_HOLE
 *    - 渲染规则：纯白无网格，保持透明空洞效果
 */
export function classifyEmptyCellsByConnectivity(grid: GridCell[][]): void {
  if (!grid || grid.length === 0 || grid[0].length === 0) return;

  const rows = grid.length;
  const cols = grid[0].length;

  // 判断一个格子是否为"空"（无图案内容）
  // 空格子的定义：颜色为背景色/白色 且 无符号 且 非负空间
  const isEmpty = (r: number, c: number): boolean => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const cell = grid[r][c];
    // 负空间格子不属于空格子分类范畴
    if (cell.active === false) return false;
    // 有符号的格子不是空格
    if (cell.symbol) return false;
    // 判断是否为空色（GRID_BACKGROUND 或 PATTERN_WHITE）
    const color = cell.color.toLowerCase();
    return color === GRID_BACKGROUND.toLowerCase() ||
           color === PATTERN_WHITE.toLowerCase() ||
           color === EDITABLE_EMPTY.toLowerCase();
  };

  const visited = new Set<string>();
  const outerCells = new Set<string>();   // 边缘连通 → outer
  const innerCells = new Set<string>();   // 封闭空洞 → inner

  // BFS 泛洪
  const bfs = (startR: number, startC: number): { cells: string[]; touchesEdge: boolean } => {
    const queue: [number, number][] = [[startR, startC]];
    const regionCells: string[] = [];
    let touchesEdge = false;

    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (!isEmpty(r, c)) continue; // 只在空格子之间扩散

      visited.add(key);
      regionCells.push(key);

      // 检查是否接触边缘
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        touchesEdge = true;
      }

      // 四向邻接扩散
      queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    return { cells: regionCells, touchesEdge };
  };

  // 从所有空格子出发进行泛洪
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!visited.has(key) && isEmpty(r, c)) {
        const { cells: regionCells, touchesEdge } = bfs(r, c);
        if (touchesEdge) {
          regionCells.forEach(k => outerCells.add(k));
        } else {
          regionCells.forEach(k => innerCells.add(k));
        }
      }
    }
  }

  // 将分类结果写入 GridCell.emptyType
  let outerCount = 0;
  let innerCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (outerCells.has(key)) {
        grid[r][c].emptyType = 'outer';
        outerCount++;
      } else if (innerCells.has(key)) {
        grid[r][c].emptyType = 'inner';
        innerCount++;
      }
      // 非 emptyType 的格子保持 undefined（有图案内容的格子）
    }
  }

  console.log(`[连通分析] 外部空格(OUTER): ${outerCount}, 内部空洞(INNER): ${innerCount}`);
}

/**
 * 连通区域分析调试可视化 — 生成彩色调试图用于诊断空格子丢失位置
 *
 * 颜色编码：
 *   🟢 Pattern  (绿色 #22c55e) — 有图案内容的格子（有颜色/符号）
 *   🔴 Empty    (红色 #ef4444) — 空格子（INNER_HOLE + OUTER_EMPTY）
 *   🔵 Outside  (蓝色 #3b82f6) — 负空间格子(active=false)
 *
 * 输出：
 *   - 控制台统计：Grid Total / Pattern Count / Empty Count / Outside Count
 *   - 返回 Canvas DataURL 可直接显示为图片
 */
export function generateConnectivityDebugImage(
  grid: GridCell[][],
  cellSize: number = 20
): { dataUrl: string; stats: DebugStats } {
  const rows = grid.length;
  const cols = grid[0].length;
  const pad = 2; // 边距

  // 统计
  let patternCount = 0;
  let emptyCount = 0;
  let outsideCount = 0;

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize + pad * 2;
  canvas.height = rows * cellSize + pad * 2;
  const ctx = canvas.getContext('2d')!;

  // 背景（深灰，便于区分白色空洞）
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const x = pad + c * cellSize;
      const y = pad + r * cellSize;

      let color: string;
      let label: string;

      if (cell.active === false) {
        // 负空间 → 蓝色 (Outside)
        color = '#3b82f6';
        label = 'OUTSIDE';
        outsideCount++;
      } else if (cell.emptyType === 'inner' || cell.emptyType === 'outer') {
        // 空格子 → 红色 (Empty)
        if (cell.emptyType === 'inner') {
          color = '#dc2626'; // 深红 = INNER_HOLE
          label = 'EMPTY_INNER';
        } else {
          color = '#ef4444'; // 红 = OUTER_EMPTY
          label = 'EMPTY_OUTER';
        }
        emptyCount++;
      } else {
        // 有图案内容 → 绿色 (Pattern)
        color = '#22c55e';
        label = 'PATTERN';
        patternCount++;
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);

      // 绘制网格线（白色半透明）
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }

  // 外边框
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad, pad, cols * cellSize, rows * cellSize);

  // 图例
  const legendY = rows * cellSize + pad + 8;
  const legendItems = [
    { color: '#22c55e', text: `Pattern=${patternCount}` },
    { color: '#ef4444', text: `Empty(Outer+Inner)=${emptyCount}` },
    { color: '#3b82f6', text: `Outside(neg-space)=${outsideCount}` },
  ];
  ctx.font = '11px monospace';
  ctx.fillStyle = '#ccc';
  let lx = pad;
  legendItems.forEach(item => {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, legendY, 10, 10);
    ctx.fillStyle = '#ccc';
    ctx.fillText(item.text, lx + 14, legendY + 9);
    lx += ctx.measureText(item.text).width + 24;
  });

  const stats: DebugStats = {
    gridTotal: rows * cols,
    patternCount,
    emptyCount,
    outsideCount,
    outerCount: emptyCount, // will be refined below
    innerCount: 0,
  };

  // 精确统计 outer vs inner
  let outerExact = 0, innerExact = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].emptyType === 'outer') outerExact++;
      else if (grid[r][c].emptyType === 'inner') innerExact++;
    }
  }
  stats.outerCount = outerExact;
  stats.innerCount = innerExact;

  // 控制台输出统计
  console.log('%c╔══════════════════════════════════════╗', 'color:#3b82f6;font-weight:bold');
  console.log('%c║     连通区域分析调试统计              ║', 'color:#3b82f6;font-weight:bold');
  console.log('%c╠══════════════════════════════════════╣', 'color:#3b82f6;font-weight:bold');
  console.log(`║  Grid Total:    ${String(stats.gridTotal).padStart(6)}             ║`);
  console.log(`║  Pattern (🟢):  ${String(stats.patternCount).padStart(6)}             ║`);
  console.log(`║  Empty (🔴):    ${String(stats.emptyCount).padStart(6)}  (outer=${stats.outerCount} inner=${stats.innerCount}) ║`);
  console.log(`║  Outside (🔵):  ${String(stats.outsideCount).padStart(6)}             ║`);
  console.log('%c╚══════════════════════════════════════╝', 'color:#3b82f6;font-weight:bold');

  return { dataUrl: canvas.toDataURL('image/png'), stats };
}

export interface DebugStats {
  gridTotal: number;
  patternCount: number;
  emptyCount: number;
  outsideCount: number;
  outerCount: number;
  innerCount: number;
}

/** 判断一个十六进制颜色是否为高亮白色（亮度 > 252） */
function isBrightColor(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r + g + b) / 3;
  return brightness > 252;
}

export interface SymbolMatchResult {
  symbol: string;
  name: string;
  confidence: number;
  position: { row: number; col: number };
}

/**
 * Symbol Presence Detection — 预筛选
 *
 * 在模板匹配之前，快速判断格子内是否包含真实针法符号。
 *
 * 判定依据：
 *   1. darkPixelRatio: 深色像素占比（灰度 < 128）
 *      - 真实符号（×、○、/ 等）：0.08 ~ 0.55
 *      - 空白格（仅网格线碎片）：< 0.06
 *      - 实心块（文字、数字）:> 0.60
 *
 *   2. connectedComponents: 二值图中独立连通区域数
 *      - 真实符号：1 ~ 6 个有意义的连通区
 *      - 网格线碎片：大量微小连通区（> 15）或 0 个
 *      - 均匀噪声：极多微小连通区
 */
function detectSymbolPresence(gray: Float64Array, binary: Float64Array, sz: number): boolean {
  // ── 1. darkPixelRatio ──
  let darkCount = 0;
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    if (gray[i] < 128) darkCount++;
  }
  const darkPixelRatio = darkCount / total;

  // 太暗或太亮 → 不是符号
  if (darkPixelRatio < 0.06 || darkPixelRatio > 0.65) return false;

  // ── 2. connectedComponents (BFS on binary) ──
  const components = countConnectedComponents(binary, sz);
  if (components < 1 || components > 12) return false;

  return true;
}

/**
 * 统计二值图中的连通分量数（4-邻接 BFS）
 */
function countConnectedComponents(binary: Float64Array, size: number): number {
  const visited = new Uint8Array(binary.length);
  let count = 0;

  for (let start = 0; start < binary.length; start++) {
    if (visited[start] || binary[start] <= 0.5) continue; // 跳过已访问或白色

    // BFS
    const queue: number[] = [start];
    visited[start] = 1;
    let componentSize = 0;

    while (queue.length > 0) {
      const idx = queue.shift()!;
      componentSize++;

      const r = Math.floor(idx / size);
      const c = idx % size;

      // 4-neighborhood
      const neighbors =
        r > 0 ? [idx - size] : [];           // up
      if (r < size - 1) neighbors.push(idx + size); // down
      if (c > 0) neighbors.push(idx - 1);    // left
      if (c < size - 1) neighbors.push(idx + 1); // right

      for (const n of neighbors) {
        if (!visited[n] && binary[n] > 0.5) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    // 忽略太小的噪点（< 3px 的孤立点不算符号成分）
    if (componentSize >= 3) count++;
  }

  return count;
}

/**
 * 计算格子中心区域的深色像素占比
 *
 * 只分析中心 50% 区域（25%~75%），排除边缘的网格线。
 * 真实针法符号（×、○、/ 等）的笔画必然经过中心区域。
 * 空白格的中心区域几乎全白（只有边缘有网格线）。
 */
function computeCenterDarkRatio(gray: Float64Array, size: number): number {
  const margin = Math.floor(size * 0.25);
  const centerSize = size - 2 * margin;
  if (centerSize <= 0) return 0;

  let darkCount = 0;
  const total = centerSize * centerSize;

  for (let dy = 0; dy < centerSize; dy++) {
    const y = (margin + dy) * size;
    for (let dx = 0; dx < centerSize; dx++) {
      if (gray[y + margin + dx] < 128) darkCount++;
    }
  }

  return darkCount / total;
}

export function detectSymbols(
  imageData: ImageData,
  grid: GridCell[][],
  sampleSize: number,
  actualGridInfo: GridDetectionResult | undefined,
  symbolMode: 'all' | 'knitting' | 'crochet' = 'knitting',
  onProgress?: (progress: number) => void,
  skipAutoFill: boolean = false   // 结构图模式：禁用空间一致性自动填充，防止 EmptyGrid 被赋符号
): SymbolMatchResult[] & { _autoFilledCount?: number } {
  const results: SymbolMatchResult[] = [];
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  let processed = 0;
  const total = rows * cols;
  const sz = Math.max(sampleSize, 12);

  // Symbol Presence 预筛选统计
  let presenceFilteredCount = 0;  // 被预筛选掉的格子数
  let centerFilteredCount = 0;    // 被中心区域分析过滤的格子数
  let emptyGridSkippedCount = 0;   // EmptyGrid 跳过（不进入任何处理）

  // ════════════════════════════════════
  // Pipeline Order 确认 + 预统计
  //
  // 正确顺序：
  //   1. Grid Detection          → actualGridInfo
  //   2. processStructurePattern  → grid with emptyType/regionType (Hole/EmptyGrid)
  //   3. detectSymbols           → 只对非 EmptyGrid 格子做模板匹配
  //   4. renderGrid              → 渲染
  //
  // 关键：detectSymbols 必须尊重 processStructurePattern 的分类结果
  //       EmptyGrid(emptyType='outer') 不允许进入模板匹配
  // ════════════════════════════════════
  {
    let preEmptyGrid = 0, preHole = 0, preOther = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const et = grid[r][c].emptyType;
        if (et === 'outer') preEmptyGrid++;
        else if (et === 'inner') preHole++;
        else preOther++;
      }
    }
    console.log('%c╔════════════════════════════════════════════╗', 'color:#8b5cf6;font-weight:bold');
    console.log('%c║  detectSymbols 入口: Cell 类型分布         ║', 'color:#8b5cf6;font-weight:bold');
    console.log('%c╠════════════════════════════════════════════╣', 'color:#8b5cf6');
    console.log(`║  Total Cells:       ${String(total).padStart(6)}                      ║`);
    console.log(`║  EmptyGrid(outer):  ${String(preEmptyGrid).padStart(6)}  ← 将被跳过!        ║`);
    console.log(`║  Hole(inner):       ${String(preHole).padStart(6)}  ← 允许检测符号      ║`);
    console.log(`║  Other(未分类):     ${String(preOther).padStart(6)}  ← 允许检测符号      ║`);
    console.log('%c╚════════════════════════════════════════════╝', 'color:#8b5cf6');
  }

  const symbolsToUse = symbolMode === 'knitting' ? KNITTING_SYMBOLS :
                       symbolMode === 'crochet' ? CROCHET_SYMBOLS :
                       ALL_SYMBOLS;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x: number, y: number, sw: number, sh: number;

      if (actualGridInfo && actualGridInfo.vLinePositions.length > 1 && actualGridInfo.hLinePositions.length > 1) {
        const vLines = actualGridInfo.vLinePositions;
        const hLines = actualGridInfo.hLinePositions;
        const gridRows = hLines.length - 1;
        const gridCols = vLines.length - 1;

        let srcRow = row;
        let srcCol = col;
        if (gridRows !== rows || gridCols !== cols) {
          srcRow = Math.min(Math.floor(row * gridRows / rows), gridRows - 1);
          srcCol = Math.min(Math.floor(col * gridCols / cols), gridCols - 1);
        }

        if (srcRow >= gridRows || srcCol >= gridCols) {
          processed++;
          continue;
        }

        const y0 = hLines[srcRow];
        const y1 = hLines[srcRow + 1];
        const x0 = vLines[srcCol];
        const x1 = vLines[srcCol + 1];
        const cellH = y1 - y0;
        const cellW = x1 - x0;

        const margin = 0.22;
        x = Math.round(x0 + cellW * margin);
        y = Math.round(y0 + cellH * margin);
        sw = Math.round(cellW * (1 - 2 * margin));
        sh = Math.round(cellH * (1 - 2 * margin));
      } else {
        const cellW = imageData.width / cols;
        const cellH = imageData.height / rows;
        x = Math.floor(col * cellW + cellW * 0.1);
        y = Math.floor(row * cellH + cellH * 0.1);
        sw = Math.floor(cellW * 0.8);
        sh = Math.floor(cellH * 0.8);
      }

      const actualSz = Math.min(sz, sw, sh);
      if (actualSz < 5) {
        processed++;
        continue;
      }

      // ════════════════════════════════════
      // EmptyGrid 守卫：禁止进入模板匹配
      //
      // Pipeline 顺序保证：
      //   processStructurePattern() 已完成 Hole/EmptyGrid 分类
      //   detectSymbols() 必须尊重该分类
      //   EmptyGrid(emptyType='outer') → 跳过，不检测符号
      // ════════════════════════════════════
      if (grid[row][col].emptyType === 'outer') {
        emptyGridSkippedCount++;
        processed++;
        if (onProgress && processed % Math.ceil(total / 30) === 0) onProgress(Math.round((processed / total * 100)));
        continue;   // ← EmptyGrid 直接跳过，不进入任何图像处理
      }

      const gray = toGrayscale(imageData, x, y, actualSz, actualSz);
      const edges = computeEdges(gray, actualSz, actualSz);
      const binary = binarizeRegion(gray, actualSz, actualSz);
      const features = extractShapeFeatures(binary, actualSz, actualSz);

      const filledRatio = binary.filter(v => v > 0.5).length / binary.length;
      if (filledRatio < 0.04 || filledRatio > 0.96) {
        processed++;
        if (onProgress && processed % Math.ceil(total / 30) === 0) onProgress(Math.round((processed / total * 100)));
        continue;
      }

      let graySum = 0, graySqSum = 0;
      for (let i = 0; i < gray.length; i++) { graySum += gray[i]; graySqSum += gray[i] * gray[i]; }
      const grayMean = graySum / gray.length;
      const grayVariance = graySqSum / gray.length - grayMean * grayMean;
      if (grayVariance < 400 && filledRatio > 0.2) {
        processed++;
        continue;
      }

      const avgEdgeDensity = edges.reduce((s, v) => s + v, 0) / edges.length;
      if (avgEdgeDensity > 0.42 && filledRatio > 0.12 && filledRatio < 0.78) {
        processed++;
        continue;
      }

      let hTrans = 0, vTrans = 0;
      for (let ty = 1; ty < actualSz - 1; ty++) {
        for (let tx = 1; tx < actualSz - 1; tx++) {
          if (binary[ty * actualSz + tx] !== binary[ty * actualSz + tx - 1]) hTrans++;
          if (binary[ty * actualSz + tx] !== binary[(ty - 1) * actualSz + tx]) vTrans++;
        }
      }
      const totalTrans = hTrans + vTrans;
      const filledPx = filledRatio * actualSz * actualSz;
      const transPerPx = filledPx > 0 ? totalTrans / filledPx : 0;
      if (transPerPx > 6.0 && filledRatio > 0.08 && filledRatio < 0.85) {
        processed++;
        continue;
      }

      // ════════════════════════════════════════════
      // Symbol Presence Detection (预筛选)
      // 在模板匹配之前，先判断格子内是否真的有符号
      //
      // 原因：结构图中大量空白格包含网格线碎片/文字数字，
      //       现有过滤器（filledRatio/variance/transPerPx）无法完全排除，
      //       导致 1398 个误检（真实仅 ~45 个）
      // ════════════════════════════════════════════
      const hasRealSymbol = detectSymbolPresence(gray, binary, actualSz);

      if (!hasRealSymbol) {
        // 无真实符号 → 强制标记为 EmptyGrid，跳过模板匹配
        presenceFilteredCount++;
        processed++;
        if (onProgress && processed % Math.ceil(total / 30) === 0) onProgress(Math.round((processed / total * 100)));
        continue;
      }

      // ════════════════════════════════════════════
      // Center Region Analysis (中心区域分析)
      //
      // 问题：Presence Detection 过滤了网格边框，但仍有大量格子
      //       通过预筛选（2376/2596），因为网格线穿过格子边缘区域
      //
      // 解决：只看格子中心 50% 区域（25%~75%）
      //       真实符号的笔画一定经过中心区域
      //       网格边框只存在于边缘，不进入中心
      // ════════════════════════════════════════════
      const centerDarkRatio = computeCenterDarkRatio(gray, actualSz);

      if (centerDarkRatio < 0.02) {
        // 中心区域几乎全白 → 无符号，只有边缘网格线
        centerFilteredCount++;
        processed++;
        if (onProgress && processed % Math.ceil(total / 30) === 0) onProgress(Math.round((processed / total * 100)));
        continue;
      }

      let bestMatch: SymbolTemplate | null = null;
      let bestConfidence = 0;

      for (const tmpl of symbolsToUse) {
        if (!matchFeatures(features, tmpl.features)) continue;
        const confidence = matchTemplateMultiScale(gray, edges, binary, actualSz, actualSz, tmpl);
        if (confidence > tmpl.threshold && confidence > bestConfidence) {
          bestConfidence = confidence;
          bestMatch = tmpl;
        }
      }

      if (bestMatch) {
        if (isTextLikePattern(binary, actualSz, actualSz, edges, bestConfidence)) {
          processed++;
          continue;
        }
        results.push({ symbol: bestMatch.symbol, name: bestMatch.name, confidence: bestConfidence, position: { row, col } });
        grid[row][col].symbol = bestMatch.symbol;

        // ── Debug: 每个检测到的符号详情 ──
        console.log('[DetectSymbol]', {
          row,
          col,
          symbol: bestMatch.name,
          confidence: Number(bestConfidence.toFixed(4)),
          regionType: (grid[row][col] as any)._regionType || 'unknown',
        });
      }

      processed++;
      if (onProgress && processed % Math.ceil(total / 30) === 0) onProgress(Math.round((processed / total) * 100));
    }
  }

  // 空间一致性后处理：修正孤立错误
  // ⚠️ 结构图模式 (skipAutoFill=true) 完全跳过此步骤
  //    原因：3邻居相同 → 自动赋符号 会把 EmptyGrid 变成 AutoGeneratedSymbol
  let autoFilledCount = 0;
  if (!skipAutoFill) {
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const current = grid[row][col].symbol;
        const neighbors = [
          grid[row - 1][col].symbol,
          grid[row + 1][col].symbol,
          grid[row][col - 1].symbol,
          grid[row][col + 1].symbol,
        ].filter(Boolean) as string[];

        if (neighbors.length >= 3) {
          const freq: Record<string, number> = {};
          for (const n of neighbors) freq[n] = (freq[n] || 0) + 1;
          const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
          if (dominant && dominant[1] >= 3 && current !== dominant[0]) {
            const result = results.find(r => r.position.row === row && r.position.col === col);
            if (result) result.symbol = dominant[0];
            grid[row][col].symbol = dominant[0];
            autoFilledCount++;
          }
        }
      }
    }
  }

  (results as SymbolMatchResult[] & { _autoFilledCount?: number })._autoFilledCount = autoFilledCount;

  // ── Debug: 符号检测统计（含 Pipeline 验证）──
  console.log('%c╔════════════════════════════════════════════╗', 'color:#f59e0b;font-weight:bold');
  console.log('%c║     detectSymbols 完整检测报告              ║', 'color:#f59e0b;font-weight:bold');
  console.log('%c╠════════════════════════════════════════════╣', 'color:#f59e0b');

  // ── Pipeline 过滤漏斗 ──
  const templateCandidates = total - emptyGridSkippedCount - presenceFilteredCount - centerFilteredCount;
  console.log(`║  ── Pipeline 过滤漏斗 ───────────────────── ║`);
  console.log(`║  总格子数:               ${String(total).padStart(6)}                ║`);
  console.log(`║  ① EmptyGrid守卫跳过:    ${String(emptyGridSkippedCount).padStart(6)}                ║`);
  console.log(`║  ② Presence预筛选过滤:    ${String(presenceFilteredCount).padStart(6)}                ║`);
  console.log(`║  ③ Center区域分析过滤:    ${String(centerFilteredCount).padStart(6)}                ║`);
  console.log(`║  ④ Template候选数:       ${String(templateCandidates).padStart(6)}  (进入模板匹配)   ║`);

  if (results.length > 0) {
    const confidences = results.map(r => r.confidence);
    const avgConf = confidences.reduce((s, c) => s + c, 0) / confidences.length;
    const lt05 = results.filter(r => r.confidence < 0.5).length;
    const lt04 = results.filter(r => r.confidence < 0.4).length;
    const lt03 = results.filter(r => r.confidence < 0.3).length;

    console.log('%c╠══════════════════════════════════════════╣', 'color:#f59e0b');
    console.log(`║  DetectedSymbol Count:   ${String(results.length).padStart(6)}              ║`);
    console.log(`║  Average Confidence:     ${avgConf.toFixed(4)}            ║`);
    console.log(`║  confidence >= 0.5:      ${String(results.length - lt05).padStart(6)} (${((results.length-lt05)/results.length*100).toFixed(0)}%)   ║`);
    console.log(`║  confidence <  0.5:      ${String(lt05).padStart(6)} (${(lt05/results.length*100).toFixed(0)}%)   ║`);
    console.log(`║  confidence <  0.4:      ${String(lt04).padStart(6)} (${(lt04/results.length*100).toFixed(0)}%)   ║`);
    console.log(`║  confidence <  0.3:      ${String(lt03).padStart(6)} (${(lt03/results.length*100).toFixed(0)}%)   ║`);
    if (lt03 > 0) {
      console.log(`%c║  ⚠️ 存在低置信度检测! 可能误识别       ║`, 'color:#ef4444');
    }
  }

  // ── Pipeline 一致性验证 ──
  console.log('%c╠══════════════════════════════════════════╣', 'color:#8b5cf6');
  let postEmptyGridCells = 0, postEmptyGridWithSymbol = 0, postHoleCells = 0, postDetectedSymbolCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.emptyType === 'outer') {
        postEmptyGridCells++;
        if (cell.symbol) postEmptyGridWithSymbol++;
      } else if (cell.emptyType === 'inner') {
        postHoleCells++;
      }
      if (cell.symbol && cell.symbol !== '') postDetectedSymbolCells++;
    }
  }

  console.log(`║  ── Pipeline 验证 ──────────────────────── ║`);
  console.log(`║  EmptyGrid Cells:        ${String(postEmptyGridCells).padStart(6)}                ║`);
  console.log(`║  EmptyGrid+Symbol:       ${String(postEmptyGridWithSymbol).padStart(6)}  ← 必须=0!     ║`);
  console.log(`║  Hole Cells:             ${String(postHoleCells).padStart(6)}                ║`);
  console.log(`║  DetectedSymbol Cells:   ${String(postDetectedSymbolCells).padStart(6)}              ║`);

  if (postEmptyGridWithSymbol === 0) {
    console.log('%c║  ✅ PASS: EmptyGrid无符号，Pipeline一致!     ║', 'color:#22c55e;font-weight:bold');
  } else {
    console.log(`%c║  ❌ FAIL: ${postEmptyGridWithSymbol}个EmptyGrid有符号!         ║`, 'color:#ef4444;font-weight:bold');
  }

  console.log('%c╚════════════════════════════════════════════╝', 'color:#f59e0b');

  return results;
}

export interface LegendEntry {
  color: string;
  symbol?: string;
  name?: string;
  count?: number;
}

export function detectLegendArea(imageData: ImageData): LegendEntry[] {
  const { width, height, data } = imageData;
  const entries: LegendEntry[] = [];

  const bottomRegion = Math.floor(height * 0.75);
  const rightRegion = Math.floor(width * 0.75);

  const bottomProfile = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0, count = 0;
    for (let y = bottomRegion; y < height; y++) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      sum += gray; count++;
    }
    bottomProfile[x] = sum / count;
  }

  const rightProfile = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0, count = 0;
    for (let x = rightRegion; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      sum += gray; count++;
    }
    rightProfile[y] = sum / count;
  }

  const legendColors: RGBColor[] = [];
  const step = Math.max(4, Math.floor(Math.min(width, height) / 50));

  for (let y = bottomRegion; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (!isGridLineColor(r, g, b)) {
        const isDuplicate = legendColors.some(lc => ciede2000(lc, { r, g, b }) < 10);
        if (!isDuplicate) {
          legendColors.push({ r, g, b });
        }
      }
    }
  }

  for (let y = step; y < height - step; y += step) {
    for (let x = rightRegion; x < width - step; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (!isGridLineColor(r, g, b)) {
        const isDuplicate = legendColors.some(lc => ciede2000(lc, { r, g, b }) < 10);
        if (!isDuplicate) {
          legendColors.push({ r, g, b });
        }
      }
    }
  }

  for (const lc of legendColors) {
    entries.push({
      color: rgbToHex(lc.r, lc.g, lc.b),
    });
  }

  return entries;
}

export interface ContentArea {
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor?: RGBColor;
}

function detectBackgroundColor(imageData: ImageData): RGBColor {
  const { width, height, data } = imageData;
  const edgePixels: RGBColor[] = [];
  const border = Math.max(2, Math.floor(Math.min(width, height) * 0.02));

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < border; y++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness > 100) {
          edgePixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }
    for (let y = height - border; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness > 100) {
          edgePixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }
  }

  for (let y = border; y < height - border; y++) {
    for (let x = 0; x < border; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness > 100) {
          edgePixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }
    for (let x = width - border; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (brightness > 100) {
          edgePixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }
  }

  if (edgePixels.length === 0) return { r: 255, g: 255, b: 255 };

  let sumR = 0, sumG = 0, sumB = 0;
  for (const p of edgePixels) { sumR += p.r; sumG += p.g; sumB += p.b; }
  return { r: Math.round(sumR / edgePixels.length), g: Math.round(sumG / edgePixels.length), b: Math.round(sumB / edgePixels.length) };
}

function isBackgroundPixel(r: number, g: number, b: number, bg: RGBColor): boolean {
  const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) < 20;
}

function detectContentArea(imageData: ImageData): ContentArea {
  const { width, height, data } = imageData;
  const bgColor = detectBackgroundColor(imageData);

  // Step 1: 检测图像是否为完整的网格图（高边缘密度 = 网格线覆盖大部分区域）
  // 计算每行的边缘强度（用于检测网格线）
  const rowEdgeDensity: number[] = [];
  const colEdgeDensity: number[] = [];

  for (let y = 0; y < height; y++) {
    let edgeSum = 0;
    for (let x = 1; x < width; x++) {
      const idx0 = (y * width + x - 1) * 4;
      const idx1 = (y * width + x) * 4;
      const diff = Math.abs(data[idx0] - data[idx1]) + Math.abs(data[idx0 + 1] - data[idx1 + 1]) + Math.abs(data[idx0 + 2] - data[idx1 + 2]);
      edgeSum += diff;
    }
    rowEdgeDensity.push(edgeSum / Math.max(1, width));
  }

  for (let x = 0; x < width; x++) {
    let edgeSum = 0;
    for (let y = 1; y < height; y++) {
      const idx0 = ((y - 1) * width + x) * 4;
      const idx1 = (y * width + x) * 4;
      const diff = Math.abs(data[idx0] - data[idx1]) + Math.abs(data[idx0 + 1] - data[idx1 + 1]) + Math.abs(data[idx0 + 2] - data[idx1 + 2]);
      edgeSum += diff;
    }
    colEdgeDensity.push(edgeSum / Math.max(1, height));
  }

  // 计算边缘密度的中位数作为阈值
  const sortedRowEdges = [...rowEdgeDensity].sort((a, b) => a - b);
  const sortedColEdges = [...colEdgeDensity].sort((a, b) => a - b);
  const rowEdgeMedian = sortedRowEdges[Math.floor(sortedRowEdges.length / 2)];
  const colEdgeMedian = sortedColEdges[Math.floor(sortedColEdges.length / 2)];

  // 统计有显著边缘的行/列比例
  const rowEdgeThreshold = Math.max(rowEdgeMedian * 0.3, 3);
  const colEdgeThreshold = Math.max(colEdgeMedian * 0.3, 3);
  const rowsWithEdges = rowEdgeDensity.filter(e => e > rowEdgeThreshold).length;
  const colsWithEdges = colEdgeDensity.filter(e => e > colEdgeThreshold).length;
  const rowEdgeRatio = rowsWithEdges / height;
  const colEdgeRatio = colsWithEdges / width;

  console.log(`=== 内容区域检测 ===`);
  console.log(`图片尺寸: ${width}x${height}`);
  console.log(`行边缘密度: 中位数=${rowEdgeMedian.toFixed(1)}, 有边缘行比例=${(rowEdgeRatio * 100).toFixed(1)}% (${rowsWithEdges}/${height})`);
  console.log(`列边缘密度: 中位数=${colEdgeMedian.toFixed(1)}, 有边缘列比例=${(colEdgeRatio * 100).toFixed(1)}% (${colsWithEdges}/${width})`);

  // 如果超过60%的行和列都有边缘，说明是完整的网格图，返回全图
  const isFullGridImage = rowEdgeRatio > 0.6 && colEdgeRatio > 0.6 && rowsWithEdges > 10 && colsWithEdges > 10;

  if (isFullGridImage) {
    console.log(`✅ 检测到完整网格图（行边缘${(rowEdgeRatio*100).toFixed(0)}%, 列边缘${(colEdgeRatio*100).toFixed(0)}%), 使用全图作为内容区域`);
    return { x: 0, y: 0, width, height, backgroundColor: bgColor };
  }

  // Step 2: 对于非完整网格图，使用传统的内容检测但降低阈值
  const rowHasContent: boolean[] = new Array(height).fill(false);
  const colHasContent: boolean[] = new Array(width).fill(false);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 128) continue;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      if (!isBackgroundPixel(r, g, b, bgColor) && brightness > 20) {
        rowHasContent[y] = true;
        colHasContent[x] = true;
      }
    }
  }

  let contentRows = 0;
  for (let y = 0; y < height; y++) {
    if (rowHasContent[y]) contentRows++;
  }
  let contentCols = 0;
  for (let x = 0; x < width; x++) {
    if (colHasContent[x]) contentCols++;
  }

  // 大幅降低阈值：从0.3降到0.05
  const minRowRatio = Math.max(0.05, contentRows * 0.08 / height);
  const minColRatio = Math.max(0.05, contentCols * 0.08 / width);

  const validRows: number[] = [];
  for (let y = 0; y < height; y++) {
    let rowContentPixels = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (!isBackgroundPixel(data[idx], data[idx + 1], data[idx + 2], bgColor) && brightness > 20) {
          rowContentPixels++;
        }
      }
    }
    if (rowContentPixels > width * minRowRatio || rowEdgeDensity[y] > rowEdgeThreshold) {
      validRows.push(y);
    }
  }

  const validCols: number[] = [];
  for (let x = 0; x < width; x++) {
    let colContentPixels = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] >= 128) {
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        if (!isBackgroundPixel(data[idx], data[idx + 1], data[idx + 2], bgColor) && brightness > 20) {
          colContentPixels++;
        }
      }
    }
    if (colContentPixels > height * minColRatio || colEdgeDensity[x] > colEdgeThreshold) {
      validCols.push(x);
    }
  }

  if (validRows.length === 0 || validCols.length === 0) {
    return { x: 0, y: 0, width, height, backgroundColor: bgColor };
  }

  const minY = validRows[0];
  const maxY = validRows[validRows.length - 1];
  const minX = validCols[0];
  const maxX = validCols[validCols.length - 1];

  // 增加padding确保不裁掉边缘格子
  const pad = Math.max(5, Math.floor(Math.min(maxX - minX, maxY - minY) * 0.03));
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(width - cx, maxX - minX + 1 + 2 * pad);
  const ch = Math.min(height - cy, maxY - minY + 1 + 2 * pad);

  console.log(`内容区域检测: 原始(${width}x${height}) → 裁剪后(${cw}x${ch}), 位置(${cx},${cy}), 有效行=${validRows.length}, 有效列=${validCols.length}`);

  return { x: cx, y: cy, width: cw, height: ch, backgroundColor: bgColor };
}

export function cropImageData(imageData: ImageData, area: ContentArea): ImageData {
  const newImg = new ImageData(area.width, area.height);
  const srcData = imageData.data;
  const dstData = newImg.data;

  for (let dy = 0; dy < area.height; dy++) {
    for (let dx = 0; dx < area.width; dx++) {
      const sx = area.x + dx;
      const sy = area.y + dy;
      const dstIdx = (dy * area.width + dx) * 4;
      if (sx >= 0 && sx < imageData.width && sy >= 0 && sy < imageData.height) {
        const srcIdx = (sy * imageData.width + sx) * 4;
        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      } else {
        dstData[dstIdx] = 255;
        dstData[dstIdx + 1] = 255;
        dstData[dstIdx + 2] = 255;
        dstData[dstIdx + 3] = 255;
      }
    }
  }
  return newImg;
}

/**
 * 获取宽松的内容区域：在标准内容区基础上扩大范围
 * 用于编织图有内部空心（纯白无网格线）的情况，保留更多空白格子
 */
function getLooseContentArea(imageData: ImageData, strictArea: ContentArea): ContentArea {
  const { width, height, data } = imageData;
  const padding = Math.max(20, Math.floor(Math.min(width, height) * 0.08));

  return {
    x: Math.max(0, strictArea.x - padding),
    y: Math.max(0, strictArea.y - padding),
    width: Math.min(width - strictArea.x + padding, strictArea.width + padding * 2),
    height: Math.min(height - strictArea.y + padding, strictArea.height + padding * 2),
    backgroundColor: strictArea.backgroundColor,
  };
}

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

export async function processImage(
  file: File,
  targetCols: number,
  targetRows: number,
  maxColors: number,
  enableSymbolDetection: boolean,
  useDetectedGridSize: boolean = true,
  symbolMode: 'all' | 'knitting' | 'crochet' = 'knitting',
  imageTypeMode: 'auto' | 'color_pattern' | 'structure' | 'cross_stitch' | 'pixel_art' = 'auto',
  onProgress?: (stage: string, percent: number) => void
): Promise<{ grid: GridCell[][]; extractedColors: ExtractedColor[]; symbols: SymbolMatchResult[]; detectedCols?: number; detectedRows?: number; actualGridInfo?: GridDetectionResult; legendEntries?: LegendEntry[]; contentArea?: ContentArea; gridMatrixOutput?: GridMatrixOutput; debugImageUrl?: string; debugStats?: DebugStats; imageTypeResult?: ImageTypeAnalysisResult; debugImages?: { stage: string; dataUrl: string }[] }> {
  // ════════════════════════════════════
  // ★ processImage 入口 — 不可错过
  // ════════════════════════════════════
  console.log('%c' + '█'.repeat(60), 'color:#22c55e;font-weight:bold;background:#000');
  console.log('%c★ processImage 已进入! imageTypeMode=' + imageTypeMode + ' ★', 'color:#22c55e;font-weight:bold;background:#000');
  console.log('%c★ file.name=' + file.name + ', size=' + file.size + ' ★', 'color:#22c55e;font-weight:bold;background:#000');
  console.log('%c' + '█'.repeat(60), 'color:#22c55e;font-weight:bold;background:#000');

  onProgress?.('加载图片', 4);
  const img = await loadImage(file);

  onProgress?.('提取图像数据', 8);
  const originalImageData = getImageData(img);

  // === 图片类型识别（在任何颜色聚类或网格生成之前执行）===
  onProgress?.('图片类型识别', 10);

  let imageTypeResult: ImageTypeAnalysisResult;
  let isStructurePattern: boolean;
  // 声明结构图结果变量（在 Pipeline 阶段赋值，返回时使用）
  let structResult: ReturnType<typeof processStructurePattern> | undefined = undefined;

  if (imageTypeMode === 'auto') {
    // 自动识别模式：运行完整分析
    imageTypeResult = analyzeImageType(originalImageData);
    isStructurePattern = imageTypeResult.type === 'STRUCTURE_PATTERN';
    console.log(`[图片类型] 自动检测结果: ${imageTypeResult.type}`);
  } else {
    // 用户手动指定模式，跳过自动分析
    const typeMap: Record<string, ImageType> = {
      color_pattern: 'COLOR_PATTERN',
      structure: 'STRUCTURE_PATTERN',
      cross_stitch: 'COLOR_PATTERN',   // 十字绣 → 彩色模式
      pixel_art: 'COLOR_PATTERN',       // 像素画 → 彩色模式
    };
    const detectedType = typeMap[imageTypeMode] || 'COLOR_PATTERN';
    isStructurePattern = detectedType === 'STRUCTURE_PATTERN';

    // 构造用户指定的结果（无特征数据）
    imageTypeResult = {
      type: detectedType,
      features: { uniqueColors: 0, avgSaturation: 0, avgBrightness: 0, lineDensity: 0, darkPixelRatio: 0, colorVariance: 0 },
      scores: { colorScore: isStructurePattern ? 0 : 1, structureScore: isStructurePattern ? 1 : 0 },
    };

    const modeLabel: Record<string, string> = {
      color_pattern: '彩图编织图',
      structure: '针织结构图',
      cross_stitch: '十字绣图',
      pixel_art: '像素画',
    };
    console.log(`%c[图片类型] 用户手动指定: ${modeLabel[imageTypeMode]} → ${detectedType}`, isStructurePattern ? 'color:#f59e0b;font-weight:bold' : 'color:#22c55e;font-weight:bold');
  }

  const imageWidth = originalImageData.width;
  const imageHeight = originalImageData.height;
  const aspectRatio = imageWidth / imageHeight;

  onProgress?.('检测有效区域', 12);
  const contentArea = detectContentArea(originalImageData);
  console.log(`[内容区域] x=${contentArea.x}, y=${contentArea.y}, w=${contentArea.width}, h=${contentArea.height}`);
  console.log(`[原图尺寸] ${originalImageData.width}x${originalImageData.height}`);

  // 先在全图上检测网格，判断是否为编织图
  onProgress?.('自动检测网格(全图)', 18);
  const actualGridInfoOnFull = detectGridSize(originalImageData);
  console.log(`[全图网格检测] cols=${actualGridInfoOnFull.cols}, rows=${actualGridInfoOnFull.rows}, confidence=${actualGridInfoOnFull.confidence?.toFixed(3)}`);

  // 关键修复：编织图的空白区域(含无网格线的纯白区)也是有效内容
  // 策略1: 全图检测到有效网格(≥3x3) → 用全图
  // 策略2: 检测到部分网格但不足 → 扩大内容区而非严格裁剪
  let croppedOriginal: ImageData;
  let actualGridInfo: GridDetectionResult;

  const hasPartialGrid = (actualGridInfoOnFull.cols >= 3 && actualGridInfoOnFull.rows >= 3) ||
                         (actualGridInfoOnFull.cols >= 10 || actualGridInfoOnFull.rows >= 10);

  if (actualGridInfoOnFull.cols >= 5 && actualGridInfoOnFull.rows >= 5 && (actualGridInfoOnFull.confidence ?? 0) > 0.05) {
    console.log(`✅ 使用全图处理 (网格${actualGridInfoOnFull.cols}x${actualGridInfoOnFull.rows})`);
    croppedOriginal = originalImageData;
    actualGridInfo = actualGridInfoOnFull;
  } else if (hasPartialGrid) {
    // 检测到部分网格但不够强 → 使用宽松的内容区（保留更多空白）
    console.log(`⚠️ 全图检测到部分网格(cols=${actualGridInfoOnFull.cols},rows=${actualGridInfoOnFull.rows}), 使用宽松内容区`);
    const looseArea = getLooseContentArea(originalImageData, contentArea);
    console.log(`[宽松内容区] x=${looseArea.x}, y=${looseArea.y}, w=${looseArea.width}, h=${looseArea.height}`);
    croppedOriginal = cropImageData(originalImageData, looseArea);
    actualGridInfo = detectGridSize(croppedOriginal);
    console.log(`[宽松区网格] cols=${actualGridInfo.cols}, rows=${actualGridInfo.rows}`);
  } else {
    console.log(`⚠️ 全图未检测到有效网格, 使用标准内容区裁剪`);
    croppedOriginal = cropImageData(originalImageData, contentArea);
    console.log(`[裁剪后尺寸] ${croppedOriginal.width}x${croppedOriginal.height}`);
    actualGridInfo = detectGridSize(croppedOriginal);
    console.log(`[裁剪后网格] cols=${actualGridInfo.cols}, rows=${actualGridInfo.rows}`);
  }

  onProgress?.('图像降噪处理', 25);
  const denoisedData = cloneImageData(croppedOriginal);
  denoiseImage(denoisedData, 1);

  // === 根据图片类型选择 Pipeline ===
  const finalCols = useDetectedGridSize && actualGridInfo.cols > 0 ? actualGridInfo.cols : targetCols;
  const finalRows = useDetectedGridSize && actualGridInfo.rows > 0 ? actualGridInfo.rows : targetRows;

  console.log('%c' + '═'.repeat(60), 'color:#ef4444;font-weight:bold');
  console.log('%c[Pipeline 分支判断] isStructurePattern = ' + isStructurePattern, isStructurePattern ? 'color:#f59e0b;font-weight:bold' : 'color:#22c55e;font-weight:bold');
  console.log(`[Pipeline] imageTypeMode=${imageTypeMode}, finalCols=${finalCols}, finalRows=${finalRows}`);
  console.log(`[Pipeline] actualGridInfo: cols=${actualGridInfo.cols}, rows=${actualGridInfo.rows}`);
  if (!isStructurePattern) {
    console.log('%c[Pipeline] ⚠️ 将走 COLOR_PATTERN 分支，不调用 processStructurePattern!', 'color:#ef4444;font-weight:bold');
  }
  console.log('%c' + '═'.repeat(60), 'color:#ef4444;font-weight:bold');

  let extractedColors: ExtractedColor[];
  let palette: string[];

  // 结构图模式专用：直接调用完整轮廓提取 Pipeline
  if (isStructurePattern) {
    structResult = processStructurePattern(
      denoisedData,
      finalCols,
      finalRows,
      actualGridInfo,
      onProgress
    );

    // 将结构图 Pipeline 的 5 阶段调试图合并到全局调试输出
    structResult.debugImages.forEach(di => {
      console.log(`%c[结构图调试] ${di.stage} 已生成`, 'color:#f59e0b');
    });

    extractedColors = structResult.extractedColors;
    palette = structResult.palette;

    // 输出 5 阶段调试图到控制台（可被 UI 捕获显示）
    console.log('%c╔══════════════════════════════════════════╗', 'color:#ef4444;font-weight:bold');
    console.log('%c║       结构图 5 阶段诊断                      ║', 'color:#ef4444;font-weight:bold');
    console.log('%c╠══════════════════════════════════════════╣', 'color:#ef4444;font-weight:bold');
    structResult.debugImages.forEach((di, i) => {
      console.log(`║  Stage${i + 1}: ${di.stage.padEnd(22)} dataUrl长度: ${di.dataUrl.length} ║`);
    });
    console.log('%c╚══════════════════════════════════════════╝', 'color:#ef4444;font-weight:bold');
  } else {
    // ── COLOR_PATTERN Pipeline ──
    onProgress?.('颜色量化分析', 40);
    console.log('[Pipeline] COLOR_MODE: LAB → Median Cut → KMeans → Palette Mapping');

    extractedColors = extractColors(croppedOriginal, maxColors, actualGridInfo, contentArea.backgroundColor);
    palette = extractedColors.map(c => c.hex);
    // 确保调色板包含纯白色(Rule 16: PATTERN_WHITE)，使 findClosestColor 能正确匹配空白格
    if (!palette.includes(PATTERN_WHITE)) {
      palette = [PATTERN_WHITE, ...palette];
    }
  }

  console.log('=== 颜色提取结果 ===');
  const bgCol = contentArea.backgroundColor || { r: 255, g: 255, b: 255 };
  console.log(`背景色: RGB(${bgCol.r}, ${bgCol.g}, ${bgCol.b})`);
  console.log(`提取到 ${extractedColors.length} 种颜色:`);
  extractedColors.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.hex} (像素数: ${c.count})`);
  });
  console.log(`调色板: [${palette.join(', ')}]`);

  let adjustedCols = finalCols;
  let adjustedRows = finalRows;

  if (useDetectedGridSize) {
    const imgAspect = croppedOriginal.width / croppedOriginal.height;
    const gridAspect = finalCols / finalRows;
    if (Math.abs(imgAspect - gridAspect) > 0.15) {
      if (imgAspect > gridAspect) {
        adjustedRows = Math.max(5, Math.round(finalCols / imgAspect));
        adjustedRows = Math.min(adjustedRows, Math.max(finalRows, Math.round(finalRows * 1.5)));
        if (Math.abs(croppedOriginal.width / croppedOriginal.height - finalCols / adjustedRows) > 0.15) {
          adjustedRows = finalRows;
          adjustedCols = finalCols;
        }
      } else {
        adjustedCols = Math.max(5, Math.round(finalRows * imgAspect));
        adjustedCols = Math.min(adjustedCols, Math.max(finalCols, Math.round(finalCols * 1.5)));
        if (Math.abs(croppedOriginal.width / croppedOriginal.height - adjustedCols / finalRows) > 0.15) {
          adjustedRows = finalRows;
          adjustedCols = finalCols;
        }
      }
    }
  }

  onProgress?.('生成网格图纸', 55);

  // 结构图模式：使用 processStructurePattern 已生成的网格（含轮廓+泛洪分类）
  // 彩色模式：使用 imageToGrid 基于颜色聚类的标准流程
  let grid: GridCell[][];
  if (isStructurePattern) {
    // processStructurePattern 在 Pipeline 阶段已生成完整 grid
    // 这里重新调用以获取最新结果（因为 denoisedData 可能已被修改）
    structResult = processStructurePattern(
      denoisedData,
      adjustedCols,
      adjustedRows,
      actualGridInfo,
      (stage, p) => onProgress?.(stage, 55 + p * 0.15)
    );
    grid = structResult.grid;
    // 用结构图结果覆盖 extractedColors/palette（确保一致性）
    extractedColors.length = 0;
    structResult.extractedColors.forEach(c => extractedColors.push(c));
    palette = structResult.palette;
    console.log(`[结构图] 网格生成完成: ${grid[0]?.length || 0} x ${grid.length} (基于轮廓提取)`);
  } else {
    grid = imageToGrid(croppedOriginal, adjustedCols, adjustedRows, palette, actualGridInfo, contentArea.backgroundColor, (p) => onProgress?.('生成网格图纸', 55 + p * 0.15));
    console.log(`=== 网格生成完成: ${adjustedCols} x ${adjustedRows} ===`);
  }

  // Rule 15: 负空间检测 + 连通分析
  // ⚠️ STRUCTURE_PATTERN 模式下跳过！processStructurePattern 已完成 Hole/EmptyGrid 分类
  //    若重复执行 detectNegativeSpace，会将所有浅色 cell 标记为 active=false → 空白画布
  let debugResult: { dataUrl: string; stats: DebugStats };
  if (!isStructurePattern) {
    const negResult = detectNegativeSpace(grid);
    if (negResult.cells.size > 0) {
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          if (negResult.cells.has(`${r},${c}`)) {
            grid[r][c].active = false;
          }
        }
      }
      console.log(`[Rule15] 已标记 ${negResult.cells.size} 个负空间格子（${negResult.regions.map(r => `${r.type}:${r.cellCount}`).join(', ')}）`);
    }

    classifyEmptyCellsByConnectivity(grid);

    debugResult = generateConnectivityDebugImage(grid);
    console.log(`[调试] 连通分析调试图已生成，尺寸: ${grid[0].length}x${grid.length}`);
  } else {
    console.log('[结构图] 跳过 detectNegativeSpace + classifyEmptyCellsByConnectivity（已由 Pipeline 内部处理）');
    // 结构图模式使用 CellTypeOverlay 作为连通调试图
    debugResult = { dataUrl: '', stats: { gridTotal: 0, patternCount: 0, emptyCount: 0, outsideCount: 0, outerCount: 0, innerCount: 0 } };
  }

  const colorStats = new Map<string, number>();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = grid[r][c].color;
      colorStats.set(color, (colorStats.get(color) || 0) + 1);
    }
  }
  console.log('颜色分布:');
  colorStats.forEach((count, color) => {
    console.log(`  ${color}: ${count} 个格子`);
  });

  const colorToId = new Map<string, string>();
  extractedColors.forEach((c, i) => {
    colorToId.set(c.hex, `C${i + 1}`);
  });

  const matrix: string[][] = [];
  for (let r = 0; r < grid.length; r++) {
    const row: string[] = [];
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      // Rule 15: 负空间格子标记为 NEGATIVE
      if (cell.active === false) {
        row.push('NEGATIVE');
      } else if (cell.color === PATTERN_WHITE || cell.color === GRID_BACKGROUND) {
        // Rule 16: Both PATTERN_WHITE and GRID_BACKGROUND map to 'WHITE' in matrix output
        row.push('WHITE');
      } else {
        row.push(colorToId.get(cell.color) || 'C1');
      }
    }
    matrix.push(row);
  }

  const gridMatrixOutput: GridMatrixOutput = {
    image_width: imageWidth,
    image_height: imageHeight,
    aspect_ratio: Math.round(aspectRatio * 10000) / 10000,
    grid_width: adjustedCols,
    grid_height: adjustedRows,
    colors: [
      { id: 'WHITE', hex: PATTERN_WHITE, pixels: 0 },
      ...extractedColors.map((c, i) => ({
        id: `C${i + 1}`,
        hex: c.hex,
        pixels: c.count,
      }))
    ],
    matrix,
  };

  let symbols: SymbolMatchResult[] = [];

  // ════════════════════════════════════
  // 符号检测：按模式分流
  //
  // COLOR_PATTERN:    完整执行 detectSymbols (保持原有逻辑不变)
  // STRUCTURE_PATTERN: 完全跳过，symbols = []
  // ════════════════════════════════════
  if (enableSymbolDetection && !isStructurePattern) {
    // ── COLOR_PATTERN: 正常符号检测流程（不修改）──
    onProgress?.('图像锐化', 72);
    const enhancedData = cloneImageData(denoisedData);
    sharpenImage(enhancedData, 0.6);

    onProgress?.('增强对比度', 76);
    enhanceContrast(enhancedData, 1.2);

    onProgress?.('识别编织符号', 80);
    symbols = detectSymbols(
      enhancedData, grid, 24, actualGridInfo, symbolMode,
      (p) => onProgress?.('识别编织符号', 80 + p * 0.12),
      false   // 彩图模式：允许空间一致性自动填充
    );

    console.log(`[COLOR_PATTERN] 符号检测完成: ${symbols.length} 个`);
  } else if (isStructurePattern) {
    // ── STRUCTURE_PATTERN: 完全跳过符号检测 ──
    symbols = [];

    // 统计结构模式网格分类结果
    let structEmptyGridCount = 0, structHoleCount = 0, structTotalCells = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        structTotalCells++;
        const et = grid[r][c].emptyType;
        if (et === 'outer') structEmptyGridCount++;
        else if (et === 'inner') structHoleCount++;
        // 强制清除任何残留符号
        grid[r][c].symbol = undefined;
      }
    }

    console.log('%c╔════════════════════════════════════════════╗', 'color:#3b82f6;font-weight:bold');
    console.log('%c║       [Structure Mode] Pipeline 报告         ║', 'color:#3b82f6;font-weight:bold');
    console.log('%c╠════════════════════════════════════════════╣', 'color:#3b82f6');
    console.log(`║  Grid Cells:            ${String(structTotalCells).padStart(6)}                      ║`);
    console.log(`║  EmptyGrid (outer):     ${String(structEmptyGridCount).padStart(6)}  浅灰格子          ║`);
    console.log(`║  Hole (inner):          ${String(structHoleCount).padStart(6)}  纯白无格线        ║`);
    console.log(`║  Symbol Detection:      SKIPPED                     ║`);
    console.log(`║  Template Matching:     SKIPPED                     ║`);
    console.log(`║  Auto Fill:             DISABLED                    ║`);
    console.log(`║  Symbol Rendering:      DISABLED                    ║`);
    console.log('%c╠════════════════════════════════════════════╣', 'color:#3b82f6');
    console.log('║  Pipeline: Grid→Contour→FloodFill→Classify→Render ║');
    console.log('%c╚════════════════════════════════════════════╝', 'color:#3b82f6;font-weight:bold');

    onProgress?.('结构图处理完成', 100);
  }

  onProgress?.('检测图例信息', 95);
  const legendEntries = detectLegendArea(croppedOriginal);

  onProgress?.('完成', 100);
  return {
    grid,
    extractedColors,
    symbols,
    detectedCols: actualGridInfo.cols > 0 ? actualGridInfo.cols : undefined,
    detectedRows: actualGridInfo.rows > 0 ? actualGridInfo.rows : undefined,
    actualGridInfo: actualGridInfo.cols > 0 && actualGridInfo.rows > 0 ? actualGridInfo : undefined,
    legendEntries,
    contentArea,
    gridMatrixOutput,
    debugImageUrl: debugResult.dataUrl,
    debugStats: debugResult.stats,
    imageTypeResult,
    debugImages: isStructurePattern ? structResult?.debugImages : undefined,
  };
}

export function gridMatrixToChart(matrixOutput: GridMatrixOutput): KnittingChart {
  const colorMap = new Map<string, string>();
  for (const c of matrixOutput.colors) {
    colorMap.set(c.id, c.hex);
  }

  const rows = matrixOutput.grid_height;
  const cols = matrixOutput.grid_width;
  const cells: GridCell[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < cols; c++) {
      const colorId = matrixOutput.matrix[r]?.[c];
      const color = colorMap.get(colorId) || GRID_BACKGROUND;
      row.push({ row: r, col: c, color, symbol: undefined });
    }
    cells.push(row);
  }

  const colors = matrixOutput.colors.map(c => c.hex);

  return {
    rows,
    cols,
    cells,
    colors,
    cellSize: 20,
  };
}

export interface ValidationError {
  x: number;
  y: number;
  expected: string;
  actual: string;
}

export interface ValidationResult {
  colorBlockErrorRate: number;
  contourErrorRate: number;
  aspectRatioErrorRate: number;
  missingBlocks: number;
  extraBlocks: number;
  errors: ValidationError[];
  exceedsThreshold: boolean;
}

export function validateMatrixAgainstImage(
  imageData: ImageData,
  matrixOutput: GridMatrixOutput,
  colorThreshold: number = 30
): ValidationResult {
  const { width: imgWidth, height: imgHeight, data } = imageData;
  const { grid_width: gridCols, grid_height: gridRows, colors, matrix } = matrixOutput;

  const colorMap = new Map<string, RGBColor>();
  for (const c of colors) {
    colorMap.set(c.id, hexToRgb(c.hex));
  }

  const cellWidth = imgWidth / gridCols;
  const cellHeight = imgHeight / gridRows;

  const imgAspect = imgWidth / imgHeight;
  const gridAspect = gridCols / gridRows;
  const aspectRatioErrorRate = Math.abs(imgAspect - gridAspect) / imgAspect;

  let totalCells = 0;
  let errorCells = 0;
  const errors: ValidationError[] = [];

  const originalColorGrid: string[][] = [];

  for (let r = 0; r < gridRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < gridCols; c++) {
      const sx = Math.floor(c * cellWidth);
      const sy = Math.floor(r * cellHeight);
      const ex = Math.min(Math.floor((c + 1) * cellWidth), imgWidth);
      const ey = Math.min(Math.floor((r + 1) * cellHeight), imgHeight);

      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
          const idx = (y * imgWidth + x) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          count++;
        }
      }

      const avgR = count > 0 ? sumR / count : 255;
      const avgG = count > 0 ? sumG / count : 255;
      const avgB = count > 0 ? sumB / count : 255;

      let bestColorId = 'C1';
      let bestDist = Infinity;
      for (const [id, rgb] of colorMap) {
        const dr = avgR - rgb.r;
        const dg = avgG - rgb.g;
        const db = avgB - rgb.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < bestDist) {
          bestDist = dist;
          bestColorId = id;
        }
      }

      row.push(bestColorId);
      totalCells++;

      const expectedColorId = matrix[r]?.[c];
      if (expectedColorId && bestColorId !== expectedColorId) {
        const expectedRgb = colorMap.get(expectedColorId);
        const actualRgb = colorMap.get(bestColorId);
        if (expectedRgb && actualRgb) {
          const colorDist = ciede2000(expectedRgb, actualRgb);
          if (colorDist > colorThreshold) {
            errorCells++;
            errors.push({
              x: c,
              y: r,
              expected: expectedColorId,
              actual: bestColorId,
            });
          }
        }
      }
    }
    originalColorGrid.push(row);
  }

  const colorBlockErrorRate = totalCells > 0 ? errorCells / totalCells : 0;

  let contourErrors = 0;
  let contourTotal = 0;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const expected = matrix[r]?.[c];
      if (!expected) continue;

      const rightExpected = c < gridCols - 1 ? matrix[r]?.[c + 1] : null;
      const bottomExpected = r < gridRows - 1 ? matrix[r + 1]?.[c] : null;

      const rightActual = c < gridCols - 1 ? originalColorGrid[r]?.[c + 1] : null;
      const bottomActual = r < gridRows - 1 ? originalColorGrid[r + 1]?.[c] : null;

      if (rightExpected !== null && rightActual !== null) {
        const expectedBoundary = expected !== rightExpected;
        const actualBoundary = originalColorGrid[r][c] !== rightActual;
        if (expectedBoundary !== actualBoundary) {
          contourErrors++;
        }
        contourTotal++;
      }

      if (bottomExpected !== null && bottomActual !== null) {
        const expectedBoundary = expected !== bottomExpected;
        const actualBoundary = originalColorGrid[r][c] !== bottomActual;
        if (expectedBoundary !== actualBoundary) {
          contourErrors++;
        }
        contourTotal++;
      }
    }
  }

  const contourErrorRate = contourTotal > 0 ? contourErrors / contourTotal : 0;

  const expectedColorSet = new Set<string>();
  const actualColorSet = new Set<string>();
  for (const row of matrix) {
    for (const id of row) {
      expectedColorSet.add(id);
    }
  }
  for (const row of originalColorGrid) {
    for (const id of row) {
      actualColorSet.add(id);
    }
  }

  let missingBlocks = 0;
  for (const id of expectedColorSet) {
    if (!actualColorSet.has(id)) {
      missingBlocks++;
    }
  }

  let extraBlocks = 0;
  for (const id of actualColorSet) {
    if (!expectedColorSet.has(id)) {
      extraBlocks++;
    }
  }

  const maxErrorRate = Math.max(colorBlockErrorRate, contourErrorRate, aspectRatioErrorRate);
  const exceedsThreshold = maxErrorRate > 0.01;

  return {
    colorBlockErrorRate: Math.round(colorBlockErrorRate * 10000) / 100,
    contourErrorRate: Math.round(contourErrorRate * 10000) / 100,
    aspectRatioErrorRate: Math.round(aspectRatioErrorRate * 10000) / 100,
    missingBlocks,
    extraBlocks,
    errors,
    exceedsThreshold,
  };
}
