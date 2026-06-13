/**
 * Knitting Chart Color Constants
 *
 * All color definitions follow Rules 6 & 16 from README.md:
 * - Rule 6: Empty cells visible with #F5F5F5
 * - Rule 16: GRID_BACKGROUND (#F7F7F7) vs PATTERN_COLOR distinction
 */

// ============================================================
// Rule 16: Semantic Color Categories
// ============================================================

/** GRID_BACKGROUND — Empty cells within the stitch grid (Rule 16)
 *
 * Purpose: Display grid structure only.
 * Behavior:
 *   - Does NOT belong to pattern
 *   - Excluded from color statistics
 *   - Excluded from symbol statistics
 *   - Excluded from pattern reconstruction
 */
export const GRID_BACKGROUND = '#F7F7F7';

/** EDITABLE_EMPTY — Visible empty cell background for canvas rendering (Rule 6)
 *
 * Used when rendering editable empty cells so they are distinguishable
 * from the page background. This is the visual representation of GRID_BACKGROUND
 * on the interactive canvas.
 */
export const EDITABLE_EMPTY = '#F5F5F5';

/** PATTERN_WHITE — Pure white as an actual pattern color
 *
 * When a cell is genuinely white in the original chart (not just empty),
 * this represents PATTERN_COLOR, not GRID_BACKGROUND.
 * Must retain independent ColorID and participate in statistics.
 */
export const PATTERN_WHITE = '#ffffff';

// ============================================================
// Rendering Colors (non-pattern UI elements)
// ============================================================

/** Grid line colors */
export const GRID_LINE_NORMAL = '#e7e5e4';
export const GRID_LINE_BOLD = '#a8a29e';
export const GRID_LINE_OUTER = '#44403c';

/** Selection highlight colors */
export const SELECTION_STROKE = '#3b82f6';
export const SELECTION_FILL = 'rgba(59, 130, 246, 0.08)';
export const SELECTION_CONFIRMED_STROKE = '#22c55e';
export const SELECTION_CONFIRMED_FILL = 'rgba(34, 197, 94, 0.08)';

/** Text/label colors */
export const LABEL_TEXT = '#57534e';
export const SYMBOL_TEXT_DARK = '#1c1917';
export const SYMBOL_TEXT_LIGHT = '#fafaf9';

/** Export/render colors */
export const CELL_BORDER = '#d6d3d1';
export const TABLE_HEADER_BG = '#f5f5f4';
export const SHEET_TITLE_BG = '#1c1917';
export const SHEET_TITLE_TEXT = '#ffffff';

// ============================================================
// Helper: Determine if a hex color is GRID_BACKGROUND-equivalent
// ============================================================

/** Check if a cell color should be treated as GRID_BACKGROUND (empty grid cell)
 *
 * Per Rule 16: A cell is GRID_BACKGROUND if it's semantically empty,
 * not if it just looks white. Use this to filter cells before statistics.
 */
export function isGridBackground(color: string): boolean {
  // Normalize to lowercase for comparison
  const c = color.toLowerCase();
  return c === GRID_BACKGROUND.toLowerCase() ||
         c === EDITABLE_EMPTY.toLowerCase();
}

/** Check if a color qualifies as a light PATTERN_COLOR (not to be merged with GRID_BACKGROUND)
 *
 * Per Rule 16: Light gray colors (#e0e0de–#e8e8e6 range) that are part of
 * the actual pattern must never be merged into GRID_BACKGROUND.
 */
export function isLightPatternColor(hex: string): boolean {
  const c = hex.toLowerCase().replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const brightness = (r + g + b) / 3;
  // Light gray range: brightness 220-245, low saturation
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
  return brightness >= 220 && brightness <= 248 && sat < 0.15;
}

/** Get the proper display color for a cell
 *
 * Converts internal color to renderable color:
 * - GRID_BACKGROUND → EDITABLE_EMPTY (visible on canvas)
 * - PATTERN_WHITE / other pattern colors → as-is
 */
export function getDisplayColor(cellColor: string): string {
  if (isGridBackground(cellColor)) {
    return EDITABLE_EMPTY;
  }
  return cellColor;
}
