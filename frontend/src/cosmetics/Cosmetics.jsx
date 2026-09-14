// Cosmetics.jsx
// Draws cosmetic items: a styled nickname, a title, badges, an avatar
// frame, a decorated board token, an emote, a profile backdrop.
//
// Everything is driven by the item's `visual` description from the
// catalogue and drawn with CSS only - gradients, clip-paths and a handful
// of short keyframe animations - so a crowded room stays cheap to render.

import { memo, useMemo } from 'react';
import { RARITY_META, itemName, resolveLook, useCatalog } from '../lib/catalog';
import { useTranslation } from '../i18n/LanguageContext';
import { hexToRgba } from '../colorUtils';

export function useLook(ids) {
  const catalog = useCatalog();
  const key = ids ? JSON.stringify(ids) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveLook(catalog, ids), [catalog, key]);
}

// --- nickname -------------------------------------------------------------

export function nameStyleProps(visual) {
  if (!visual) return { className: '', style: undefined };
  const style = {};
  const classes = [];
  if (visual.gradient) {
    style.backgroundImage = `linear-gradient(90deg, ${visual.gradient.join(', ')})`;
    style.WebkitBackgroundClip = 'text';
    style.backgroundClip = 'text';
    style.color = 'transparent';
    if (visual.animated) classes.push('cos-gradient-anim cos-anim');
    if (visual.glow) style.filter = `drop-shadow(0 0 5px ${hexToRgba(visual.glow, 0.65)})`;
  } else {
    if (visual.color) style.color = visual.color;
    if (visual.glow) style.textShadow = `0 0 8px ${hexToRgba(visual.glow, 0.85)}, 0 0 2px ${hexToRgba(visual.glow, 0.9)}`;
  }
  if (visual.shadow) style.textShadow = visual.shadow;
  if (visual.font === 'display') classes.push('font-display');
  if (visual.font === 'mono') classes.push('font-mono');
  if (visual.caps) classes.push('uppercase tracking-wide');
  if (visual.italic) classes.push('italic');
  return { className: classes.join(' '), style };
}

export const StyledName = memo(({
  nickname, cosmetics, look: givenLook, intro = false, showTitle = false, showBadges = false,
  className = '', nameClassName = '', titleSize = 'sm',
}) => {
  const resolved = useLook(givenLook ? null : cosmetics);
  const look = givenLook || resolved;
  const styled = nameStyleProps(look.nameStyle?.visual);
  const decor = look.nameDecor?.visual;
  const introKind = intro ? look.nameIntro?.visual?.kind : null;
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 align-middle ${className}`}>
      {decor?.prefix && <span aria-hidden="true" className="shrink-0 leading-none" style={{ color: decor.color }}>{decor.prefix}</span>}
      <span
        className={`min-w-0 truncate px-[1px] ${styled.className} ${introKind ? `cos-intro-${introKind} cos-anim` : ''} ${nameClassName}`}
        style={styled.style}
        data-text={nickname}
      >
        {nickname}
      </span>
      {decor?.suffix && <span aria-hidden="true" className="shrink-0 leading-none" style={{ color: decor.color }}>{decor.suffix}</span>}
      {showTitle && look.title && <TitleTag item={look.title} size={titleSize} />}
      {showBadges && look.badges.length > 0 && <BadgeStrip items={look.badges} size="xs" />}
    </span>
  );
});

export function TitleTag({ item, size = 'sm', className = '' }) {
  const { language } = useTranslation();
  if (!item) return null;
  const color = item.visual.color || '#cfc4ae';
  const sizes = {
    xs: 'px-1.5 py-[1px] text-[9.5px]',
    sm: 'px-1.5 py-0.5 text-[10.5px] 4xl:text-[12px]',
    md: 'px-2 py-0.5 text-[12px] 4xl:text-[14px]',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-bold uppercase tracking-wide ${sizes[size] || sizes.sm} ${className}`}
      style={{ color, backgroundColor: hexToRgba(color, 0.14), boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.35)}` }}
    >
      {item.visual.text?.[language] || itemName(item, language)}
    </span>
  );
}

export function BadgeIcon({ item, size = 'sm', title }) {
  const { language } = useTranslation();
  if (!item) return null;
  const [a, b] = item.visual.colors || ['#3a3f47', '#1f2417'];
  const sizes = {
    xs: 'h-4 w-4 text-[9px]', sm: 'h-6 w-6 text-[12px]', md: 'h-9 w-9 text-[17px]', lg: 'h-16 w-16 text-[30px]', xl: 'h-24 w-24 text-[46px]',
  };
  return (
    <span
      title={title ?? itemName(item, language)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${sizes[size] || sizes.sm}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, ${a}, ${b})`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 0 1px ${hexToRgba(RARITY_META[item.rarity]?.color || '#fff', 0.45)}`,
      }}
    >
      {item.visual.glyph}
    </span>
  );
}

export function BadgeStrip({ items, size = 'sm' }) {
  if (!items?.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {items.map((item) => <BadgeIcon key={item.id} item={item} size={size} />)}
    </span>
  );
}

// --- avatar frame ---------------------------------------------------------

export function AvatarFrame({ item, children, className = '', thickness = 3 }) {
  const visual = item?.visual;
  if (!visual) return <span className={`relative inline-flex shrink-0 ${className}`}>{children}</span>;
  const colors = visual.colors || ['#e3bb5c'];
  let ring = null;
  const ringMask = {
    WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness - 0.5}px))`,
    mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness - 0.5}px))`,
  };
  if (visual.kind === 'ring') {
    ring = <span className="pointer-events-none absolute -inset-[3px] rounded-full" style={{ boxShadow: `0 0 0 ${thickness}px ${colors[0]}` }} />;
  } else if (visual.kind === 'double') {
    ring = (
      <span
        className="pointer-events-none absolute -inset-[2px] rounded-full"
        style={{ boxShadow: `0 0 0 2px ${colors[0]}, 0 0 0 4px rgba(0,0,0,0.55), 0 0 0 6px ${colors[1] || colors[0]}` }}
      />
    );
  } else if (visual.kind === 'laurel') {
    ring = (
      <>
        <span className="pointer-events-none absolute -inset-[5px] rounded-full border-[3px] border-dotted" style={{ borderColor: colors[0] }} />
        <span className="pointer-events-none absolute -inset-[2px] rounded-full" style={{ boxShadow: `0 0 0 1.5px ${colors[1] || colors[0]}` }} />
      </>
    );
  } else {
    const gradient = visual.kind === 'flame'
      ? `conic-gradient(from 0deg, ${colors.join(', ')}, ${colors[0]})`
      : `conic-gradient(${colors.join(', ')}, ${colors[0]})`;
    ring = (
      <span
        className={`pointer-events-none absolute -inset-[4px] rounded-full ${visual.animated ? 'cos-spin cos-anim' : ''}`}
        style={{
          background: gradient,
          ...ringMask,
          filter: visual.kind === 'flame' ? `drop-shadow(0 0 6px ${hexToRgba(colors[1] || colors[0], 0.8)})` : undefined,
        }}
      />
    );
  }
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {children}
      {ring}
    </span>
  );
}

// --- board token ----------------------------------------------------------

export const TOKEN_SHAPES = {
  shield: 'polygon(50% 0, 100% 14%, 94% 62%, 50% 100%, 6% 62%, 0 14%)',
  hex: 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)',
  diamond: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
  star: 'polygon(50% 0%, 62% 34%, 98% 35%, 69% 57%, 80% 92%, 50% 71%, 20% 92%, 31% 57%, 2% 35%, 38% 34%)',
  crest: 'polygon(50% 0, 64% 10%, 84% 6%, 92% 24%, 100% 38%, 90% 62%, 72% 86%, 50% 100%, 28% 86%, 10% 62%, 0 38%, 8% 24%, 16% 6%, 36% 10%)',
};

function frameBackground(visual) {
  if (!visual) return null;
  const colors = visual.colors || ['#ffffff'];
  if (visual.style === 'gradient') return `conic-gradient(${colors.join(', ')}, ${colors[0]})`;
  if (visual.style === 'double') return `radial-gradient(circle, ${colors[1] || colors[0]} 58%, ${colors[0]} 60%)`;
  return colors[0];
}

function Aura({ visual }) {
  const [a, b = a, c = b] = visual.colors || ['#ffffff'];
  if (visual.kind === 'sparkle') {
    return (
      <span className="pointer-events-none absolute -inset-[35%] -z-10">
        {[[12, 20, 0], [80, 14, 0.4], [88, 70, 0.9], [18, 82, 1.3], [50, 0, 0.7], [50, 96, 1.6]].map(([x, y, d]) => (
          <span
            key={`${x}-${y}`}
            className="cos-twinkle cos-anim absolute h-[14%] w-[14%] rounded-full"
            style={{
              left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, background: `radial-gradient(circle, ${b}, ${hexToRgba(a, 0)} 70%)`,
            }}
          />
        ))}
      </span>
    );
  }
  if (visual.kind === 'orbit') {
    return (
      <span className="cos-spin-slow cos-anim pointer-events-none absolute -inset-[30%] -z-10 rounded-full" style={{ boxShadow: `inset 0 0 0 1px ${hexToRgba(a, 0.25)}` }}>
        <span className="absolute left-1/2 top-0 h-[16%] w-[16%] -translate-x-1/2 rounded-full" style={{ background: a, boxShadow: `0 0 6px ${a}` }} />
        <span className="absolute bottom-[8%] left-[10%] h-[11%] w-[11%] rounded-full" style={{ background: b, boxShadow: `0 0 5px ${b}` }} />
      </span>
    );
  }
  if (visual.kind === 'void') {
    return (
      <span
        className="cos-spin cos-anim pointer-events-none absolute -inset-[34%] -z-10 rounded-full opacity-90"
        style={{ background: `conic-gradient(${a}, ${b}, ${c}, ${b}, ${a})`, filter: 'blur(3px)' }}
      />
    );
  }
  const animation = { pulse: 'cos-pulse', flicker: 'cos-flicker' }[visual.kind] || '';
  return (
    <span
      className={`pointer-events-none absolute -inset-[28%] -z-10 rounded-full ${animation} ${animation ? 'cos-anim' : ''}`}
      style={{ background: `radial-gradient(circle, ${hexToRgba(a, 0.75)} 0%, ${hexToRgba(b, 0.35)} 45%, transparent 70%)` }}
    />
  );
}

const TRAIL_PARTICLES = [
  [-0.9, 0.2, 0], [-0.7, -0.5, 0.05], [-1.1, 0.6, 0.1], [0.2, 0.9, 0.08], [-0.3, -0.95, 0.12], [0.8, 0.6, 0.15], [-1.2, -0.1, 0.18], [0.5, -0.8, 0.2],
];

function Trail({ visual }) {
  const colors = visual.colors || ['#ffffff'];
  const kind = visual.kind;
  return (
    <span className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      {TRAIL_PARTICLES.map(([x, y, delay], i) => {
        const color = kind === 'rainbow' ? colors[i % colors.length] : colors[i % colors.length];
        const size = kind === 'comet' ? '46%' : kind === 'sparks' ? '16%' : '24%';
        return (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={`cos-trail-p cos-anim ${kind === 'petals' ? 'rounded-[60%_0_60%_0]' : ''}`}
            style={{
              width: size,
              height: kind === 'comet' ? '18%' : size,
              background: kind === 'comet' ? `linear-gradient(90deg, transparent, ${color})` : color,
              boxShadow: kind === 'sparks' || kind === 'comet' ? `0 0 6px ${color}` : undefined,
              '--dx': `${x * 90}%`,
              '--dy': `${y * 90}%`,
              '--delay': `${delay}s`,
              '--dur': kind === 'dust' ? '0.9s' : '0.6s',
            }}
          />
        );
      })}
    </span>
  );
}

// Wraps a token avatar with the owner's token cosmetics. `hop` changes
// every time the token moves a square, which replays the trail.
export function TokenDecor({
  look, color, hop = null, children, className = '',
}) {
  const shape = look?.tokenShape?.visual?.shape;
  const frame = look?.tokenFrame?.visual;
  const aura = look?.tokenAura?.visual;
  const trail = look?.tokenTrail?.visual;
  return (
    <div className={`relative isolate h-full w-full ${className}`}>
      {aura && <Aura visual={aura} />}
      {trail && hop != null && <Trail key={hop} visual={trail} />}
      {shape && TOKEN_SHAPES[shape] ? (
        <div
          className={`absolute inset-0 ${frame?.animated ? 'cos-hue cos-anim' : ''}`}
          style={{ clipPath: TOKEN_SHAPES[shape], background: frameBackground(frame) || 'rgba(255,255,255,0.95)' }}
        >
          <div className="absolute inset-[12%] flex items-center justify-center" style={{ clipPath: TOKEN_SHAPES[shape], background: color }}>
            {children}
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full">
          {children}
          {frame && (
            <span
              className={`pointer-events-none absolute -inset-[3px] rounded-full ${frame.animated ? 'cos-spin cos-anim' : ''}`}
              style={{
                background: frameBackground(frame),
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4.5px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4.5px))',
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// A small mark for the end-of-game standings: a medal, a burst, a crown.
export function VictoryMark({ item, place }) {
  const visual = item?.visual;
  if (!visual) return null;
  const earned = visual.on === 'podium' ? place && place <= 3 : place === 1;
  if (!earned) return null;
  const medal = ['🥇', '🥈', '🥉'][place - 1] || '🏅';
  const glyph = { medal, crown: '👑', burst: '✨', supernova: '🌟' }[visual.kind] || '✨';
  return (
    <span className="cos-pop cos-anim inline-flex h-6 w-6 items-center justify-center text-[16px]" aria-hidden="true">
      {glyph}
    </span>
  );
}

// --- emotes ---------------------------------------------------------------

export function Emote({
  item, size = 'md', loop = false, className = '',
}) {
  if (!item) return null;
  const sizes = {
    sm: 'text-[18px]', md: 'text-[30px]', lg: 'text-[48px]', xl: 'text-[72px]',
  };
  const anim = item.visual.anim ? `emo-${item.visual.anim}` : '';
  return (
    <span
      className={`inline-block leading-none ${sizes[size] || sizes.md} ${anim} cos-anim ${loop ? 'emo-loop' : ''} ${className}`}
      role="img"
      aria-label={item.name.en}
    >
      {item.visual.glyph}
    </span>
  );
}

// --- profile --------------------------------------------------------------

export function profileBackdropStyle(item) {
  const visual = item?.visual;
  if (!visual) return {};
  const [a, b, c] = visual.colors || ['#1b1710', '#121418'];
  const layers = [];
  if (visual.pattern === 'dots') layers.push('radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1.6px)');
  if (visual.pattern === 'grid') {
    const accent = hexToRgba(visual.accent || '#e3bb5c', 0.09);
    layers.push(`linear-gradient(${accent} 1px, transparent 1px)`, `linear-gradient(90deg, ${accent} 1px, transparent 1px)`);
  }
  if (visual.pattern === 'stars') {
    layers.push(
      'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.8), transparent)',
      'radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.6), transparent)',
      'radial-gradient(1.5px 1.5px at 45% 80%, rgba(255,255,255,0.7), transparent)',
      'radial-gradient(1px 1px at 85% 15%, rgba(255,255,255,0.7), transparent)',
    );
  }
  layers.push(`linear-gradient(135deg, ${[a, b, c].filter(Boolean).join(', ')})`);
  const sizes = layers.map((layer) => {
    if (layer.startsWith('radial-gradient(circle')) return '14px 14px';
    if (layer.startsWith('linear-gradient(rgba') || layer.startsWith('linear-gradient(90deg, rgba')) return '28px 28px';
    if (layer.startsWith('radial-gradient(1')) return '160px 160px';
    return visual.animated ? '220% 220%' : '100% 100%';
  });
  return {
    backgroundImage: layers.join(', '),
    backgroundSize: sizes.join(', '),
  };
}

export function profileCardStyle(item) {
  const visual = item?.visual;
  if (!visual) return {};
  return {
    borderColor: visual.border,
    boxShadow: `0 0 0 1px ${visual.border}, 0 20px 50px -30px ${visual.accent}`,
  };
}

// --- rarity ---------------------------------------------------------------

export function RarityLabel({ rarity, className = '' }) {
  const { t } = useTranslation();
  const meta = RARITY_META[rarity] || RARITY_META.common;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide 4xl:text-[12px] ${className}`}
      style={{ color: meta.color, backgroundColor: meta.soft }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.gradient || meta.color }} />
      {t(`rarity.${rarity}`)}
    </span>
  );
}
