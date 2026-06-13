import { useState, useRef, useEffect } from 'react';
import { X, Download, FolderOpen } from 'lucide-react';

type ExportFormat = 'png' | 'svg' | 'xlsx';
type SaveLocation = 'default' | 'choose';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (filename: string, format: ExportFormat, chooseLocation: boolean) => Promise<void>;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string }[] = [
  { value: 'png', label: 'PNG', desc: '位图图片，适合打印和分享' },
  { value: 'svg', label: 'SVG', desc: '矢量图，可无损缩放' },
  { value: 'xlsx', label: 'Excel', desc: '表格格式，含颜色和符号数据 (.xls)' },
];

const LOCATION_OPTIONS: { value: SaveLocation; label: string; desc: string; fallbackDesc?: string }[] = [
  { value: 'default', label: '默认位置', desc: '保存到浏览器默认下载目录' },
  { value: 'choose', label: '选择位置', desc: '选择保存的文件夹和文件名', fallbackDesc: '在新标签页打开，可右键"另存为"选择位置' },
];

export default function ExportDialog({ open, onClose, onExport }: ExportDialogProps) {
  const [filename, setFilename] = useState('knitting-chart');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [saveLocation, setSaveLocation] = useState<SaveLocation>('default');
  const inputRef = useRef<HTMLInputElement>(null);

  // 检测浏览器是否支持 showSaveFilePicker
  const supportsChooseLocation = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const handleExport = async () => {
    const trimmed = filename.trim();
    if (!trimmed) return;
    const extMap: Record<ExportFormat, string> = { png: 'png', svg: 'svg', xlsx: 'xls' };
    await onExport(`${trimmed}.${extMap[format]}`, format, saveLocation === 'choose');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleExport();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-md mx-4 overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>导出图纸</h2>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>文件名</label>
            <input
              ref={inputRef}
              type="text"
              value={filename}
              onChange={e => setFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入文件名..."
              className="w-full px-3 py-2 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>导出格式</label>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200"
                  style={{
                    border: format === opt.value ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                    background: format === opt.value ? 'var(--accent-bg)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value={opt.value}
                    checked={format === opt.value}
                    onChange={() => setFormat(opt.value)}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ border: format === opt.value ? '2px solid var(--accent)' : '2px solid var(--border-color)' }}
                  >
                    {format === opt.value && (
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                    <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              <FolderOpen className="w-3.5 h-3.5 inline mr-1" style={{ verticalAlign: 'text-bottom' }} />
              保存位置
            </label>
            <div className="space-y-2">
              {LOCATION_OPTIONS.map(opt => {
                const isFallback = opt.value === 'choose' && !supportsChooseLocation;
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200"
                    style={{
                      border: saveLocation === opt.value ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                      background: saveLocation === opt.value ? 'var(--accent-bg)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="saveLocation"
                      value={opt.value}
                      checked={saveLocation === opt.value}
                      onChange={() => setSaveLocation(opt.value)}
                      className="sr-only"
                    />
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                      style={{ border: saveLocation === opt.value ? '2px solid var(--accent)' : '2px solid var(--border-color)' }}
                    >
                      {saveLocation === opt.value && (
                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                      )}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                        {isFallback ? opt.fallbackDesc : opt.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={!filename.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: 'var(--accent)',
              color: '#0a0a0a',
              opacity: !filename.trim() ? 0.5 : 1,
            }}
          >
            <Download className="w-4 h-4" />
            导出 {FORMAT_OPTIONS.find(f => f.value === format)?.label}
          </button>
        </div>
      </div>
    </div>
  );
}
