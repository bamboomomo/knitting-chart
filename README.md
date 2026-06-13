# Knitting Chart Editor

A web-based tool to convert uploaded knitting/crochet chart images into an editable canvas. Upload a chart image, automatically reconstruct the grid, and edit colors, symbols, and cell content interactively.

## 1. Project Overview

This application reconstructs knitting charts from uploaded images into structured, editable grid data. It supports two distinct pattern types with different recognition pipelines, and provides an interactive canvas for manual editing.

**Important:** This version does **not** support automatic symbol recognition. When uploading an image, manually select the correct pattern type (Color or Structure) for best results.

## 2. Supported Pattern Types

### COLOR_PATTERN

For charts where cell content is defined by **color** (e.g., fair isle, intarsia, colorwork charts).

- Each cell is assigned a color from the extracted palette
- Uses LAB color space clustering for perceptually accurate color extraction
- Distinguishes `GRID_BACKGROUND` from `PATTERN_COLOR` (Rule 16)
- Detects negative space (neckline, armhole) and marks as transparent

### STRUCTURE_PATTERN

For charts where cell content is defined by **stitch type** (e.g., cable, lace, texture charts).

- Each cell is classified as `EmptyGrid` (has grid lines) or `Hole` (negative space)
- Uses V-profile energy scoring for grid line detection
- Grid lines are preserved; symbols must be placed manually
- Supports multi-cell symbol spanning (rowSpan × colSpan)

## 3. Core Algorithms

### LAB Quantization

Color extraction in COLOR_PATTERN mode uses a multi-stage pipeline:

1. **RGB → LAB Conversion** — sRGB gamma decode → linear RGB → XYZ (D65) → Bradford chromatic adaptation (D50) → CIE L\*a\*b\*
2. **Median Cut** — Recursively partition color space into boxes along the axis of greatest range
3. **K-Means Refinement** — Iteratively refine cluster centers in LAB space until convergence
4. **DeltaE Distance** — CIEDE2000 perceptual color difference for cluster assignment and palette matching

### Flood Fill Classification

Used in STRUCTURE_PATTERN mode to classify empty regions:

1. Build brightness map from cell colors
2. Flood-fill connected bright-white regions (4-neighborhood)
3. Classify each region by shape and position:
   - **Outer** (EmptyGrid): Connected to image edge → has grid lines → rendered as `#F5F5F5`
   - **Inner** (Hole): Enclosed by pattern cells → negative space → rendered transparent

## 4. Key Algorithms

### (a) Color Mode — Color Quantization

| Step | Algorithm | Purpose |
|------|-----------|---------|
| 1 | LAB Color Space | Perceptually uniform color representation |
| 2 | Median Cut | Initial color space partitioning |
| 3 | K-Means Refinement | Iterative cluster center optimization |
| 4 | DeltaE Distance (CIEDE2000) | Perceptual color matching and assignment |

**Pipeline:** Raw pixels → LAB conversion → Median Cut → K-Means → Palette → Cell assignment via DeltaE

### (b) Structure Mode — Structure Recognition

| Step | Algorithm | Purpose |
|------|-----------|---------|
| 1 | Grid Detection | Detect grid lines via autocorrelation and edge analysis |
| 2 | Contour Extraction | Extract cell boundaries from detected grid lines |
| 3 | Flood Fill Region Analysis | Classify connected white regions as outer/inner |
| 4 | EmptyGrid / Hole Classification | V-profile energy + Otsu thresholding |

**Pipeline:** Raw pixels → Grid detection → V-profile energy → Grid Region Propagation → Combined score → Otsu threshold → Edge fill → Spatial smoothing

## 5. EmptyGrid vs Hole

In STRUCTURE_PATTERN mode, white cells are classified into two categories:

| Type | `emptyType` | Visual | Description |
|------|------------|--------|-------------|
| **EmptyGrid** | `'outer'` | Light gray `#F5F5F5` with grid lines | Part of the stitch grid, connected to image edge |
| **Hole** | `'inner'` | Transparent, no grid lines | Negative space (neckline, armhole, etc.) |

**Classification pipeline:**

1. **V-profile energy** — Calculate second-derivative energy along horizontal/vertical center lines of each cell
2. **Grid Region Propagation** — 8-neighbor spatial propagation (α=0.6 self + β=0.4 neighbor avg, 2 rounds)
3. **Combined score** — `0.50×propagated + 0.25×maxHV + 0.15×minHV + 0.10×edgePresence`
4. **Otsu threshold** — Adaptive binary classification
5. **Edge fill** — Column/row scan to fix edge cells missed by low energy
6. **Spatial smoothing** — 2-round neighbor voting to remove isolated misclassifications

## 6. Project Structure

```
src/
├── App.tsx                    # Main application, state management
├── main.tsx                   # Entry point
├── index.css                  # Global styles (Tailwind)
├── components/
│   ├── ChartCanvas.tsx        # Interactive canvas, cell editing
│   ├── ColorPalette.tsx       # Color palette panel
│   ├── ExportDialog.tsx       # Export to PNG/SVG
│   ├── ImageUploader.tsx      # Image upload with settings
│   ├── LegendPanel.tsx        # Symbol legend (grid layout)
│   ├── ProcessingOverlay.tsx  # Processing progress overlay
│   ├── SymbolSVG.tsx          # SVG symbol rendering
│   └── Toolbar.tsx            # Drawing tools, zoom, symbol settings
├── types/
│   └── index.ts               # TypeScript type definitions
└── utils/
    ├── chartRenderer.ts       # Canvas rendering (grid, symbols, colors)
    ├── colorConstants.ts      # Color constants (GRID_BG, PATTERN_WHITE, etc.)
    ├── imageProcessing.ts     # Core image processing pipeline
    ├── symbolImages.ts        # Symbol image paths and loading
    └── testImageGenerator.ts  # Test image generation utility

public/
├── symbols/
│   ├── knit/                  # Knitting symbol PNG images
│   └── crochet/               # Crochet symbol PNG images
├── favicon.svg
├── icons.svg
└── hero.png

docs/
└── COLOR_PATTERN_RULES.md     # Complete 16-rule reference
```

## 7. Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Tech stack:** React 19 + TypeScript + Vite + Tailwind CSS 4

## 8. Known Limitations

- **No automatic symbol recognition** — Symbols must be placed manually on the canvas. Upload images should be manually set to Color or Structure type.
- **Edge detection sensitivity** — Structure mode may misclassify cells at image boundaries (top/bottom rows) where grid lines are faint. Edge fill heuristics mitigate this but are not perfect.
- **Color quantization accuracy** — Very similar colors (ΔE < 3) may be merged. Light gray pattern colors near the background threshold can be misclassified.
- **Negative space detection** — Armhole detection relies on edge run-length heuristics; unusual garment shapes may not be detected correctly.
- **Symbol spanning** — Multi-cell symbols (rowSpan × colSpan) stretch the symbol image to fill the spanned area. Non-square aspect ratios may distort the symbol.
- **Single image input** — Only one image can be processed at a time. No batch processing.

## Documentation

- [Color Pattern Rules — Complete 16-Rule Reference](docs/COLOR_PATTERN_RULES.md)

---

### Core Rules Overview

| # | Rule | Summary |
|---|------|---------|
| 1 | Grid First | Detect grid dimensions before analyzing content |
| 2 | Independent Cells | Analyze each cell independently |
| 3 | Color Clustering | Use LAB + K-Means + DeltaE for color extraction |
| 4 | Symbol Detection | Support multi-cell symbol spanning |
| 5 | Color ≠ Symbol | Store color and symbol separately |
| 6 | Visible Empty | Empty cells use `#F5F5F5`, not white |
| 7 | Chart Only | Only render detected grid area |
| 8 | Render Order | Color → Symbol → Grid lines |
| 9 | Structured Output | Each cell: row, col, color, symbol?, active? |
| 10 | No Merge | Never merge adjacent cells |
| 11 | No Remove | Never delete empty cells |
| 12 | No Resize | Output dimensions = detected dimensions |
| 13 | Multi-Signal | Never classify by color alone |
| 14 | Max Fidelity | Visually match the original chart |
| 15 | Negative Space | Garment openings stay transparent |
| 16 | BG vs Pattern | Distinguish grid background from light pattern colors |

For full rule definitions and implementation details, see [docs/COLOR_PATTERN_RULES.md](docs/COLOR_PATTERN_RULES.md).
