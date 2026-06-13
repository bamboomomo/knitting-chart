interface ProcessingOverlayProps {
  stage: string;
  progress: number;
}

export default function ProcessingOverlay({ stage, progress }: ProcessingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-xl p-8 text-center max-w-sm w-full mx-4" style={{ background: 'var(--bg-card)' }}>
        <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--accent-bg)' }}>
          <svg className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>处理中...</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{stage}</p>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: 'var(--accent)' }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{Math.round(progress)}%</p>
      </div>
    </div>
  );
}
