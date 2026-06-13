# Color Pattern Rules — Complete Reference

This document defines the 16 core rules governing the knitting chart reconstruction pipeline.
All agent modifications MUST comply with these rules.

---

## Rule 1: Detect Grid Dimensions First

Identify the grid structure (rows, columns, cell size) **before** analyzing any cell content.
Grid detection is the foundation; all downstream processing depends on accurate dimensions.

---

## Rule 2: Analyze Every Grid Cell Independently

Each cell is processed on its own merits. No cross-cell assumptions are made during initial analysis.
Spatial context (e.g., flood fill, propagation) is applied only in post-processing stages.

---

## Rule 3: Use Color Clustering to Identify Colors

Extract distinct colors from the image using clustering algorithms:
- **LAB Color Space** — Convert RGB to CIE L\*a\*b\* for perceptually uniform comparison
- **Median Cut** — Initial partitioning of color space
- **K-Means Refinement** — Iterative cluster center optimization
- **DeltaE Distance** — CIEDE2000 for perceptually accurate color matching

---

## Rule 4: Detect Knitting and Crochet Symbols

Recognize pattern symbols within cells. Symbols can span 1 or more cells (rowSpan × colSpan).
Currently, symbol detection is **not supported** in automatic recognition — symbols must be placed manually.

---

## Rule 5: Store Color and Symbol Separately

Each cell holds both a `color` property and an optional `symbol` property, stored independently.
Changing a cell's color does not affect its symbol, and vice versa.

---

## Rule 6: Empty Cells Must Remain Visible

Empty cells use a very light gray background (`#F5F5F5`).
Pure white (`#ffffff`) cells render as `#F5F5F5` on the canvas so they are distinguishable from the page background.

---

## Rule 7: Areas Outside the Chart Must Not Be Rendered

Only the detected grid area is displayed on the canvas. Margins, labels, and other non-chart regions are excluded.

---

## Rule 8: Rendering Priority — Color > Symbol > Grid

When drawing each cell:
1. Fill background color
2. Overlay symbol image (if present)
3. Draw grid lines on top

---

## Rule 9: Output Structured Cell Data

```typescript
{
  row: number;
  col: number;
  color: string;      // hex color code
  symbol?: string;    // optional symbol identifier
  symbolRowSpan?: number;  // symbol row span (default 1)
  symbolColSpan?: number;  // symbol col span (default 1)
  active?: boolean;   // false = negative space (transparent)
  emptyType?: 'outer' | 'inner';  // flood fill classification
}
```

---

## Rule 10: Never Merge Cells

Each grid cell maps to exactly one output cell. Merging adjacent cells is prohibited.

---

## Rule 11: Never Remove Empty Cells

All cells in the detected grid range are preserved, including blank/white ones.
Empty cells are displayed with `#F5F5F5` background, not deleted.

---

## Rule 12: Never Change Chart Dimensions

The output canvas dimensions match the detected grid dimensions (cols × rows).
No cropping, padding, or resizing of the grid is allowed.

---

## Rule 13: Never Classify Content Using Color Alone

Use multiple signals to determine cell content:
- Edge detection (grid line analysis)
- Texture analysis (symbol patterns)
- Brightness distribution (V-profile energy)
- Spatial context (flood fill, neighbor propagation)

RGB values alone are insufficient for reliable classification.

---

## Rule 14: Maximum Visual Fidelity

The reconstructed canvas must visually match the original knitting chart with maximum fidelity.
Minimize information loss during the image-to-canvas conversion pipeline.

---

## Rule 15: Never Convert All White Areas into Editable Cells

White regions inside garment openings must remain transparent. These are **NEGATIVE_SPACE** —
they represent physical holes in the garment, not stitch grid content.

- `active: true` + `color: '#F5F5F5'` → Editable empty cell (part of the stitch grid)
- `active: false` → Negative space (transparent, no background, no grid lines)

**Examples of negative space:**
- Neckline opening
- Armhole / sleeve cutout
- Shoulder shaping cutout
- Decorative opening (keyhole, slit)

**Detection approach:**
- Shape analysis: U-shape for neckline, D-shape for armhole
- Flood fill: Connected white regions bounded by pattern cells
- Edge pattern-neighbor detection: Short white runs at image edges adjacent to pattern cells

---

## Rule 16: Distinguish GRID_BACKGROUND from PATTERN_COLOR

Not all light-colored cells are equivalent — their semantic role determines processing.

### GRID_BACKGROUND (网格背景)

- **Definition:** Empty cells within the stitch grid, no pattern content
- **Rendering color (fixed):** `#F7F7F7`
- **Behavior:**
  - Does NOT belong to the pattern
  - Excluded from color statistics, symbol statistics, and pattern reconstruction
  - Purpose: display the grid structure only
- **Identification criteria:**
  - Cell brightness > 248 (very close to pure white)
  - No detectable symbols or texture
  - Color distance to background color < threshold
  - Surrounded by other grid-background or pattern cells

### PATTERN_COLOR (图案颜色)

- **Definition:** A genuine pattern color, even if visually similar to background gray
- **Behavior:**
  - Participates in color statistics, symbol mapping, and pattern reconstruction
  - Must retain an independent ColorID even when visually similar to other colors
  - **Never merged with GRID_BACKGROUND**
- **Identification criteria:**
  - Has distinguishable brightness/saturation difference from true white (> 3 ΔE in CIEDE2000)
  - Part of a coherent pattern region (adjacent cells share similar non-white colors)
  - May be light gray (#e0e0de–#e8e8e6 range) but represents intentional design

---

## Appendix: Rule Application by Pattern Type

| Rule | COLOR_PATTERN | STRUCTURE_PATTERN |
|------|:---:|:---:|
| R1 Grid Detection | Yes | Yes |
| R2 Independent Cell Analysis | Yes | Yes |
| R3 Color Clustering | Yes | No (structure mode uses V-energy) |
| R4 Symbol Detection | Manual only | Manual only |
| R5 Color/Symbol Separation | Yes | Yes |
| R6 Empty Cell Visibility | Yes | Yes (EmptyGrid = `#F5F5F5`) |
| R7 Non-Chart Exclusion | Yes | Yes |
| R8 Rendering Priority | Yes | Yes |
| R9 Structured Output | Yes | Yes |
| R10 No Cell Merging | Yes | Yes |
| R11 No Empty Cell Removal | Yes | Yes |
| R12 No Dimension Change | Yes | Yes |
| R13 Multi-Signal Classification | Yes | Yes |
| R14 Visual Fidelity | Yes | Yes |
| R15 Negative Space | Yes | Yes (EmptyGrid vs Hole) |
| R16 GRID_BACKGROUND vs PATTERN_COLOR | Yes | N/A (structure mode uses emptyType) |
