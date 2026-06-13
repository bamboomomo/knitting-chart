import { Hand, Pencil, Eraser, Pipette, Type, Download, Trash2, FlipHorizontal2, FlipVertical2, RotateCw, RotateCcw, XCircle, Square, Copy, Clipboard, Scissors, Undo2, Redo2, Save, FolderOpen, Hash } from 'lucide-react';
import type { ToolMode } from '../types';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  onExport: () => void;
  onSave: () => void;
  onOpen: () => void;
  hasChart: boolean;
  onClear: () => void;
  onClearSymbols: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  hasClipboard: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export default function Toolbar({
  toolMode,
  onToolChange,
  onExport,
  onSave,
  onOpen,
  hasChart,
  onClear,
  onClearSymbols,
  onFlipHorizontal,
  onFlipVertical,
  onRotateCW,
  onRotateCCW,
  onCopy,
  onPaste,
  onCut,
  onUndo,
  onRedo,
  hasSelection,
  hasClipboard,
  canUndo,
  canRedo,
}: ToolbarProps) {
  const tools: { mode: ToolMode; icon: React.ReactNode; label: string; hint?: string }[] = [
    { mode: 'pan', icon: <Hand className="w-4 h-4" />, label: '移动' },
    { mode: 'select', icon: <Square className="w-4 h-4" />, label: '选择' },
    { mode: 'pen', icon: <Pencil className="w-4 h-4" />, label: '绘制' },
    { mode: 'eraser', icon: <Eraser className="w-4 h-4" />, label: '擦除' },
    { mode: 'symbol', icon: <Type className="w-4 h-4" />, label: '符号' },
    { mode: 'number', icon: <Hash className="w-4 h-4" />, label: '数字' },
    { mode: 'picker', icon: <Pipette className="w-4 h-4" />, label: '取色' },
  ];

  const btnStyle = (hoverColor = 'var(--accent)') => ({
    color: 'var(--text-secondary)' as const,
    border: '1px solid var(--border-color)' as const,
  });

  return (
    <div className="rounded-lg p-2.5 flex flex-wrap items-center gap-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: 'var(--bg-primary)' }}>
        {tools.map((t) => (
          <button
            key={t.mode}
            onClick={() => onToolChange(t.mode)}
            title={t.hint || t.label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all duration-200"
            style={{
              background: toolMode === t.mode ? 'var(--bg-elevated)' : 'transparent',
              color: toolMode === t.mode ? 'var(--accent)' : 'var(--text-secondary)',
              boxShadow: toolMode === t.mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200 disabled:opacity-30"
          style={btnStyle()}
          onMouseEnter={e => { if (canUndo) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Undo2 className="w-4 h-4" />
          <span className="hidden md:inline">撤销</span>
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (Ctrl+Y)"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200 disabled:opacity-30"
          style={btnStyle()}
          onMouseEnter={e => { if (canRedo) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Redo2 className="w-4 h-4" />
          <span className="hidden md:inline">重做</span>
        </button>
      </div>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <div className="flex items-center gap-1">
        <button
          onClick={onCopy}
          disabled={!hasSelection}
          title="复制选区 (Ctrl+C)"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200 disabled:opacity-30"
          style={btnStyle()}
          onMouseEnter={e => { if (hasSelection) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Copy className="w-4 h-4" />
          <span className="hidden md:inline">复制</span>
        </button>
        <button
          onClick={onPaste}
          disabled={!hasClipboard || !hasSelection}
          title="粘贴到选区起点 (Ctrl+V)"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200 disabled:opacity-30"
          style={btnStyle()}
          onMouseEnter={e => { if (hasClipboard && hasSelection) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Clipboard className="w-4 h-4" />
          <span className="hidden md:inline">粘贴</span>
        </button>
        <button
          onClick={onCut}
          disabled={!hasSelection}
          title="剪切选区 (Ctrl+X)"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200 disabled:opacity-30"
          style={btnStyle()}
          onMouseEnter={e => { if (hasSelection) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Scissors className="w-4 h-4" />
          <span className="hidden md:inline">剪切</span>
        </button>
      </div>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <div className="flex items-center gap-1">
        <button
          onClick={onFlipHorizontal}
          title="水平镜像"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200"
          style={btnStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <FlipHorizontal2 className="w-4 h-4" />
          <span className="hidden md:inline">水平镜像</span>
        </button>
        <button
          onClick={onFlipVertical}
          title="垂直翻转"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200"
          style={btnStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <FlipVertical2 className="w-4 h-4" />
          <span className="hidden md:inline">垂直翻转</span>
        </button>
        <button
          onClick={onRotateCCW}
          title="逆时针旋转90°"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200"
          style={btnStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden md:inline">逆时针</span>
        </button>
        <button
          onClick={onRotateCW}
          title="顺时针旋转90°"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-all duration-200"
          style={btnStyle()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <RotateCw className="w-4 h-4" />
          <span className="hidden md:inline">顺时针</span>
        </button>
      </div>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <button
        onClick={onClearSymbols}
        title="只清除符号，保留色块"
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-all duration-200"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <XCircle className="w-4 h-4" />
        清符号
      </button>
      <button
        onClick={onClear}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-all duration-200"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#e53e3e'; e.currentTarget.style.color = '#e53e3e'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <Trash2 className="w-4 h-4" />
        清除
      </button>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <button
        onClick={onOpen}
        title="打开图纸 (Ctrl+O)"
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
        style={{ background: 'var(--accent)', color: '#0a0a0a' }}
      >
        <FolderOpen className="w-4 h-4" />
        <span className="hidden md:inline">打开</span>
      </button>
      <button
        onClick={onSave}
        disabled={!hasChart}
        title="保存图纸 (Ctrl+S)"
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 disabled:opacity-30"
        style={{ background: 'var(--accent)', color: '#0a0a0a' }}
      >
        <Save className="w-4 h-4" />
        <span className="hidden md:inline">保存</span>
      </button>

      <div className="h-6 w-px mx-1" style={{ background: 'var(--border-color)' }} />

      <button
        onClick={onExport}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
        style={{ background: 'var(--accent)', color: '#0a0a0a' }}
      >
        <Download className="w-4 h-4" />
        导出
      </button>
    </div>
  );
}
