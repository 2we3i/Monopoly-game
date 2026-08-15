// HeroBoard.jsx
// A pure-CSS, isometrically-tilted miniature board used as the landing
// screen's hero visual. No image assets - built from styled divs so it
// stays crisp at any size and costs nothing to load. Gently drifts via a
// CSS animation (disabled under prefers-reduced-motion, handled globally
// in index.css) so the landing screen feels alive rather than static.

const RING_COLORS = [
  '#7a5230', '#7a5230', '#a3d0e8', '#a3d0e8', '#a3d0e8',
  '#d888b0', '#d888b0', '#d888b0', '#e08a3c', '#e08a3c',
];

function MiniTile({ color, corner = false }) {
  if (corner) {
    return <div className="h-full w-full rounded-[2px] bg-board-tile shadow-[inset_0_0_0_1px_rgba(198,149,47,0.4)]" />;
  }
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[2px] bg-board-tile shadow-[inset_0_0_0_1px_rgba(198,149,47,0.25)]">
      <div className="h-[38%] w-full shrink-0" style={{ backgroundColor: color }} />
    </div>
  );
}

export default function HeroBoard({ className = '' }) {
  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      style={{ perspective: '1400px' }}
      aria-hidden="true"
    >
      <div
        className="relative mx-auto animate-board-drift"
        style={{
          width: 'min(560px, 90vw)',
          aspectRatio: '1 / 1',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Ambient glow beneath the board */}
        <div
          className="absolute -inset-16 -z-10 rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(240,197,99,0.25) 0%, transparent 70%)' }}
        />

        <div
          className="relative h-full w-full rounded-2xl border border-brass/30 bg-board shadow-board texture-parchment"
          style={{
            padding: '6.5%',
            display: 'grid',
            gridTemplateColumns: 'repeat(10, 1fr)',
            gridTemplateRows: 'repeat(10, 1fr)',
            gap: '3px',
          }}
        >
          {/* Corners */}
          <div style={{ gridRow: 10, gridColumn: 10 }}><MiniTile corner /></div>
          <div style={{ gridRow: 10, gridColumn: 1 }}><MiniTile corner /></div>
          <div style={{ gridRow: 1, gridColumn: 1 }}><MiniTile corner /></div>
          <div style={{ gridRow: 1, gridColumn: 10 }}><MiniTile corner /></div>

          {/* Bottom row */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`b${i}`} style={{ gridRow: 10, gridColumn: 9 - i }}>
              <MiniTile color={RING_COLORS[i % RING_COLORS.length]} />
            </div>
          ))}
          {/* Left column */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`l${i}`} style={{ gridRow: 9 - i, gridColumn: 1 }}>
              <MiniTile color={RING_COLORS[(i + 3) % RING_COLORS.length]} />
            </div>
          ))}
          {/* Top row */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`t${i}`} style={{ gridRow: 1, gridColumn: 2 + i }}>
              <MiniTile color={RING_COLORS[(i + 6) % RING_COLORS.length]} />
            </div>
          ))}
          {/* Right column */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`r${i}`} style={{ gridRow: 2 + i, gridColumn: 10 }}>
              <MiniTile color={RING_COLORS[(i + 1) % RING_COLORS.length]} />
            </div>
          ))}

          {/* Center: wordmark + a couple of tokens for life */}
          <div
            className="flex flex-col items-center justify-center gap-3"
            style={{ gridRow: '2 / 10', gridColumn: '2 / 10' }}
          >
            <p className="font-display text-[clamp(1.5rem,5vw,2.75rem)] font-bold tracking-tight text-ink/[0.14]">
              LANDMARK
            </p>
            <div className="flex gap-2.5">
              <span className="h-3 w-3 rounded-full shadow-token ring-2 ring-white/60" style={{ backgroundColor: '#c0473b' }} />
              <span className="h-3 w-3 rounded-full shadow-token ring-2 ring-white/60" style={{ backgroundColor: '#1f8a63' }} />
              <span className="h-3 w-3 rounded-full shadow-token ring-2 ring-white/60" style={{ backgroundColor: '#c6952f' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
