import { useState } from 'react';
import type { ExtractedColor, GridCell } from '../types';

interface ColorPaletteProps {
  colors: ExtractedColor[];
  selectedColor: string;
  onSelectColor: (color: string) => void;
  onCustomColor: (color: string) => void;
  onReplaceColor?: (oldColor: string, newColor: string) => void;
  grid?: GridCell[][];
}

function countColorStitches(grid: GridCell[][] | undefined, hex: string): number {
  if (!grid) return 0;
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.color === hex) count++;
    }
  }
  return count;
}

export default function ColorPalette({
  colors,
  selectedColor,
  onSelectColor,
  onCustomColor,
  onReplaceColor,
  grid
}: ColorPaletteProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (index: number, currentHex: string) => {
    setEditingIndex(index);
    setEditValue(currentHex);
  };

  const confirmEdit = (oldHex: string) => {
    const normalized = editValue.startsWith('#') ? editValue : '#' + editValue;
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      onCustomColor(normalized);
      onReplaceColor?.(oldHex, normalized);
    }
    setEditingIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <h3 style={{ color: 'var(--text-secondary)' }} className="text-xs font-semibold mb-3">颜色</h3>
      
      <div className="space-y-1">
        {colors.map((c, i) => {
          const stitchCount = countColorStitches(grid, c.hex);
          const isSelected = selectedColor === c.hex;
          const isEditing = editingIndex === i;

          return (
            <div
              key={i}
              className="w-full flex items-center gap-2 p-1.5 rounded-lg transition-all duration-200"
              style={{
                background: isSelected ? 'var(--accent-bg)' : 'transparent',
                border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              <span
                className="w-5 h-5 rounded shrink-0 cursor-pointer"
                style={{ backgroundColor: c.hex, border: '1px solid var(--border-color)' }}
                onClick={() => onSelectColor(c.hex)}
              />

              {isEditing ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => confirmEdit(c.hex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmEdit(c.hex);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  autoFocus
                  className="flex-1 text-xs font-mono px-1 py-0.5 rounded"
                  style={{ color: 'var(--text-primary)', background: 'var(--bg-input)', border: '1px solid var(--accent)', outline: 'none' }}
                />
              ) : (
                <>
                  <span
                    className="text-xs font-mono flex-1 text-left cursor-pointer hover:underline"
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }}
                    onClick={() => onSelectColor(c.hex)}
                    onDoubleClick={() => startEdit(i, c.hex)}
                    title="双击编辑颜色"
                  >
                    {c.hex}
                  </span>

                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(i, c.hex); }}
                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                    title="更改此颜色"
                  >
                    ✎
                  </button>
                </>
              )}

              {!isEditing && stitchCount > 0 && (
                <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>{stitchCount} 针</span>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="flex items-center gap-2 pt-3 mt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => onCustomColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer"
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>自定义</span>
      </div>
    </div>
  );
}
