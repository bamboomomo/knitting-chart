import { Upload } from 'lucide-react';
import { useRef, useCallback } from 'react';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
}

export default function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  }, [onImageUpload]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="rounded-xl p-8 text-center cursor-pointer transition-all duration-300"
      style={{
        background: 'var(--bg-card)',
        border: '2px dashed var(--border-color)',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-bg)' }}>
          <Upload className="w-6 h-6" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p style={{ color: 'var(--text-primary)' }} className="font-medium">点击或拖拽上传图片</p>
          <p style={{ color: 'var(--text-muted)' }} className="text-sm mt-1">支持 JPG、PNG 格式</p>
        </div>
      </div>
    </div>
  );
}
