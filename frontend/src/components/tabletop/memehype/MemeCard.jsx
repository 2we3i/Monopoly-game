// MemeCard.jsx
// One meme, drawn from its data: the picture and the classic white-outlined
// captions. A card with a photo shows it edge to edge under the captions;
// one without draws its emoji composition on a gradient ground. The card never knows who played it - the
// server decides when that may be shown, and the caller adds it.

// Type scales with the card itself (see .meme-card in index.css); a size
// only sets the padding.
const SIZES = {
  sm: { pad: 'p-1.5' },
  md: { pad: 'p-2' },
  lg: { pad: 'p-3' },
  xl: { pad: 'p-4' },
};

// How many pictures the art holds (an emoji can be several code points).
function pictureCount(art = '') {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(art)].length || 1;
  } catch {
    return Math.max(1, Math.round([...art].length / 2));
  }
}

// One picture fills the card; two or three share it.
const ART_SIZE = { 1: 40, 2: 30, 3: 22 };

export default function MemeCard({
  meme, size = 'md', className = '', label = null, style, meta = false,
}) {
  if (!meme) return null;
  const s = SIZES[size] || SIZES.md;
  const [from, to] = meme.colors || ['#555', '#222'];
  const photo = Boolean(meme.image);
  const credit = meme.credit
    ? [meme.credit.author, meme.credit.license].filter(Boolean).join(' · ')
    : null;
  return (
    <div
      className={`meme-card flex aspect-[4/5] w-full flex-col ${s.pad} ${className}`}
      style={{ background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`, ...style }}
      role="img"
      aria-label={[meme.top, meme.bottom].filter(Boolean).join(' / ') || 'meme'}
      title={credit ? `📷 ${credit}` : undefined}
    >
      {photo && (
        <>
          <img src={meme.image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" loading="lazy" draggable={false} />
          {/* Darker at the top and bottom, where the captions sit. */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.45)_0%,transparent_28%,transparent_72%,rgba(0,0,0,0.5)_100%)]" />
        </>
      )}
      {/* A soft vignette so white captions read on light grounds too. */}
      {!photo && <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]" />}
      {label && (
        <span className="absolute left-2 top-2 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-black tracking-wide text-white">
          {label}
        </span>
      )}
      <p className="meme-caption min-h-[1em]">{meme.top}</p>
      <div className="flex flex-1 items-center justify-center">
        {!photo && (
          <span
            className="meme-art select-none whitespace-nowrap text-center"
            style={{ fontSize: `clamp(24px, ${ART_SIZE[Math.min(3, pictureCount(meme.art))]}cqw, 160px)` }}
          >
            {meme.art}
          </span>
        )}
      </div>
      <p className="meme-caption min-h-[1em]">{meme.bottom}</p>
      {/* A card that carries a name of its own says it, quietly, under the
          captions: these are memes people know BY name, and reading it is
          what tells a player they are holding the one they think they
          are. Cards without a name (the older, drawn packs) show nothing
          extra and look exactly as they always did. */}
      {meta && meme.title && (
        <p className="relative z-10 mt-1 truncate rounded-md bg-black/45 px-1.5 py-0.5 text-center text-[10px] font-semibold tracking-wide text-white/80">
          {meme.title}
        </p>
      )}
    </div>
  );
}
