import { SYMBOL_IMAGES } from '../utils/symbolImages';

interface SymbolSVGProps {
  type: string;
  size?: number;
  className?: string;
  imageSrc?: string;
}

export default function SymbolSVG({ type, size = 24, className = '', imageSrc }: SymbolSVGProps) {
  // 优先使用传入的 imageSrc，否则从 SYMBOL_IMAGES 查找
  const src = imageSrc || SYMBOL_IMAGES[type];

  if (src) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
        }}
      >
        <img
          src={src}
          alt={type}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          draggable={false}
        />
      </div>
    );
  }

  // 无匹配图片时显示文字回退
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: Math.max(size * 0.5, 10),
        color: 'var(--text-muted, #999)',
      }}
    >
      {type}
    </div>
  );
}
