import { useRef, useEffect, useState, useCallback } from 'react';
import type { GridCell, ToolMode, SelectionRange, ClipboardData } from '../types';
import { renderGrid } from '../utils/chartRenderer';
import { onAllSymbolsLoaded } from '../utils/symbolImages';
import { GRID_BACKGROUND, EDITABLE_EMPTY, SELECTION_STROKE, SELECTION_FILL, SELECTION_CONFIRMED_STROKE, SELECTION_CONFIRMED_FILL } from '../utils/colorConstants';

interface ChartCanvasProps {
  grid: GridCell[][];
  cellSize: number;
  toolMode: ToolMode;
  selectedColor: string;
  selectedSymbol?: string;
  /** 符号跨越的行数 */
  symbolRowSpan?: number;
  /** 符号跨越的列数 */
  symbolColSpan?: number;
  onGridChange: (grid: GridCell[][]) => void;
  onPickColor?: (color: string) => void;
  rowStart?: number;
  colStart?: number;
  selection?: SelectionRange | null;
  onSelectionChange?: (sel: SelectionRange | null) => void;
  clipboard?: ClipboardData | null;
  onClipboardChange?: (data: ClipboardData | null) => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  /** 网格线颜色 */
  gridLineColor?: string;
}

function bresenhamLine(r0: number, c0: number, r1: number, c1: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  let dr = Math.abs(r1 - r0);
  let dc = Math.abs(c1 - c0);
  let sr = r0 < r1 ? 1 : -1;
  let sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;
  let r = r0, c = c0;
  while (true) {
    cells.push({ row: r, col: c });
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr) { err += dr; c += sc; }
  }
  return cells;
}

export default function ChartCanvas({
  grid,
  cellSize,
  toolMode,
  selectedColor,
  selectedSymbol,
  symbolRowSpan = 1,
  symbolColSpan = 1,
  onGridChange,
  onPickColor,
  rowStart = 1,
  colStart = 1,
  selection,
  onSelectionChange,
  clipboard,
  onClipboardChange,
  onCopy,
  onPaste,
  onCut,
  gridLineColor,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 40, y: 30 });
  const offsetRef = useRef({ x: 40, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);
  const lastCellRef = useRef<{ row: number; col: number } | null>(null);
  const pendingGridRef = useRef<GridCell[][] | null>(null);

  // 边缘自动滚动
  const autoScrollRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const EDGE_ZONE = 50; // 距离边缘多少像素触发自动滚动

  // 空格键平移
  const spaceHeldRef = useRef(false);
  const spacePanRef = useRef(false); // 当前是否正在空格平移
  const [spaceHeld, setSpaceHeld] = useState(false); // 用于触发光标样式更新

  const [localSelection, setLocalSelection] = useState<SelectionRange | null>(null);
  const selectStartRef = useRef<{ row: number; col: number } | null>(null);
  const isSelectingRef = useRef(false);

  const [pastePreview, setPastePreview] = useState<{ row: number; col: number } | null>(null);

  // 数字输入状态
  const [numberInput, setNumberInput] = useState<{ row: number; col: number; x: number; y: number } | null>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: number; col: number } | null>(null);

  const rows = grid.length;
  const cols = grid[0]?.length || 0;

  const [renderKey, setRenderKey] = useState(0);

  const currentSelection = selection !== undefined ? selection : localSelection;

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      renderGrid(ctx, grid, cellSize, offset.x, offset.y, true, rowStart, colStart, gridLineColor);

      const sel = selection !== undefined ? selection : localSelection;
      if (sel) {
        const minRow = Math.min(sel.startRow, sel.endRow);
        const maxRow = Math.max(sel.startRow, sel.endRow);
        const minCol = Math.min(sel.startCol, sel.endCol);
        const maxCol = Math.max(sel.startCol, sel.endCol);
        const sx = offset.x + minCol * cellSize;
        const sy = offset.y + minRow * cellSize;
        const sw = (maxCol - minCol + 1) * cellSize;
        const sh = (maxRow - minRow + 1) * cellSize;

        ctx.save();
        ctx.strokeStyle = SELECTION_STROKE;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.fillStyle = SELECTION_FILL;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.restore();
      }

      if (pastePreview && clipboard) {
        const px = offset.x + pastePreview.col * cellSize;
        const py = offset.y + pastePreview.row * cellSize;
        const pw = clipboard.cols * cellSize;
        const ph = clipboard.rows * cellSize;

        ctx.save();
        ctx.strokeStyle = SELECTION_CONFIRMED_STROKE;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = SELECTION_CONFIRMED_FILL;
        ctx.fillRect(px, py, pw, ph);
        ctx.restore();
      }
    };

    draw();

    const ro = new ResizeObserver(() => {
      draw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [grid, cellSize, offset, renderKey, rowStart, colStart, localSelection, selection, pastePreview, clipboard, gridLineColor]);

  useEffect(() => {
    const unsubscribe = onAllSymbolsLoaded(() => {
      setRenderKey(k => k + 1);
    });
    return unsubscribe;
  }, []);

  // 组件卸载时清理自动滚动
  useEffect(() => {
    return () => {
      if (autoScrollRef.current !== null) {
        cancelAnimationFrame(autoScrollRef.current);
      }
    };
  }, []);

  // 空格键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
        if (spacePanRef.current) {
          spacePanRef.current = false;
          setIsDragging(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getCellFromPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const currentOffset = offsetRef.current;
    const gridX = clientX - rect.left - currentOffset.x;
    const gridY = clientY - rect.top - currentOffset.y;
    const col = Math.floor(gridX / cellSize);
    const row = Math.floor(gridY / cellSize);
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      return { row, col };
    }
    return null;
  }, [cellSize, rows, cols]);

  // 打开数字输入框
  const openNumberInput = useCallback((row: number, col: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentOffset = offsetRef.current;
    const x = currentOffset.x + col * cellSize;
    const y = currentOffset.y + row * cellSize;
    setNumberInput({ row, col, x, y });
    setTimeout(() => numberInputRef.current?.focus(), 0);
  }, [cellSize]);

  // 提交数字输入（返回 true 表示已提交）
  const commitNumberInput = useCallback((): boolean => {
    if (!numberInput) return false;
    const value = numberInputRef.current?.value ?? '';
    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    if (value.trim() === '') {
      newGrid[numberInput.row][numberInput.col].number = undefined;
    } else {
      newGrid[numberInput.row][numberInput.col].number = value.trim();
    }
    onGridChange(newGrid);
    setNumberInput(null);
    return true;
  }, [numberInput, grid, onGridChange]);

  // 双击输入数字
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell) {
      openNumberInput(cell.row, cell.col);
    }
  }, [getCellFromPoint, openNumberInput]);

  const applyToolToCell = useCallback((newGrid: GridCell[][], row: number, col: number) => {
    switch (toolMode) {
      case 'pen':
        newGrid[row][col].color = selectedColor;
        break;
      case 'eraser':
        newGrid[row][col].color = GRID_BACKGROUND;
        newGrid[row][col].symbol = undefined;
        newGrid[row][col].symbolRowSpan = undefined;
        newGrid[row][col].symbolColSpan = undefined;
        newGrid[row][col].number = undefined;
        // Also clear spanning symbols that cover this cell
        for (let pr = Math.max(0, row - 5); pr < row; pr++) {
          for (let pc = Math.max(0, col - 5); pc < col; pc++) {
            const prev = newGrid[pr]?.[pc];
            if (prev?.symbol) {
              const spanR = prev.symbolRowSpan || 1;
              const spanC = prev.symbolColSpan || 1;
              if (pr + spanR > row && pc + spanC > col) {
                prev.symbol = undefined;
                prev.symbolRowSpan = undefined;
                prev.symbolColSpan = undefined;
              }
            }
          }
        }
        break;
      case 'symbol':
        if (selectedSymbol) {
          newGrid[row][col].symbol = selectedSymbol;
          newGrid[row][col].symbolRowSpan = symbolRowSpan > 1 ? symbolRowSpan : undefined;
          newGrid[row][col].symbolColSpan = symbolColSpan > 1 ? symbolColSpan : undefined;
        }
        break;
      default:
        break;
    }
  }, [toolMode, selectedColor, selectedSymbol, symbolRowSpan, symbolColSpan]);

  const modifyCell = useCallback((cell: { row: number; col: number }, prevCell?: { row: number; col: number } | null) => {
    if (!cell) return;

    const currentGrid = pendingGridRef.current || grid;
    let cellsToModify: { row: number; col: number }[];

    if (prevCell && (prevCell.row !== cell.row || prevCell.col !== cell.col)) {
      cellsToModify = bresenhamLine(prevCell.row, prevCell.col, cell.row, cell.col);
    } else {
      cellsToModify = [cell];
    }

    let newGrid = currentGrid;
    let changed = false;

    for (const c of cellsToModify) {
      if (c.row < 0 || c.row >= rows || c.col < 0 || c.col >= cols) continue;
      const existing = newGrid[c.row][c.col];
      let needsChange = false;

      switch (toolMode) {
        case 'pen':
          needsChange = existing.color !== selectedColor;
          break;
        case 'eraser':
          needsChange = existing.color !== GRID_BACKGROUND ||
                        existing.symbol !== undefined ||
                        existing.number !== undefined;
          break;
        case 'symbol':
          needsChange = selectedSymbol !== undefined && existing.symbol !== selectedSymbol;
          break;
        default:
          break;
      }

      if (needsChange) {
        if (!changed) {
          newGrid = currentGrid.map(r => r.map(c => ({ ...c })));
          changed = true;
        }
        applyToolToCell(newGrid, c.row, c.col);
      }
    }

    lastCellRef.current = cell;

    if (changed) {
      pendingGridRef.current = newGrid;
      onGridChange(newGrid);
    }
  }, [toolMode, selectedColor, selectedSymbol, grid, onGridChange, rows, cols, applyToolToCell]);

  // 启动边缘自动滚动（支持画笔绘制和选择工具）
  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) return;
    const tick = () => {
      const pos = mousePosRef.current;
      const container = containerRef.current;
      const isDrawing = isDrawingRef.current;
      const isSelecting = isSelectingRef.current;
      if (!pos || !container || (!isDrawing && !isSelecting)) {
        stopAutoScroll();
        return;
      }
      const rect = container.getBoundingClientRect();
      let dx = 0, dy = 0;
      const fromLeft = pos.x - rect.left;
      const fromRight = rect.right - pos.x;
      const fromTop = pos.y - rect.top;
      const fromBottom = rect.bottom - pos.y;

      if (fromLeft < EDGE_ZONE) dx = Math.max(1, (EDGE_ZONE - fromLeft) * 0.3);
      if (fromRight < EDGE_ZONE) dx = -Math.max(1, (EDGE_ZONE - fromRight) * 0.3);
      if (fromTop < EDGE_ZONE) dy = Math.max(1, (EDGE_ZONE - fromTop) * 0.3);
      if (fromBottom < EDGE_ZONE) dy = -Math.max(1, (EDGE_ZONE - fromBottom) * 0.3);

      if (dx !== 0 || dy !== 0) {
        const newOffset = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy };
        offsetRef.current = newOffset;
        setOffset(newOffset);

        if (isSelecting && selectStartRef.current) {
          // 选择工具：滚动时动态扩展选区
          const cell = getCellFromPoint(pos.x, pos.y);
          if (cell) {
            const newSel: SelectionRange = {
              startRow: selectStartRef.current.row, startCol: selectStartRef.current.col,
              endRow: cell.row, endCol: cell.col,
            };
            if (onSelectionChange) {
              onSelectionChange(newSel);
            } else {
              setLocalSelection(newSel);
            }
          }
        } else if (isDrawing) {
          // 画笔工具：滚动时继续绘制当前鼠标位置下的格子
          const cell = getCellFromPoint(pos.x, pos.y);
          if (cell) {
            modifyCell(cell, lastCellRef.current);
          }
        }
      }
      autoScrollRef.current = requestAnimationFrame(tick);
    };
    autoScrollRef.current = requestAnimationFrame(tick);
  }, [getCellFromPoint, modifyCell, onSelectionChange]);

  // 停止边缘自动滚动
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  // 滚轮平移画布（使用原生事件以支持 preventDefault）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const dx = e.deltaX;
      const dy = e.deltaY;
      if (dx === 0 && dy === 0) return;
      const newOffset = {
        x: offsetRef.current.x - dx,
        y: offsetRef.current.y - dy,
      };
      offsetRef.current = newOffset;
      setOffset(newOffset);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // 点击时关闭右键菜单
    if (contextMenu) {
      setContextMenu(null);
    }

    // 如果正在输入数字，先提交当前输入
    if (numberInput) {
      commitNumberInput();
    }

    lastCellRef.current = null;
    pendingGridRef.current = null;

    // 空格键 + 左键拖拽 = 平移画布
    if (spaceHeldRef.current && e.button === 0) {
      spacePanRef.current = true;
      setIsDragging(true);
      const currentOffset = offsetRef.current;
      dragStartRef.current = { x: e.clientX - currentOffset.x, y: e.clientY - currentOffset.y };
      return;
    }

    if (toolMode === 'pan') {
      setIsDragging(true);
      const currentOffset = offsetRef.current;
      dragStartRef.current = { x: e.clientX - currentOffset.x, y: e.clientY - currentOffset.y };
    } else if (toolMode === 'select') {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell) {
        selectStartRef.current = cell;
        isSelectingRef.current = true;
        const newSel: SelectionRange = {
          startRow: cell.row, startCol: cell.col,
          endRow: cell.row, endCol: cell.col,
        };
        if (onSelectionChange) {
          onSelectionChange(newSel);
        } else {
          setLocalSelection(newSel);
        }
        setPastePreview(null);
      } else {
        selectStartRef.current = null;
        if (onSelectionChange) {
          onSelectionChange(null);
        } else {
          setLocalSelection(null);
        }
      }
    } else if (['pen', 'eraser', 'symbol'].includes(toolMode)) {
      isDrawingRef.current = true;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell) {
        modifyCell(cell, null);
      }
    } else if (toolMode === 'picker') {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell && onPickColor) {
        const pickedColor = grid[cell.row][cell.col].color;
        onPickColor(pickedColor);
      }
    } else if (toolMode === 'number') {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell) {
        openNumberInput(cell.row, cell.col);
      }
    }
  }, [toolMode, getCellFromPoint, modifyCell, onPickColor, grid, onSelectionChange, openNumberInput, commitNumberInput, numberInput]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 更新鼠标位置（用于边缘自动滚动）
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isDragging) {
      const newOffset = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      };
      offsetRef.current = newOffset;
      setOffset(newOffset);
    } else if (isSelectingRef.current && toolMode === 'select') {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell && selectStartRef.current) {
        const newSel: SelectionRange = {
          startRow: selectStartRef.current.row, startCol: selectStartRef.current.col,
          endRow: cell.row, endCol: cell.col,
        };
        if (onSelectionChange) {
          onSelectionChange(newSel);
        } else {
          setLocalSelection(newSel);
        }
      }
      // 检查是否需要边缘自动滚动（选择工具）
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const fromLeft = e.clientX - rect.left;
        const fromRight = rect.right - e.clientX;
        const fromTop = e.clientY - rect.top;
        const fromBottom = rect.bottom - e.clientY;
        const nearEdge = fromLeft < EDGE_ZONE || fromRight < EDGE_ZONE || fromTop < EDGE_ZONE || fromBottom < EDGE_ZONE;
        if (nearEdge) {
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      }
    } else if (toolMode === 'select' && clipboard && !isSelectingRef.current) {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      setPastePreview(cell);
    } else if (isDrawingRef.current && ['pen', 'eraser', 'symbol'].includes(toolMode)) {
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (cell) {
        modifyCell(cell, lastCellRef.current);
      }
      // 检查是否需要边缘自动滚动
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const fromLeft = e.clientX - rect.left;
        const fromRight = rect.right - e.clientX;
        const fromTop = e.clientY - rect.top;
        const fromBottom = rect.bottom - e.clientY;
        const nearEdge = fromLeft < EDGE_ZONE || fromRight < EDGE_ZONE || fromTop < EDGE_ZONE || fromBottom < EDGE_ZONE;
        if (nearEdge) {
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      }
    }
  }, [isDragging, toolMode, getCellFromPoint, modifyCell, clipboard, onSelectionChange, startAutoScroll, stopAutoScroll]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    isDrawingRef.current = false;
    isSelectingRef.current = false;
    selectStartRef.current = null;
    lastCellRef.current = null;
    pendingGridRef.current = null;
    spacePanRef.current = false;
    stopAutoScroll();
    mousePosRef.current = null;
  }, [stopAutoScroll]);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, row: cell.row, col: cell.col });
      }
    }
  }, [getCellFromPoint]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 复制选区
  const handleCopy = useCallback(() => {
    const sel = currentSelection;
    if (!sel) return;
    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    const minCol = Math.min(sel.startCol, sel.endCol);
    const maxCol = Math.max(sel.startCol, sel.endCol);
    const cells: GridCell[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: GridCell[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const src = grid[r]?.[c];
        row.push(src ? { ...src, row: r - minRow, col: c - minCol } : { row: r - minRow, col: c - minCol, color: GRID_BACKGROUND });
      }
      cells.push(row);
    }
    const data: ClipboardData = { cells, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 };
    if (onClipboardChange) onClipboardChange(data);
    closeContextMenu();
  }, [currentSelection, grid, onClipboardChange, closeContextMenu]);

  // 粘贴到右键位置
  const handlePaste = useCallback(() => {
    if (!clipboard || !contextMenu) return;
    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    for (let r = 0; r < clipboard.rows; r++) {
      for (let c = 0; c < clipboard.cols; c++) {
        const tr = contextMenu.row + r;
        const tc = contextMenu.col + c;
        if (tr >= 0 && tr < rows && tc >= 0 && tc < cols) {
          const src = clipboard.cells[r]?.[c];
          if (src) {
            newGrid[tr][tc] = { ...src, row: tr, col: tc };
          }
        }
      }
    }
    onGridChange(newGrid);
    closeContextMenu();
  }, [clipboard, contextMenu, grid, rows, cols, onGridChange, closeContextMenu]);

  // 剪切
  const handleCut = useCallback(() => {
    handleCopy();
    const sel = currentSelection;
    if (!sel) return;
    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    const minCol = Math.min(sel.startCol, sel.endCol);
    const maxCol = Math.max(sel.startCol, sel.endCol);
    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newGrid[r][c] = { row: r, col: c, color: GRID_BACKGROUND };
      }
    }
    onGridChange(newGrid);
    closeContextMenu();
  }, [handleCopy, currentSelection, grid, onGridChange, closeContextMenu]);

  // 清除选区
  const handleClear = useCallback(() => {
    const sel = currentSelection;
    if (!sel) return;
    const minRow = Math.min(sel.startRow, sel.endRow);
    const maxRow = Math.max(sel.startRow, sel.endRow);
    const minCol = Math.min(sel.startCol, sel.endCol);
    const maxCol = Math.max(sel.startCol, sel.endCol);
    const newGrid = grid.map(r => r.map(c => ({ ...c })));
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newGrid[r][c] = { row: r, col: c, color: GRID_BACKGROUND };
      }
    }
    onGridChange(newGrid);
    closeContextMenu();
  }, [currentSelection, grid, onGridChange, closeContextMenu]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    lastCellRef.current = null;
    pendingGridRef.current = null;

    if (toolMode === 'pan') {
      setIsDragging(true);
      const currentOffset = offsetRef.current;
      dragStartRef.current = { x: touch.clientX - currentOffset.x, y: touch.clientY - currentOffset.y };
    } else if (toolMode === 'select') {
      const cell = getCellFromPoint(touch.clientX, touch.clientY);
      if (cell) {
        selectStartRef.current = cell;
        isSelectingRef.current = true;
        const newSel: SelectionRange = {
          startRow: cell.row, startCol: cell.col,
          endRow: cell.row, endCol: cell.col,
        };
        if (onSelectionChange) {
          onSelectionChange(newSel);
        } else {
          setLocalSelection(newSel);
        }
        setPastePreview(null);
      }
    } else if (['pen', 'eraser', 'symbol'].includes(toolMode)) {
      isDrawingRef.current = true;
      const cell = getCellFromPoint(touch.clientX, touch.clientY);
      if (cell) {
        modifyCell(cell, null);
      }
    } else if (toolMode === 'picker') {
      const cell = getCellFromPoint(touch.clientX, touch.clientY);
      if (cell && onPickColor) {
        const pickedColor = grid[cell.row][cell.col].color;
        onPickColor(pickedColor);
      }
    }
  }, [toolMode, getCellFromPoint, modifyCell, onPickColor, grid, onSelectionChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;

    // 更新鼠标位置（用于边缘自动滚动）
    mousePosRef.current = { x: touch.clientX, y: touch.clientY };

    if (isDragging) {
      const newOffset = {
        x: touch.clientX - dragStartRef.current.x,
        y: touch.clientY - dragStartRef.current.y
      };
      offsetRef.current = newOffset;
      setOffset(newOffset);
    } else if (isSelectingRef.current && toolMode === 'select') {
      const cell = getCellFromPoint(touch.clientX, touch.clientY);
      if (cell && selectStartRef.current) {
        const newSel: SelectionRange = {
          startRow: selectStartRef.current.row, startCol: selectStartRef.current.col,
          endRow: cell.row, endCol: cell.col,
        };
        if (onSelectionChange) {
          onSelectionChange(newSel);
        } else {
          setLocalSelection(newSel);
        }
      }
    } else if (isDrawingRef.current && ['pen', 'eraser', 'symbol'].includes(toolMode)) {
      const cell = getCellFromPoint(touch.clientX, touch.clientY);
      if (cell) {
        modifyCell(cell, lastCellRef.current);
      }
      // 检查边缘自动滚动
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const fromLeft = touch.clientX - rect.left;
        const fromRight = rect.right - touch.clientX;
        const fromTop = touch.clientY - rect.top;
        const fromBottom = rect.bottom - touch.clientY;
        const nearEdge = fromLeft < EDGE_ZONE || fromRight < EDGE_ZONE || fromTop < EDGE_ZONE || fromBottom < EDGE_ZONE;
        if (nearEdge) {
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      }
    }
  }, [isDragging, toolMode, getCellFromPoint, modifyCell, onSelectionChange, startAutoScroll, stopAutoScroll]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    isDrawingRef.current = false;
    isSelectingRef.current = false;
    selectStartRef.current = null;
    lastCellRef.current = null;
    pendingGridRef.current = null;
    stopAutoScroll();
    mousePosRef.current = null;
  }, [stopAutoScroll]);

  const cursorStyle = (() => {
    if (spaceHeld) return 'grab';
    switch (toolMode) {
      case 'pan': return 'grab';
      case 'select': return 'crosshair';
      case 'pen': return 'crosshair';
      case 'eraser': return 'crosshair';
      case 'symbol': return 'pointer';
      case 'picker': return 'crosshair';
      case 'number': return 'text';
      default: return 'crosshair';
    }
  })();

  const selInfo = (() => {
    if (!currentSelection) return null;
    const minRow = Math.min(currentSelection.startRow, currentSelection.endRow);
    const maxRow = Math.max(currentSelection.startRow, currentSelection.endRow);
    const minCol = Math.min(currentSelection.startCol, currentSelection.endCol);
    const maxCol = Math.max(currentSelection.startCol, currentSelection.endCol);
    return { minRow, maxRow, minCol, maxCol, h: maxRow - minRow + 1, w: maxCol - minCol + 1 };
  })();

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-lg overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
      <canvas
        ref={canvasRef}
        className="block"
        style={{ cursor: cursorStyle, width: '100%', height: '100%', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <div className="absolute bottom-2 right-2 px-3 py-1 rounded text-xs" style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--text-secondary)', backdropFilter: 'blur(4px)' }}>
        {cols} × {rows}
        {selectedSymbol && toolMode === 'symbol' && (
          <span className="ml-2 font-bold" style={{ color: 'var(--accent)' }}>绘制: {selectedSymbol}</span>
        )}
        {toolMode === 'picker' && (
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>点击取色</span>
        )}
        {toolMode === 'number' && (
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>点击输入数字，双击任意格子也可输入</span>
        )}
        {toolMode === 'select' && selInfo && (
          <span className="ml-2" style={{ color: SELECTION_STROKE }}>选区: {selInfo.w}×{selInfo.h}</span>
        )}
        {toolMode === 'select' && !selInfo && (
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>拖拽选择区域</span>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="absolute rounded-lg shadow-lg py-1 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            minWidth: 120,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:opacity-80"
            style={{ color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: clipboard ? 'pointer' : 'not-allowed', opacity: clipboard ? 1 : 0.4 }}
            disabled={!clipboard}
            onClick={handlePaste}
          >
            <span>📌</span> 粘贴
          </button>
          {currentSelection && (
            <button
              className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:opacity-80"
              style={{ color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onClick={handleClear}
            >
              <span>🗑️</span> 清除选区
            </button>
          )}
        </div>
      )}

      {/* 数字输入框 */}
      {numberInput && (
        <input
          ref={numberInputRef}
          type="text"
          inputMode="numeric"
          defaultValue={grid[numberInput.row]?.[numberInput.col]?.number || ''}
          className="absolute z-50 text-center font-bold outline-none"
          style={{
            left: numberInput.x,
            top: numberInput.y,
            width: cellSize,
            height: cellSize,
            fontSize: Math.max(cellSize * 0.5, 10),
            background: 'rgba(255,255,255,0.95)',
            border: '2px solid var(--accent)',
            borderRadius: 2,
            color: '#333',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitNumberInput();
            } else if (e.key === 'Escape') {
              setNumberInput(null);
            }
          }}
          onBlur={commitNumberInput}
        />
      )}
    </div>
  );
}
