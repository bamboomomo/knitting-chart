export interface GridCell {
  row: number;
  col: number;
  color: string;
  symbol?: string;
  /** 符号跨越的行数（从当前格子向下延伸），默认1 */
  symbolRowSpan?: number;
  /** 符号跨越的列数（从当前格子向右延伸），默认1 */
  symbolColSpan?: number;
  /** 是否为活跃格子。false 表示负空间(NEGATIVE_SPACE)，如领口、袖窿等服装开孔区域，渲染时应透明 */
  active?: boolean;
  /**
   * 空格子连通区域分类（基于 BFS 泛洪分析，非颜色判断）
   * - 'outer': 与图像边缘连通的空白区域 → OUTER_EMPTY_CELL → 显示浅灰色网格
   * - 'inner': 不与边缘连通的封闭空白区域 → INNER_HOLE → 纯白无网格
   * - undefined: 非空格子（有图案颜色）
   */
  emptyType?: 'outer' | 'inner';
  /** 内部调试字段（结构图识别 pipeline 使用） */
  _regionType?: string;
  _debug?: Record<string, unknown>;
  /** 用户输入的数字标注 */
  number?: string;
}

export interface KnittingChart {
  rows: number;
  cols: number;
  cells: GridCell[][];
  colors: string[];
  cellSize: number;
}

export interface ExtractedColor {
  hex: string;
  count: number;
}

export type ToolMode = 'pan' | 'pen' | 'eraser' | 'picker' | 'symbol' | 'select' | 'number';

export interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface ClipboardData {
  cells: GridCell[][];
  rows: number;
  cols: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridColorEntry {
  id: string;
  hex: string;
  pixels: number;
}

export interface GridMatrixOutput {
  image_width: number;
  image_height: number;
  aspect_ratio: number;
  grid_width: number;
  grid_height: number;
  colors: GridColorEntry[];
  matrix: string[][];
}
