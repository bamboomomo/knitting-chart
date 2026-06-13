import type { GridCell } from '../types';
import { getSymbolImage, hasSymbolImage, preloadSymbolImages, debugSymbolStatus } from './symbolImages';
import {
  GRID_BACKGROUND,
  EDITABLE_EMPTY,
  PATTERN_WHITE,
  GRID_LINE_NORMAL,
  GRID_LINE_BOLD,
  GRID_LINE_OUTER,
  SYMBOL_TEXT_DARK,
  SYMBOL_TEXT_LIGHT,
  CELL_BORDER,
  TABLE_HEADER_BG,
  SHEET_TITLE_BG,
  SHEET_TITLE_TEXT,
  LABEL_TEXT
} from './colorConstants';

preloadSymbolImages();

const SYMBOL_FONT = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols2", sans-serif';

const fallbackSvgCache: Record<string, HTMLImageElement> = {};

function getFallbackSvgImage(symbol: string, cellSize: number): HTMLImageElement | null {
  const cacheKey = `${symbol}_${cellSize}`;
  if (fallbackSvgCache[cacheKey]?.complete) {
    return fallbackSvgCache[cacheKey];
  }

  const fontSize = Math.round(cellSize * 0.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellSize}" height="${cellSize}" viewBox="0 0 ${cellSize} ${cellSize}">
    <text x="${cellSize / 2}" y="${cellSize / 2}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="${SYMBOL_FONT}" fill="${SYMBOL_TEXT_DARK}">${escapeXml(symbol)}</text>
  </svg>`;

  const img = new Image();
  img.onload = () => {
    fallbackSvgCache[cacheKey] = img;
  };
  img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return null;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 调整 hex 颜色亮度，amount 正值变亮、负值变暗 */
function adjustColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(c.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(c.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(c.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const ROW_NUMBER_WIDTH = 28;
const COL_NUMBER_HEIGHT = 20;
const COL_NUMBER_BOTTOM_HEIGHT = 20;

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridCell[][],
  cellSize: number,
  offsetX: number,
  offsetY: number,
  showGridLines: boolean = true,
  rowStart: number = 1,
  colStart: number = 1,
  gridLineColor?: string
) {
  if (!grid || grid.length === 0) return;

  // 根据自定义网格线颜色计算粗线和外框线颜色
  const lineNormal = gridLineColor || GRID_LINE_NORMAL;
  const lineBold = gridLineColor ? adjustColor(gridLineColor, -40) : GRID_LINE_BOLD;
  const lineOuter = gridLineColor ? adjustColor(gridLineColor, -120) : GRID_LINE_OUTER;

  const rows = grid.length;
  const cols = grid[0].length;
  const gridWidth = cols * cellSize;

  // ── Render Stats: 预统计所有 Cell 类型 ──
  let statTotal = 0, statHole = 0, statEmptyGrid = 0, statPattern = 0;
  let statVisible = 0, statInactive = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c]; statTotal++;
      const rt: string | undefined = cell._regionType;
      if (cell.active === false) { statInactive++; continue; }
      statVisible++;
      if (rt === 'Hole') { statHole++; }
      else if (rt === 'EmptyGrid') { statEmptyGrid++; }
      else { statPattern++; }
    }
  }

  console.log('%c╔══════════════════════════════════════╗', 'color:#8b5cf6;font-weight:bold');
  console.log('%c║       Render Stats (渲染前)          ║', 'color:#8b5cf6;font-weight:bold');
  console.log('%c╠══════════════════════════════════════╣', 'color:#8b5cf6');
  console.log(`║  Total Cells:     ${String(statTotal).padStart(6)}                  ║`);
  console.log(`║  Visible(active): ${String(statVisible).padStart(6)}  Inactive: ${String(statInactive).padStart(5)}     ║`);
  console.log(`║  Hole (白):       ${String(statHole).padStart(6)}  emptyType=inner    ║`);
  console.log(`║  EmptyGrid (灰):   ${String(statEmptyGrid).padStart(6)}  emptyType=outer    ║`);
  console.log(`║  Pattern (绿):     ${String(statPattern).padStart(6)}  ⚠️ 应为0!         ║`);
  if (statPattern > 0) {
    console.log('%c║  ⚠️ 检测到 Pattern Cell! 可能导致异常渲染   ║', 'color:#ef4444');
  }
  if (statVisible === 0) {
    console.log('%c║  ⚠️ Visible=0! 所有Cell被过滤 → 空白画布! ║', 'color:#ef4444;font-weight:bold');
  }
  console.log('%c╚══════════════════════════════════════╝', 'color:#8b5cf6');

  // ════════════════════════════════════════════
  // Render前验证：EmptyGrid + Symbol 清除
  //
  // 问题：detectSymbols 将符号赋给了大量 EmptyGrid 格子
  //        （1186个 vs 真实~45个），导致空白格显示针法符号
  //
  // 规则：EmptyGrid（emptyType='outer'）不允许渲染任何符号
  //       只有 regionType='DetectedSymbol' 的格子才允许保留符号
  // ════════════════════════════════════════════
  let emptyGridWithSymbolCount = 0;
  const emptyGridWithSymbolSamples: Array<{row: number; col: number; symbol: string; emptyType: string; regionType: string}> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.emptyType === 'outer' && cell.symbol) {
        emptyGridWithSymbolCount++;
        if (emptyGridWithSymbolSamples.length < 50) {
          emptyGridWithSymbolSamples.push({
            row: r,
            col: c,
            symbol: cell.symbol,
            emptyType: cell.emptyType || 'undefined',
            regionType: (cell as any)._regionType || 'unknown',
          });
        }
        // 强制清除：EmptyGrid 不允许有符号
        cell.symbol = undefined;
      }
    }
  }

  console.log('%c╔══════════════════════════════════════╗', 'color:#ef4444;font-weight:bold');
  console.log('%c║  EmptyGrid+Symbol 强制清除报告        ║', 'color:#ef4444;font-weight:bold');
  console.log('%c╠══════════════════════════════════════╣', 'color:#ef4444');
  console.log(`║  EmptyGrid+Symbol 数量: ${String(emptyGridWithSymbolCount).padStart(6)}              ║`);
  console.log(`║  已全部清除 (symbol=null)               ║`);

  if (emptyGridWithSymbolSamples.length > 0) {
    console.log('%c║  前50个样本:                            ║', 'color:#f59e0b');
    emptyGridWithSymbolSamples.forEach(s => {
      console.log(`║  [${String(s.row).padStart(2)},${String(s.col).padStart(2)}] sym="${s.symbol}" emptyType=${s.emptyType} regionType=${s.regionType}`);
    });
  }

  if (emptyGridWithSymbolCount > 0) {
    console.log('%c║  ⚠️ 以上${emptyGridWithSymbolCount}个格子的符号已被强制清除     ║', 'color:#22c55e');
  } else {
    console.log('%c║  ✅ 无 EmptyGrid+Symbol，无需清除         ║', 'color:#22c55e');
  }
  console.log('%c╚══════════════════════════════════════╝', 'color:#ef4444');

  // 运行时计数：实际渲染的格子
  let renderedBgCount = 0, skippedInactive = 0, skippedInner = 0;
  const gridHeight = rows * cellSize;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  ctx.fillStyle = PATTERN_WHITE;
  ctx.fillRect(-ROW_NUMBER_WIDTH, -COL_NUMBER_HEIGHT, gridWidth + ROW_NUMBER_WIDTH * 2, gridHeight + COL_NUMBER_HEIGHT + COL_NUMBER_BOTTOM_HEIGHT);

  console.log('=== 渲染调试 ===');
  console.log(`网格尺寸: ${rows} x ${cols}, 单元格大小: ${cellSize}`);

  // Step 1: Build a coverage map - which cells are covered by spanning symbols
  const coveredCells = new Set<string>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      if (cell.symbol) {
        const rowSpan = cell.symbolRowSpan || 1;
        const colSpan = cell.symbolColSpan || 1;
        if (rowSpan > 1 || colSpan > 1) {
          for (let dr = 0; dr < rowSpan; dr++) {
            for (let dc = 0; dc < colSpan; dc++) {
              if (dr === 0 && dc === 0) continue;
              const tr = row + dr;
              const tc = col + dc;
              if (tr < rows && tc < cols) {
                coveredCells.add(`${tr},${tc}`);
              }
            }
          }
        }
      }
    }
  }

  // Step 2: Render cell backgrounds
  for (let row = 0; row < rows; row++) {
    const visualY = row * cellSize;
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const x = col * cellSize;
      const y = visualY;

      if (row < 2 && col < 3) {
        console.log(`渲染格子[${row},${col}]: color=${cell.color}, active=${cell.active !== false}`);
      }

      // Rule 15: 负空间(NEGATIVE_SPACE)格子不渲染背景 — 保持透明
      if (cell.active === false) { skippedInactive++; continue; }

      // INNER_HOLE: 封闭空白区域，保持纯白，不填充背景色
      if (cell.emptyType === 'inner') {
        skippedInner++;
        continue;
      }

      ctx.fillStyle = cell.color;
      ctx.fillRect(x, y, cellSize, cellSize);
      renderedBgCount++;
    }
  }

  // ── Render Stats: 渲染后汇总 ──
  console.log(`[Render] 实际渲染: BgFill=${renderedBgCount}, SkipInactive=${skippedInactive}, SkipInner=${skippedInner}`);

  // Step 3: Render symbols — 只渲染 regionType='DetectedSymbol' 的格子
  let renderedSymbolCount = 0, skippedEmptyGridSymbol = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      if (!cell.symbol) continue;
      if (coveredCells.has(`${row},${col}`)) continue; // Skip covered cells

      // 防御：EmptyGrid 不允许渲染符号（即使前面已清除，这里再加一道防线）
      if (cell.emptyType === 'outer') {
        skippedEmptyGridSymbol++;
        continue;
      }

      // 只有 DetectedSymbol 类型才允许渲染符号
      const regionType: string | undefined = cell._regionType;
      if (regionType && regionType !== 'DetectedSymbol' && regionType !== 'Pattern') {
        skippedEmptyGridSymbol++;
        continue;
      }

      const x = col * cellSize;
      const y = row * cellSize;
      const rowSpan = cell.symbolRowSpan || 1;
      const colSpan = cell.symbolColSpan || 1;
      const symbolWidth = colSpan * cellSize;
      const symbolHeight = rowSpan * cellSize;

      const img = getSymbolImage(cell.symbol);
      if (img && img.complete && img.naturalWidth > 0) {
        if (rowSpan > 1 || colSpan > 1) {
          // 跨格符号：拉伸图片填满整个区域（保留少量内边距）
          const padding = cellSize * 0.08;
          ctx.drawImage(img, x + padding, y + padding, symbolWidth - padding * 2, symbolHeight - padding * 2);
        } else {
          // 单格符号：保持原比例居中
          const scale = Math.min(symbolWidth * 0.75 / img.width, symbolHeight * 0.75 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const dx = x + (symbolWidth - w) / 2;
          const dy = y + (symbolHeight - h) / 2;
          ctx.drawImage(img, dx, dy, w, h);
        }
      } else {
        const fallbackImg = getFallbackSvgImage(cell.symbol, Math.max(symbolWidth, symbolHeight));
        if (fallbackImg && fallbackImg.complete) {
          if (rowSpan > 1 || colSpan > 1) {
            const padding = cellSize * 0.08;
            ctx.drawImage(fallbackImg, x + padding, y + padding, symbolWidth - padding * 2, symbolHeight - padding * 2);
          } else {
            ctx.drawImage(fallbackImg, x, y, symbolWidth, symbolHeight);
          }
        } else {
          ctx.fillStyle = getContrastColor(cell.color);
          ctx.font = `bold ${Math.min(symbolWidth, symbolHeight) * 0.55}px ${SYMBOL_FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.symbol, x + symbolWidth / 2, y + symbolHeight / 2);
        }
      }

      renderedSymbolCount++;
    }
  }

  // Step 3.5: Render numbers — 在符号之上、网格线之下渲染用户输入的数字
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      if (!cell.number) continue;
      if (cell.active === false) continue;

      const x = col * cellSize;
      const y = row * cellSize;

      ctx.fillStyle = getContrastColor(cell.color);
      ctx.font = `bold ${cellSize * 0.5}px ${SYMBOL_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.number, x + cellSize / 2, y + cellSize / 2);
    }
  }

  // ── Symbol Render Stats ──
  console.log('%c╔══════════════════════════════════════╗', 'color:#22c55e;font-weight:bold');
  console.log('%c║       Symbol Render 统计              ║', 'color:#22c55e;font-weight:bold');
  console.log('%c╠══════════════════════════════════════╣', 'color:#22c55e');
  console.log(`║  实际渲染符号:        ${String(renderedSymbolCount).padStart(6)}                ║`);
  console.log(`║  跳过EmptyGrid符号:   ${String(skippedEmptyGridSymbol).padStart(6)}                ║`);
  console.log('%c╚══════════════════════════════════════╝', 'color:#22c55e');

  if (showGridLines) {
    // 水平网格线 — 跳过 INNER_HOLE 区域的线段
    for (let row = 0; row <= rows; row++) {
      const isBold = row % 5 === 0;
      ctx.strokeStyle = isBold ? lineBold : lineNormal;
      ctx.lineWidth = isBold ? 1.0 : 0.3;

      const y = row * cellSize;
      let drawing = false;
      let segStart = 0;

      for (let col = 0; col <= cols; col++) {
        // 判断当前列位置是否可以画线（两侧格子均非 inner hole）
        const canDraw = (() => {
          if (col === 0 || col === cols) return true; // 边缘线始终画
          const cellAbove = row > 0 ? grid[row - 1][col - 1] : null;
          const cellBelow = row < rows ? grid[row][col - 1] : null;
          if (!cellAbove || !cellBelow) return true;
          // 如果任一侧是 inner hole，跳过此段
          if (cellAbove.emptyType === 'inner' || cellBelow.emptyType === 'inner') return false;
          return true;
        })();

        if (canDraw && !drawing) {
          segStart = col * cellSize;
          drawing = true;
        } else if (!canDraw && drawing) {
          ctx.beginPath();
          ctx.moveTo(segStart, y);
          ctx.lineTo(col * cellSize, y);
          ctx.stroke();
          drawing = false;
        }
      }
      // 收尾：如果还在画，画到末尾
      if (drawing) {
        ctx.beginPath();
        ctx.moveTo(segStart, y);
        ctx.lineTo(gridWidth, y);
        ctx.stroke();
      }
    }

    // 垂直网格线 — 跳过 INNER_HOLE 区域的线段
    for (let col = 0; col <= cols; col++) {
      const isBold = col % 5 === 0;
      ctx.strokeStyle = isBold ? lineBold : lineNormal;
      ctx.lineWidth = isBold ? 1.0 : 0.3;

      const x = col * cellSize;
      let drawing = false;
      let segStart = 0;

      for (let row = 0; row <= rows; row++) {
        const canDraw = (() => {
          if (row === 0 || row === rows) return true;
          const cellLeft = col > 0 ? grid[row - 1][col - 1] : null;
          const cellRight = col < cols ? grid[row - 1][col] : null;
          if (!cellLeft || !cellRight) return true;
          if (cellLeft.emptyType === 'inner' || cellRight.emptyType === 'inner') return false;
          return true;
        })();

        if (canDraw && !drawing) {
          segStart = row * cellSize;
          drawing = true;
        } else if (!canDraw && drawing) {
          ctx.beginPath();
          ctx.moveTo(x, segStart);
          ctx.lineTo(x, row * cellSize);
          ctx.stroke();
          drawing = false;
        }
      }
      if (drawing) {
        ctx.beginPath();
        ctx.moveTo(x, segStart);
        ctx.lineTo(x, gridHeight);
        ctx.stroke();
      }
    }
  }

  ctx.strokeStyle = lineOuter;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, gridWidth, gridHeight);

  ctx.font = `bold ${Math.min(11, cellSize * 0.5)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = LABEL_TEXT;
  ctx.textBaseline = 'middle';

  for (let row = 0; row < rows; row++) {
    const displayRow = rowStart + (rows - 1 - row);
    const y = row * cellSize + cellSize / 2;

    if (displayRow % 2 === 1) {
      ctx.textAlign = 'left';
      ctx.fillText(String(displayRow), gridWidth + 5, y);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(String(displayRow), -5, y);
    }
  }

  // Column labels - top: right-to-left (rightmost = smallest)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let col = 0; col < cols; col++) {
    const displayCol = colStart + (cols - 1 - col);
    const x = col * cellSize + cellSize / 2;
    if (displayCol % 5 === 0 || col === 0 || col === cols - 1) {
      ctx.fillText(String(displayCol), x, -4);
    }
  }

  // Column labels - bottom: right-to-left (rightmost = smallest)
  ctx.textBaseline = 'top';
  for (let col = 0; col < cols; col++) {
    const displayCol = colStart + (cols - 1 - col);
    const x = col * cellSize + cellSize / 2;
    if (displayCol % 5 === 0 || col === 0 || col === cols - 1) {
      ctx.fillText(String(displayCol), x, gridHeight + 4);
    }
  }

  ctx.restore();
}

export function getChartDimensions(grid: GridCell[][], cellSize: number) {
  if (!grid || grid.length === 0) return { width: 0, height: 0 };
  const rows = grid.length;
  const cols = grid[0].length;
  return {
    width: cols * cellSize + ROW_NUMBER_WIDTH * 2,
    height: rows * cellSize + COL_NUMBER_HEIGHT + COL_NUMBER_BOTTOM_HEIGHT
  };
}

export function getGridOrigin() {
  return { x: ROW_NUMBER_WIDTH, y: COL_NUMBER_HEIGHT };
}

export function getContrastColor(hexColor: string): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? SYMBOL_TEXT_DARK : SYMBOL_TEXT_LIGHT;
}

type PickResult =
  | { status: 'ok'; handle: FileSystemFileHandle }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

/** 尝试通过 showSaveFilePicker 获取文件句柄（必须在用户手势中同步调用） */
async function pickSaveFile(filename: string, description: string, mimeType: string, ext: string): Promise<PickResult> {
  try {
    // showSaveFilePicker 需要安全上下文（HTTPS 或 localhost）
    if (!window.isSecureContext || !('showSaveFilePicker' in window)) {
      return { status: 'unavailable' };
    }
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description, accept: { [mimeType]: [ext] } }],
    });
    return { status: 'ok', handle };
  } catch (e: any) {
    if (e.name === 'AbortError') return { status: 'cancelled' };
    console.warn('showSaveFilePicker failed:', e.message);
    return { status: 'unavailable' };
  }
}

/** 将 Blob 写入文件句柄 */
async function writeToFileHandle(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** 在新标签页打开 Blob，供用户右键另存为 */
function openInNewTab(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // 弹窗被拦截，回退到直接下载
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}

/** 直接下载 Blob */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportChartAsPNG(
  grid: GridCell[][],
  cellSize: number,
  filename: string = 'knitting-chart.png',
  rowStart: number = 1,
  colStart: number = 1,
  chooseLocation: boolean = false,
  gridLineColor?: string
) {
  if (!grid || grid.length === 0) return;

  // 关键：在用户手势上下文中立即获取文件句柄，避免异步操作后手势失效
  const pickPromise = chooseLocation
    ? pickSaveFile(filename, 'PNG Image', 'image/png', '.png')
    : Promise.resolve<PickResult>({ status: 'unavailable' });

  const dims = getChartDimensions(grid, cellSize);
  const origin = getGridOrigin();

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PATTERN_WHITE;
  ctx.fillRect(0, 0, dims.width, dims.height);
  renderGrid(ctx, grid, cellSize, origin.x, origin.y, true, rowStart, colStart, gridLineColor);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;

  const pick = await pickPromise;
  if (pick.status === 'ok') {
    await writeToFileHandle(pick.handle, blob);
  } else if (pick.status === 'cancelled') {
    return; // 用户取消，不做任何操作
  } else if (chooseLocation) {
    openInNewTab(blob, filename); // API 不可用，在新标签页打开供右键另存为
  } else {
    downloadBlob(blob, filename);
  }
}

export async function exportChartAsSVG(
  grid: GridCell[][],
  cellSize: number,
  filename: string = 'knitting-chart.svg',
  rowStart: number = 1,
  colStart: number = 1,
  chooseLocation: boolean = false,
  gridLineColor?: string
) {
  if (!grid || grid.length === 0) return;

  // 关键：在用户手势上下文中立即获取文件句柄
  const pickPromise = chooseLocation
    ? pickSaveFile(filename, 'SVG Image', 'image/svg+xml', '.svg')
    : Promise.resolve<PickResult>({ status: 'unavailable' });

  const rows = grid.length;
  const cols = grid[0].length;
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;

  const padLeft = ROW_NUMBER_WIDTH;
  const padTop = COL_NUMBER_HEIGHT;
  const totalWidth = gridWidth + ROW_NUMBER_WIDTH * 2;
  const totalHeight = gridHeight + COL_NUMBER_HEIGHT + COL_NUMBER_BOTTOM_HEIGHT;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`;
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="white"/>`;

  svg += `<g transform="translate(${padLeft}, ${padTop})">`;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      const x = col * cellSize;
      const y = row * cellSize;
      const isBoldRow = row % 5 === 0;
      const isBoldCol = col % 5 === 0;
      const sw = (isBoldRow || isBoldCol) ? 0.8 : 0.5;
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${cell.color}" stroke="${CELL_BORDER}" stroke-width="${sw}"/>`;

      if (cell.symbol) {
        svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2}" text-anchor="middle" dominant-baseline="middle" font-size="${cellSize*0.55}" fill="${getContrastColor(cell.color)}">${cell.symbol}</text>`;
      }
      if (cell.number) {
        svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2}" text-anchor="middle" dominant-baseline="middle" font-size="${cellSize*0.5}" font-weight="bold" fill="${getContrastColor(cell.color)}">${cell.number}</text>`;
      }
    }
  }

  svg += `<rect x="0" y="0" width="${gridWidth}" height="${gridHeight}" fill="none" stroke="${gridLineColor ? adjustColor(gridLineColor, -120) : GRID_LINE_OUTER}" stroke-width="2"/>`;

  const fontSize = Math.min(11, cellSize * 0.5);
  for (let row = 0; row < rows; row++) {
    const displayRow = rowStart + (rows - 1 - row);
    const y = row * cellSize + cellSize / 2;
    if (displayRow % 2 === 1) {
      svg += `<text x="${gridWidth + 5}" y="${y}" text-anchor="start" dominant-baseline="middle" font-size="${fontSize}" font-weight="bold" fill="${LABEL_TEXT}">${displayRow}</text>`;
    } else {
      svg += `<text x="-5}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="${fontSize}" font-weight="bold" fill="${LABEL_TEXT}">${displayRow}</text>`;
    }
  }

  // Column labels - top: right-to-left
  for (let col = 0; col < cols; col++) {
    const displayCol = colStart + (cols - 1 - col);
    const x = col * cellSize + cellSize / 2;
    if (displayCol % 5 === 0 || col === 0 || col === cols - 1) {
      svg += `<text x="${x}" y="-4" text-anchor="middle" dominant-baseline="auto" font-size="${fontSize}" font-weight="bold" fill="${LABEL_TEXT}">${displayCol}</text>`;
    }
  }

  // Column labels - bottom: right-to-left
  for (let col = 0; col < cols; col++) {
    const displayCol = colStart + (cols - 1 - col);
    const x = col * cellSize + cellSize / 2;
    if (displayCol % 5 === 0 || col === 0 || col === cols - 1) {
      svg += `<text x="${x}" y="${gridHeight + 4}" text-anchor="middle" dominant-baseline="hanging" font-size="${fontSize}" font-weight="bold" fill="${LABEL_TEXT}">${displayCol}</text>`;
    }
  }

  svg += `</g></svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });

  const pick = await pickPromise;
  if (pick.status === 'ok') {
    await writeToFileHandle(pick.handle, blob);
  } else if (pick.status === 'cancelled') {
    return; // 用户取消，不做任何操作
  } else if (chooseLocation) {
    openInNewTab(blob, filename); // API 不可用，在新标签页打开供右键另存为
  } else {
    downloadBlob(blob, filename);
  }
}

export async function exportChartAsExcel(
  grid: GridCell[][],
  filename: string = 'knitting-chart.xls',
  rowStart: number = 1,
  colStart: number = 1,
  chooseLocation: boolean = false
) {
  if (!grid || grid.length === 0) return;

  // 关键：在用户手势上下文中立即获取文件句柄
  const pickPromise = chooseLocation
    ? pickSaveFile(filename, 'Excel File', 'application/vnd.ms-excel', '.xls')
    : Promise.resolve<PickResult>({ status: 'unavailable' });

  const rows = grid.length;
  const cols = grid[0].length;

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<style>
  td, th { border: 1px solid ${CELL_BORDER}; padding: 4px 8px; text-align: center; font-size: 12px; }
  th { background: ${TABLE_HEADER_BG}; font-weight: bold; }
  .sheet-title { font-size: 14px; font-weight: bold; padding: 8px 0; background: ${SHEET_TITLE_BG}; color: ${SHEET_TITLE_TEXT}; text-align: center; }
  .color-cell { font-family: monospace; font-size: 11px; }
</style>
</head><body>`;

  html += `<table cellpadding="0" cellspacing="0" border="1">`;
  html += `<tr><td colspan="${cols + 1}" class="sheet-title">符号表 (Symbol Chart)</td></tr>`;
  html += `<tr><th>&nbsp;</th>`;
  for (let c = 0; c < cols; c++) {
    html += `<th>${colStart + (cols - 1 - c)}</th>`;
  }
  html += `</tr>`;
  for (let r = 0; r < rows; r++) {
    html += `<tr><th>${rowStart + (rows - 1 - r)}</th>`;
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const symbol = cell.symbol || '';
      const number = cell.number || '';
      const label = number || symbol;
      html += `<td>${escapeHtml(label)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</table>`;

  html += `<br/>`;

  html += `<table cellpadding="0" cellspacing="0" border="1">`;
  html += `<tr><td colspan="${cols + 1}" class="sheet-title">颜色表 (Color Chart)</td></tr>`;
  html += `<tr><th>&nbsp;</th>`;
  for (let c = 0; c < cols; c++) {
    html += `<th>${colStart + (cols - 1 - c)}</th>`;
  }
  html += `</tr>`;
  for (let r = 0; r < rows; r++) {
    html += `<tr><th>${rowStart + (rows - 1 - r)}</th>`;
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      const color = cell.color || PATTERN_WHITE;
      html += `<td class="color-cell" style="background-color:${color};">${color}</td>`;
    }
    html += `</tr>`;
  }
  html += `</table>`;

  html += `<br/>`;

  const legends: [string, string, string][] = [
    ['符号', '名称', '说明'],
    ['●', '短针', 'sc / X'],
    ['○', '长针/挂针', 'dc / YO'],
    ['◎', '长长针', 'trc'],
    ['△', '减针', 'dec / V'],
    ['▽', '加针', 'inc / A'],
    ['|', '下针(正针)', 'K / knit'],
    ['-', '上针(反针)', 'P / purl'],
    ['Q', '扭针', 'twist / k1b'],
    ['Q̲', '扭针(上针)', 'twist purl / p1b'],
    ['＼', '左上2并1', 'k2tog'],
    ['／', '右上2并1', 'ssk'],
    ['❖', '麻花针', 'cable'],
    ['╳', '镂空针', 'eyelet'],
  ];

  html += `<table cellpadding="0" cellspacing="0" border="1">`;
  html += `<tr><td colspan="3" class="sheet-title">图例 (Legend)</td></tr>`;
  for (const [sym, name, desc] of legends) {
    html += `<tr><td>${escapeHtml(sym)}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(desc)}</td></tr>`;
  }
  html += `</table>`;

  html += `</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });

  const pick = await pickPromise;
  if (pick.status === 'ok') {
    await writeToFileHandle(pick.handle, blob);
  } else if (pick.status === 'cancelled') {
    return; // 用户取消，不做任何操作
  } else if (chooseLocation) {
    openInNewTab(blob, filename); // API 不可用，在新标签页打开供右键另存为
  } else {
    downloadBlob(blob, filename);
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
