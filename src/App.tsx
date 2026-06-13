import { useState, useCallback, useRef, useEffect } from 'react';
import ChartCanvas from './components/ChartCanvas';
import ColorPalette from './components/ColorPalette';
import LegendPanel from './components/LegendPanel';
import Toolbar from './components/Toolbar';
import ProcessingOverlay from './components/ProcessingOverlay';
import ExportDialog from './components/ExportDialog';
import type { GridCell, ExtractedColor, ToolMode, KnittingChart, SelectionRange, ClipboardData } from './types';
import { processImage, gridMatrixToChart, validateMatrixAgainstImage, getImageData, loadImage } from './utils/imageProcessing';
import { exportChartAsPNG, exportChartAsSVG, exportChartAsExcel } from './utils/chartRenderer';
import { saveProject, openProject } from './utils/chartStorage';

import { GRID_BACKGROUND } from './utils/colorConstants';

export default function App() {
  const [chart, setChart] = useState<KnittingChart | null>(null);
  const [extractedColors, setExtractedColors] = useState<ExtractedColor[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>('pan');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>(undefined);
  const [symbolRowSpan, setSymbolRowSpan] = useState(1);
  const [symbolColSpan, setSymbolColSpan] = useState(1);
  const [cellSize, setCellSize] = useState(20);
  const [gridCols, setGridCols] = useState(50);
  const [gridRows, setGridRows] = useState(50);
  const [maxColors, setMaxColors] = useState(16);
  const [enableSymbolDetection, setEnableSymbolDetection] = useState(true);
  const [symbolMode, setSymbolMode] = useState<'all' | 'knitting' | 'crochet'>('knitting');
  const [imageTypeMode, setImageTypeMode] = useState<'auto' | 'color_pattern' | 'structure' | 'cross_stitch' | 'pixel_art'>('auto');
  const [rowStart, setRowStart] = useState(1);
  const [colStart, setColStart] = useState(1);
  const [gridLineColor, setGridLineColor] = useState('#000000');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [symbolCount, setSymbolCount] = useState(0);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [needsReprocess, setNeedsReprocess] = useState(false);
  const [userSetGridSize, setUserSetGridSize] = useState(false);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ════════════════════════════════════
  // ★ 撤销/重做历史栈 ★
  // ════════════════════════════════════
  const MAX_HISTORY = 50;
  const historyRef = useRef<KnittingChart[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false); // 防止 undo/redo 操作自身入栈
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // 深拷贝 chart（cells 是二维数组，需要逐行拷贝）
  const deepCloneChart = useCallback((c: KnittingChart): KnittingChart => ({
    ...c,
    cells: c.cells.map(row => row.map(cell => ({ ...cell }))),
    colors: [...c.colors],
  }), []);

  // 将当前状态推入历史栈（在修改前调用）
  const pushHistory = useCallback(() => {
    if (!chart || isUndoRedoRef.current) return;
    const snap = deepCloneChart(chart);
    // 截断当前位置之后的历史
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
    updateUndoRedoState();
  }, [chart, deepCloneChart, updateUndoRedoState]);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    isUndoRedoRef.current = true;
    setChart(deepCloneChart(historyRef.current[historyIndexRef.current]));
    isUndoRedoRef.current = false;
    updateUndoRedoState();
  }, [deepCloneChart, updateUndoRedoState]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    isUndoRedoRef.current = true;
    setChart(deepCloneChart(historyRef.current[historyIndexRef.current]));
    isUndoRedoRef.current = false;
    updateUndoRedoState();
  }, [deepCloneChart, updateUndoRedoState]);

  const runProcess = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProcessingStage('准备处理...');
    setProcessingProgress(0);

    try {
      const result = await processImage(
        file,
        Math.min(gridCols, 200),
        Math.min(gridRows, 200),
        maxColors,
        enableSymbolDetection,
        !userSetGridSize,
        symbolMode,
        imageTypeMode,
        (stage, percent) => {
          setProcessingStage(stage);
          setProcessingProgress(percent);
        }
      );

      setExtractedColors(result.extractedColors);
      if (result.extractedColors.length > 0) {
        setSelectedColor(result.extractedColors[0].hex);
      }

      // ══════════════════════════════════════
      // 网格数据 → Chart 对象
      //
      // ⚠️ 结构图模式必须使用 result.grid（原始 GridCell[][]）
      //    因为 processStructurePattern 已设置 active/emptyType/_regionType
      //    若走 gridMatrixToChart() 重建，会丢失这些字段 → 全部 active=undefined → 空白画布!
      // ══════════════════════════════════════
      const isStruct = result.imageTypeResult?.type === 'STRUCTURE_PATTERN';

      if (result.gridMatrixOutput && !isStruct) {
        // 彩色模式：通过 matrix 重建网格（标准流程）
        console.log('=== 网格矩阵 JSON 输出 ===');
        console.log(JSON.stringify(result.gridMatrixOutput, null, 2));

        const chartFromMatrix = gridMatrixToChart(result.gridMatrixOutput);
        setChart(chartFromMatrix);
        setGridCols(chartFromMatrix.cols);
        setGridRows(chartFromMatrix.rows);

        const img = await loadImage(file);
        const imgData = getImageData(img);
        const validation = validateMatrixAgainstImage(imgData, result.gridMatrixOutput);

        console.log('=== 图像对比验证结果 ===');
        console.log(`色块误差率: ${validation.colorBlockErrorRate}%`);
        console.log(`轮廓误差率: ${validation.contourErrorRate}%`);
        console.log(`宽高比例误差率: ${validation.aspectRatioErrorRate}%`);
        console.log(`丢失色块数量: ${validation.missingBlocks}`);
        console.log(`多余色块数量: ${validation.extraBlocks}`);

        if (validation.exceedsThreshold) {
          console.log('⚠️ 误差超过1%，需要修正的坐标列表:');
          console.log(JSON.stringify(validation.errors.map(e => ({ x: e.x, y: e.y })), null, 2));
        } else {
          console.log('✅ 误差在可接受范围内');
        }
      } else {
        // 结构图模式：直接使用 result.grid（保留 active/emptyType/_regionType）
        const detectedRows = result.grid.length;
        const detectedCols = result.grid[0]?.length || 0;

        if (isStruct) {
          console.log('[结构图] 使用原始 grid（保留分类字段），跳过 gridMatrixToChart');
        }

        setChart({
          rows: detectedRows,
          cols: detectedCols,
          cells: result.grid,
          colors: result.extractedColors.map(c => c.hex),
          cellSize: 20
        });

        if (!userSetGridSize) {
          if (result.detectedCols) setGridCols(result.detectedCols);
          if (result.detectedRows) setGridRows(result.detectedRows);
        }
      }

      setSymbolCount(result.symbols.length);
    } catch (err) {
      console.error('Failed to process image:', err);
      alert('图片处理失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }, [gridCols, gridRows, maxColors, enableSymbolDetection, symbolMode, userSetGridSize, imageTypeMode]);

  const runProcessRef = useRef(runProcess);
  useEffect(() => {
    runProcessRef.current = runProcess;
  }, [runProcess]);

  const handleMaxColorsChange = useCallback((value: number) => {
    const validValue = Math.max(0, Math.min(64, value));
    setMaxColors(validValue);
    if (fileRef.current) {
      setNeedsReprocess(true);
    }
  }, []);

  const handleReprocess = useCallback(async () => {
    const file = fileRef.current;
    if (!file) return;
    setNeedsReprocess(false);
    await runProcess(file);
  }, [runProcess]);

  const handleImageUpload = useCallback(async (file: File) => {
    fileRef.current = file;
    setOriginalImageUrl(URL.createObjectURL(file));
    setNeedsReprocess(false);
    setUserSetGridSize(false);
    await runProcess(file);
  }, [runProcess]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      fileRef.current = file;
      setOriginalImageUrl(URL.createObjectURL(file));
      setNeedsReprocess(false);
      setUserSetGridSize(false);
      runProcess(file);
    }
  }, [runProcess]);

  const handleReupload = useCallback(() => {
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    setChart(null);
    setExtractedColors([]);
    setSymbolCount(0);
    setOriginalImageUrl(null);
    setNeedsReprocess(false);
    setUserSetGridSize(false);
    fileRef.current = null;
  }, [originalImageUrl]);

  const handleReanalyze = useCallback(() => {
    if (!fileRef.current) return;
    runProcess(fileRef.current);
  }, [runProcess]);

  const handleGridChange = useCallback((newGrid: GridCell[][]) => {
    if (!chart) return;
    pushHistory();
    setChart({ ...chart, cells: newGrid });
  }, [chart, pushHistory]);

  const handleReplaceColor = useCallback((oldColor: string, newColor: string) => {
    if (!chart || oldColor === newColor) return;
    pushHistory();

    const newCells = chart.cells.map(row =>
      row.map(cell => ({
        ...cell,
        color: cell.color === oldColor ? newColor : cell.color
      }))
    );

    const newColors = chart.colors.map(c => c === oldColor ? newColor : c);

    const newExtractedColors = extractedColors.map(c =>
      c.hex === oldColor ? { ...c, hex: newColor } : c
    );

    setChart({ ...chart, cells: newCells, colors: newColors });
    setExtractedColors(newExtractedColors);
    setSelectedColor(newColor);
  }, [chart, extractedColors, pushHistory]);

  const handleExport = useCallback(async (filename: string, format: 'png' | 'svg' | 'xlsx', chooseLocation: boolean = false) => {
    if (!chart) return;
    switch (format) {
      case 'png':
        await exportChartAsPNG(chart.cells, cellSize, filename, rowStart, colStart, chooseLocation, gridLineColor);
        break;
      case 'svg':
        await exportChartAsSVG(chart.cells, cellSize, filename, rowStart, colStart, chooseLocation, gridLineColor);
        break;
      case 'xlsx':
        await exportChartAsExcel(chart.cells, filename, rowStart, colStart, chooseLocation);
        break;
    }
  }, [chart, cellSize, rowStart, colStart, gridLineColor]);

  const handleSave = useCallback(async () => {
    if (!chart) return;
    await saveProject(chart, rowStart, colStart, gridLineColor);
  }, [chart, rowStart, colStart, gridLineColor]);

  const handleOpen = useCallback(async () => {
    const project = await openProject();
    if (!project) return;
    setChart(project.chart);
    setCellSize(project.chart.cellSize);
    setGridRows(project.chart.rows);
    setGridCols(project.chart.cols);
    setRowStart(project.rowStart);
    setColStart(project.colStart);
    setGridLineColor(project.gridLineColor);
    setExtractedColors(project.chart.colors.map(hex => ({ hex, count: 0 })));
    // 重置历史
    historyRef.current = [project.chart];
    historyIndexRef.current = 0;
    isUndoRedoRef.current = false;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const handleSelectSymbol = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setToolMode('symbol');
  }, []);

  const handlePickColor = useCallback((color: string) => {
    setSelectedColor(color);
    setToolMode('pen');
  }, []);

  const handleCreateBlank = useCallback(() => {
    const r = Math.min(Math.max(gridRows, 1), 200);
    const c = Math.min(Math.max(gridCols, 1), 200);
    const cells: GridCell[][] = [];
    for (let i = 0; i < r; i++) {
      const row: GridCell[] = [];
      for (let j = 0; j < c; j++) {
        row.push({ row: i, col: j, color: GRID_BACKGROUND, symbol: undefined });
      }
      cells.push(row);
    }
    setChart({ rows: r, cols: c, cells, colors: [GRID_BACKGROUND], cellSize: 20 });
    setExtractedColors([{ hex: GRID_BACKGROUND, count: r * c }]);
    setSelectedColor('#000000');
  }, [gridRows, gridCols]);



  const handleClear = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const clearedCells = chart.cells.map(row =>
      row.map(cell => ({ ...cell, color: GRID_BACKGROUND, symbol: undefined, symbolRowSpan: undefined, symbolColSpan: undefined, number: undefined }))
    );
    setChart({ ...chart, cells: clearedCells, colors: [GRID_BACKGROUND] });
    setExtractedColors([{ hex: GRID_BACKGROUND, count: chart.rows * chart.cols }]);
    setSelectedColor('#000000');
    setSelectedSymbol(undefined);
  }, [chart, pushHistory]);

  const handleClearSymbols = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const clearedCells = chart.cells.map(row =>
      row.map(cell => ({ ...cell, symbol: undefined }))
    );
    setChart({ ...chart, cells: clearedCells });
    setSelectedSymbol(undefined);
  }, [chart, pushHistory]);

  const handleResize = useCallback((newCols: number, newRows: number) => {
    if (!chart) return;
    pushHistory();
    const c = Math.min(Math.max(newCols, 1), 200);
    const r = Math.min(Math.max(newRows, 1), 200);
    const oldCells = chart.cells;
    const newCells: GridCell[][] = [];
    for (let i = 0; i < r; i++) {
      const row: GridCell[] = [];
      for (let j = 0; j < c; j++) {
        if (i < oldCells.length && j < oldCells[0]?.length) {
          row.push({ ...oldCells[i][j] });
        } else {
          row.push({ row: i, col: j, color: GRID_BACKGROUND, symbol: undefined });
        }
      }
      newCells.push(row);
    }
    setChart({ ...chart, rows: r, cols: c, cells: newCells });
  }, [chart, pushHistory]);

  const handleFlipHorizontal = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const newCells = chart.cells.map(row =>
      [...row].reverse().map((cell, i) => ({ ...cell, col: i }))
    );
    setChart({ ...chart, cells: newCells });
  }, [chart, pushHistory]);

  const handleFlipVertical = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const newCells = [...chart.cells].reverse().map((row, i) =>
      row.map(cell => ({ ...cell, row: i }))
    );
    setChart({ ...chart, cells: newCells });
  }, [chart, pushHistory]);

  const handleRotateCW = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const oldRows = chart.rows;
    const oldCols = chart.cols;
    const newCells: GridCell[][] = [];
    for (let newRow = 0; newRow < oldCols; newRow++) {
      const row: GridCell[] = [];
      for (let newCol = 0; newCol < oldRows; newCol++) {
        const oldRow = oldRows - 1 - newCol;
        const oldCol = newRow;
        const cell = chart.cells[oldRow]?.[oldCol];
        row.push(cell ? { ...cell, row: newRow, col: newCol } : { row: newRow, col: newCol, color: GRID_BACKGROUND, symbol: undefined });
      }
      newCells.push(row);
    }
    setChart({ ...chart, rows: oldCols, cols: oldRows, cells: newCells });
    setGridCols(oldCols);
    setGridRows(oldRows);
  }, [chart, pushHistory]);

  const handleRotateCCW = useCallback(() => {
    if (!chart) return;
    pushHistory();
    const oldRows = chart.rows;
    const oldCols = chart.cols;
    const newCells: GridCell[][] = [];
    for (let newRow = 0; newRow < oldCols; newRow++) {
      const row: GridCell[] = [];
      for (let newCol = 0; newCol < oldRows; newCol++) {
        const oldRow = newCol;
        const oldCol = oldCols - 1 - newRow;
        const cell = chart.cells[oldRow]?.[oldCol];
        row.push(cell ? { ...cell, row: newRow, col: newCol } : { row: newRow, col: newCol, color: GRID_BACKGROUND, symbol: undefined });
      }
      newCells.push(row);
    }
    setChart({ ...chart, rows: oldCols, cols: oldRows, cells: newCells });
    setGridCols(oldCols);
    setGridRows(oldRows);
  }, [chart, pushHistory]);

  const handleCopy = useCallback(() => {
    if (!chart || !selection) return;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    const cells: GridCell[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: GridCell[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const cell = chart.cells[r]?.[c];
        row.push(cell ? { ...cell, row: r - minRow, col: c - minCol } : { row: r - minRow, col: c - minCol, color: GRID_BACKGROUND, symbol: undefined });
      }
      cells.push(row);
    }
    setClipboard({ cells, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 });
  }, [chart, selection]);

  const handlePaste = useCallback(() => {
    if (!chart || !clipboard || !selection) return;
    pushHistory();
    const minRow = Math.min(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const newCells = chart.cells.map(r => r.map(c => ({ ...c })));
    for (let r = 0; r < clipboard.rows; r++) {
      for (let c = 0; c < clipboard.cols; c++) {
        const tr = minRow + r;
        const tc = minCol + c;
        if (tr >= 0 && tr < chart.rows && tc >= 0 && tc < chart.cols) {
          newCells[tr][tc] = {
            ...clipboard.cells[r][c],
            row: tr,
            col: tc,
          };
        }
      }
    }
    setChart({ ...chart, cells: newCells });
  }, [chart, clipboard, selection, pushHistory]);

  const handleCut = useCallback(() => {
    if (!chart || !selection) return;
    pushHistory();
    handleCopy();
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    const newCells = chart.cells.map(r => r.map(c => ({ ...c })));
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newCells[r][c] = { row: r, col: c, color: GRID_BACKGROUND, symbol: undefined };
      }
    }
    setChart({ ...chart, cells: newCells });
  }, [chart, selection, handleCopy, pushHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        handleCut();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, handleCut, handleUndo, handleRedo, handleSave, handleOpen]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <header style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }} className="px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent)' }} className="text-2xl font-bold tracking-tight">编织</span>
            <span style={{ color: 'var(--text-muted)' }} className="text-xs font-light tracking-widest">图纸工作室</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col gap-2 p-2 overflow-hidden">
        {!chart ? (
          <div className="max-w-3xl mx-auto w-full mt-16 overflow-y-auto">
            <div className="text-center mb-12">
              <h1 style={{ color: 'var(--text-primary)' }} className="text-5xl font-bold tracking-tight mb-3">
                编织图纸
              </h1>
              <h2 style={{ color: 'var(--accent)' }} className="text-5xl font-bold tracking-tight mb-6">
                工作室
              </h2>
              <p style={{ color: 'var(--text-secondary)' }} className="text-base max-w-md mx-auto leading-relaxed">
                上传编织图片自动识别颜色，或新建空白画布从零开始绘制图纸。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div
                className="group relative rounded-xl p-8 text-center cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith('image/')) {
                    fileRef.current = file;
                    setOriginalImageUrl(URL.createObjectURL(file));
                    runProcess(file);
                  }
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300"
                    style={{ background: 'var(--accent-bg)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 transition-colors duration-300" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-primary)' }} className="font-semibold text-lg tracking-tight">上传图片</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="text-sm mt-1">自动识别颜色</p>
                    <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1">支持 JPG、PNG 格式</p>
                  </div>
                </div>
              </div>

              <div
                className="group relative rounded-xl p-8 text-center cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                onClick={handleCreateBlank}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300"
                    style={{ background: 'var(--accent-bg)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 transition-colors duration-300" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-primary)' }} className="font-semibold text-lg tracking-tight">新建画布</p>
                    <p style={{ color: 'var(--text-secondary)' }} className="text-sm mt-1">从零开始绘制图纸</p>
                    <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1">{gridCols} 列 × {gridRows} 行</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <h3 style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold mb-4">画布设置</h3>
              <div className="flex items-center gap-8 justify-center flex-wrap">
                <label className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-secondary)' }} className="text-sm">列数</span>
                  <input
                    type="number"
                    value={gridCols}
                    onChange={(e) => {
                      setGridCols(Number(e.target.value));
                      if (fileRef.current) {
                        setUserSetGridSize(true);
                        setNeedsReprocess(true);
                      }
                    }}
                    className="w-20 px-2 py-1.5 rounded text-sm text-center"
                    min={1}
                    max={200}
                  />
                </label>
                <label className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-secondary)' }} className="text-sm">行数</span>
                  <input
                    type="number"
                    value={gridRows}
                    onChange={(e) => {
                      setGridRows(Number(e.target.value));
                      if (fileRef.current) {
                        setUserSetGridSize(true);
                        setNeedsReprocess(true);
                      }
                    }}
                    className="w-20 px-2 py-1.5 rounded text-sm text-center"
                    min={1}
                    max={200}
                  />
                </label>
                <label className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-secondary)' }} className="text-sm">颜色数</span>
                  <select
                    value={maxColors}
                    onChange={(e) => setMaxColors(Number(e.target.value))}
                    className="px-2 py-1.5 rounded text-sm"
                  >
                    {[0, 4, 8, 12, 16, 24, 32].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-secondary)' }} className="text-sm">图片类型</span>
                  <select
                    value={imageTypeMode}
                    onChange={(e) => { setImageTypeMode(e.target.value as typeof imageTypeMode); if (!isProcessing) handleReprocess(); }}
                    className="px-1.5 py-0.5 rounded text-sm"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  >
                    <option value="auto">自动识别（默认）</option>
                    <option value="color_pattern">彩图编织图</option>
                    <option value="structure">针织结构图</option>
                    <option value="cross_stitch">十字绣图</option>
                    <option value="pixel_art">像素画</option>
                  </select>
                </label>
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)' }} className="text-center text-xs mt-6">
              中值切割量化 · Sobel 边缘检测 · 形状特征匹配
            </p>
          </div>
        ) : (
          <>
            <Toolbar
              toolMode={toolMode}
              onToolChange={setToolMode}
              onExport={() => setExportDialogOpen(true)}
              onSave={handleSave}
              onOpen={handleOpen}
              hasChart={!!chart}
              onClear={handleClear}
              onClearSymbols={handleClearSymbols}
              onFlipHorizontal={handleFlipHorizontal}
              onFlipVertical={handleFlipVertical}
              onRotateCW={handleRotateCW}
              onRotateCCW={handleRotateCCW}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onCut={handleCut}
              onUndo={handleUndo}
              onRedo={handleRedo}
              hasSelection={!!selection}
              hasClipboard={!!clipboard}
              canUndo={canUndo}
              canRedo={canRedo}
            />

            <div className="rounded-lg px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <label className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--text-muted)' }} className="text-xs">列</span>
                  <input
                    type="number"
                    value={gridCols}
                    onChange={(e) => {
                      const v = Math.min(Math.max(Number(e.target.value), 1), 200);
                      setGridCols(v);
                      if (fileRef.current) {
                        setUserSetGridSize(true);
                        setNeedsReprocess(true);
                      } else {
                        handleResize(v, gridRows);
                      }
                    }}
                    className="w-14 px-1.5 py-0.5 rounded text-sm text-center"
                    min={1}
                    max={200}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--text-muted)' }} className="text-xs">行</span>
                  <input
                    type="number"
                    value={gridRows}
                    onChange={(e) => {
                      const v = Math.min(Math.max(Number(e.target.value), 1), 200);
                      setGridRows(v);
                      if (fileRef.current) {
                        setUserSetGridSize(true);
                        setNeedsReprocess(true);
                      } else {
                        handleResize(gridCols, v);
                      }
                    }}
                    className="w-14 px-1.5 py-0.5 rounded text-sm text-center"
                    min={1}
                    max={200}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--text-muted)' }} className="text-xs">颜色</span>
                  <input
                    type="number"
                    value={maxColors}
                    onChange={(e) => handleMaxColorsChange(Number(e.target.value))}
                    className="w-14 px-1.5 py-0.5 rounded text-sm text-center"
                    min={0}
                    max={64}
                  />
                  <span className="text-xs">种</span>
                </label>
                {enableSymbolDetection && (
                  <span>符号 <strong style={{ color: 'var(--text-primary)' }}>{symbolCount}</strong> 个</span>
                )}
                {selectedSymbol && toolMode === 'symbol' && (
                  <span className="font-bold px-2 py-0.5 rounded text-xs" style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}>
                    {selectedSymbol}
                  </span>
                )}
                <div className="flex items-center gap-3 pl-4" style={{ borderLeft: '1px solid var(--border-color)' }}>
                  <label className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">行号起始</span>
                    <input
                      type="number"
                      value={rowStart}
                      onChange={(e) => setRowStart(Math.max(0, Number(e.target.value)))}
                      className="w-14 px-1.5 py-0.5 rounded text-sm text-center"
                      min={0}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">列号起始</span>
                    <input
                      type="number"
                      value={colStart}
                      onChange={(e) => setColStart(Math.max(0, Number(e.target.value)))}
                      className="w-14 px-1.5 py-0.5 rounded text-sm text-center"
                      min={0}
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">网格线</span>
                    <input
                      type="color"
                      value={gridLineColor}
                      onChange={(e) => setGridLineColor(e.target.value)}
                      className="w-7 h-6 rounded cursor-pointer border-0 p-0"
                      style={{ background: 'transparent' }}
                    />
                  </label>
                  <div className="flex items-center gap-1 pl-3" style={{ borderLeft: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => setCellSize(Math.max(10, cellSize - 4))}
                      className="p-1 rounded transition-colors duration-200"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6" />
                      </svg>
                    </button>
                    <span className="text-xs w-10 text-center" style={{ color: 'var(--text-muted)' }}>{cellSize}px</span>
                    <button
                      onClick={() => setCellSize(Math.min(64, cellSize + 4))}
                      className="p-1 rounded transition-colors duration-200"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6M11 8v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                {toolMode === 'symbol' && (
                  <div className="flex items-center gap-2 pl-4" style={{ borderLeft: '1px solid var(--border-color)' }}>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: 'var(--accent)', background: 'var(--accent-bg)' }}>符号</span>
                    <label className="flex items-center gap-1">
                      <span style={{ color: 'var(--text-muted)' }} className="text-xs">行</span>
                      <select
                        value={symbolRowSpan}
                        onChange={e => setSymbolRowSpan(Number(e.target.value))}
                        className="w-12 px-1 py-0.5 rounded text-center text-xs"
                        style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-dim)', color: 'var(--text-primary)' }}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <span style={{ color: 'var(--text-muted)' }} className="text-xs">×</span>
                    <label className="flex items-center gap-1">
                      <span style={{ color: 'var(--text-muted)' }} className="text-xs">列</span>
                      <select
                        value={symbolColSpan}
                        onChange={e => setSymbolColSpan(Number(e.target.value))}
                        className="w-12 px-1 py-0.5 rounded text-center text-xs"
                        style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-dim)', color: 'var(--text-primary)' }}
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </div>
              {originalImageUrl && (
                <button
                  onClick={handleReanalyze}
                  disabled={isProcessing}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    background: 'var(--accent)',
                    color: '#0a0a0a',
                    opacity: isProcessing ? 0.5 : 1,
                  }}
                >
                  重新分析
                </button>
              )}
            </div>

            <div className="flex-1 flex gap-2 min-h-0">
              <div className="w-56 flex flex-col gap-2 shrink-0 overflow-y-auto">
                <LegendPanel onSelectSymbol={handleSelectSymbol} />
                <ColorPalette
                  colors={extractedColors}
                  selectedColor={selectedColor}
                  onSelectColor={setSelectedColor}
                  onCustomColor={setSelectedColor}
                  onReplaceColor={handleReplaceColor}
                  grid={chart.cells}
                />

                {originalImageUrl && (
                  <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <h3 style={{ color: 'var(--text-muted)' }} className="text-xs font-semibold mb-2">原始图片</h3>
                    <img
                      src={originalImageUrl}
                      alt="原图"
                      className="w-full rounded"
                      style={{ border: '1px solid var(--border-color)' }}
                    />
                  </div>
                )}





                <button
                  onClick={handleReupload}
                  className="w-full py-2 px-4 rounded-lg text-sm transition-all duration-200"
                  style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  新建项目
                </button>
              </div>

              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <ChartCanvas
                  grid={chart.cells}
                  cellSize={cellSize}
                  toolMode={toolMode}
                  selectedColor={selectedColor}
                  selectedSymbol={selectedSymbol}
                  symbolRowSpan={symbolRowSpan}
                  symbolColSpan={symbolColSpan}
                  onGridChange={handleGridChange}
                  onPickColor={handlePickColor}
                  rowStart={rowStart}
                  colStart={colStart}
                  selection={selection}
                  onSelectionChange={setSelection}
                  clipboard={clipboard}
                  onClipboardChange={setClipboard}
                  gridLineColor={gridLineColor}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {isProcessing && (
        <ProcessingOverlay stage={processingStage} progress={processingProgress} />
      )}

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
}
