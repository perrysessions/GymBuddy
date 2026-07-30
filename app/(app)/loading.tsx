export default function Loading() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5" style={{ background: 'var(--card-border)' }}>
      <div
        className="h-full"
        style={{
          background: 'var(--accent)',
          animation: 'loading-bar 1.2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes loading-bar {
          0%   { width: 0%;   margin-left: 0%; }
          50%  { width: 60%;  margin-left: 20%; }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}
