// chpokArt.jsx
// Menu artwork for the two ЧПОК boxes: the decks as they lie on the table,
// black theme cards next to white letter cards.

function AgeMark() {
  return (
    <g>
      <circle cx="104" cy="15" r="9" fill="#a8342a" />
      <text x="104" y="18" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif">18+</text>
    </g>
  );
}

function ThemeCardShape({ x, y, size, rotate, label = true }) {
  const c = size / 2;
  return (
    <g transform={`rotate(${rotate} ${x + c} ${y + c})`}>
      <rect x={x} y={y} width={size} height={size} rx="4" fill="#050505" stroke="rgba(255,255,255,0.28)" />
      <path d={`M${x} ${y}l${size} ${size}M${x + size} ${y}l${-size} ${size}`} stroke="rgba(255,255,255,0.1)" />
      {label && (
        <text x={x + c} y={y + c + 3} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fff" fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.6">ЧПОК</text>
      )}
    </g>
  );
}

function LetterCardShape({
  x, y, size, rotate, letter,
}) {
  const c = size / 2;
  return (
    <g transform={`rotate(${rotate} ${x + c} ${y + c})`}>
      <rect x={x} y={y} width={size} height={size} rx="4" fill="#f7f3ea" stroke="rgba(0,0,0,0.25)" />
      <text x={x + c} y={y + c + size * 0.24} textAnchor="middle" fontSize={size * 0.7} fontWeight="900" fill="#1f2417" fontFamily="Fraunces, Georgia, serif">{letter}</text>
    </g>
  );
}

export function ChpokArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="chpok-glow" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#3b1531" />
          <stop offset="100%" stopColor="#0b0a0c" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#chpok-glow)" />
      <ThemeCardShape x={20} y={20} size={42} rotate={-9} />
      <LetterCardShape x={58} y={24} size={38} rotate={8} letter="Ж" />
      <AgeMark />
    </svg>
  );
}

export function Chpok2Art() {
  return (
    <svg viewBox="0 0 120 80" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="chpok2-glow" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2c1a3b" />
          <stop offset="100%" stopColor="#0b0a0c" />
        </radialGradient>
      </defs>
      <rect width="120" height="80" rx="6" fill="url(#chpok2-glow)" />
      <ThemeCardShape x={14} y={24} size={36} rotate={-16} label={false} />
      <ThemeCardShape x={28} y={18} size={38} rotate={-4} />
      <LetterCardShape x={66} y={26} size={32} rotate={10} letter="П" />
      <text x="90" y="72" textAnchor="middle" fontSize="26" fontWeight="900" fill="#e3bb5c" fontFamily="Fraunces, Georgia, serif">2</text>
      <AgeMark />
    </svg>
  );
}
