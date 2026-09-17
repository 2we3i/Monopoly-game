// ItemPreview.jsx
// Seeing an item in action before buying it: a token moving across a
// strip of the board, a nickname in a chat line and on a player card, a
// profile header, an effect playing, an emote, a sound. Every preview
// shows the item together with the rest of what the player already wears.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { itemName, resolveLook, withItem } from '../../lib/catalog';
import {
  AvatarFrame, BadgeIcon, BadgeStrip, Emote, StyledName, TitleTag, TokenDecor, VictoryMark,
  profileBackdropStyle, profileCardStyle, useLook,
} from '../../cosmetics/Cosmetics';
import { EffectStage } from '../../cosmetics/effects';
import { playSoundPreset } from '../../cosmetics/sounds';
import PieceGlyph from '../tokenArt';
import { DashIcon } from '../ui/dash';

const EFFECT_GLYPH = {
  confetti: '🎉', fireworks: '🎆', coins: '🪙', rain: '🌧️', ash: '🌫️', banner: '🤝', spotlight: '🔦', shockwave: '💥', sparkle: '✨', portal: '🌀', lightning: '⚡', rise: '⬆️',
};
const SOUND_GLYPH = {
  drum: '🥁', horn: '📯', fanfare: '🎺', choir: '🎶', coin: '🪙', harp: '🎼', bell: '🔔', arcade: '👾',
};

function TokenDisc({ look, size = 44, hop = null }) {
  return (
    <div style={{ width: size, height: size }}>
      <TokenDecor look={look} color="#c9982f" hop={hop}>
        <span className={`flex h-full w-full items-center justify-center rounded-full ${look.tokenFrame || look.tokenShape ? '' : 'ring-[3px] ring-white/95'}`} style={{ backgroundColor: '#c9982f' }}>
          <PieceGlyph piece="hat" className="h-[64%] w-[64%]" style={{ color: 'rgba(31,36,23,0.8)' }} />
        </span>
      </TokenDecor>
    </div>
  );
}

// A name for a board square: its picture (or glyph) under the name.
function FieldNameThumb({ item, language }) {
  const v = item.visual || {};
  const name = v.names?.[language] || v.names?.en || itemName(item, language);
  const [from, to] = v.colors?.length ? v.colors : ['#e3bb5c', '#3d2e0f'];
  return (
    <span className="flex h-20 w-16 flex-col overflow-hidden rounded-md border border-ink/20 bg-board-tile shadow-tile 4xl:h-24 4xl:w-20">
      <span className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} />
      <span className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {item.image
          ? <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" />
          : <span className="text-[24px] leading-none">{v.glyph || '🏷️'}</span>}
      </span>
      <span className="line-clamp-2 px-1 pb-1 text-center text-[8.5px] font-bold uppercase leading-tight text-ink 4xl:text-[10px]">{name}</span>
    </span>
  );
}

export function fieldTargetText(item, t) {
  const target = item?.visual?.target || {};
  const board = target.layout && target.layout !== '*' ? target.layout : null;
  const where = board ? '' : ` ${t('field.anyBoard')}`;
  if (Number.isInteger(target.tileId)) return t('field.target.tile', { tile: target.tileId, board: board || '*' });
  if (target.group) return `${t('field.target.group', { group: target.group })}${where}`;
  if (target.tileType) return `${t(`field.target.type.${target.tileType}`)}${where}`;
  return `${t('field.target.any')}${where}`;
}

function FieldStage({ item }) {
  const { t, language } = useTranslation();
  const v = item.visual || {};
  const name = v.names?.[language] || v.names?.en || itemName(item, language);
  const [from, to] = v.colors?.length ? v.colors : ['#e3bb5c', '#3d2e0f'];
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-gradient-to-b from-[#f7efdd] to-[#e6d7b9] p-4 shadow-inner">
      <div className="flex items-end gap-1.5">
        {['#c4453a', null, '#3a6ea8'].map((c, i) => (c ? (
          <div key={c} className="relative h-24 w-14 rounded-md border border-ink/15 bg-board-tile opacity-60 4xl:h-32 4xl:w-20">
            <span className="absolute inset-x-0 top-0 h-3 rounded-t-md" style={{ backgroundColor: c }} />
          </div>
        ) : (
          <div key={i} className="relative flex h-32 w-24 flex-col overflow-hidden rounded-md border-2 border-brass bg-board-tile shadow-lift 4xl:h-44 4xl:w-32">
            <span className="h-3.5 w-full" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} />
            <span className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              {item.image
                ? <img src={item.image} alt="" className="h-full w-full object-cover" />
                : <span className="text-[34px] leading-none">{v.glyph || '🏷️'}</span>}
            </span>
            <span className="px-1 py-1 text-center text-[10px] font-bold uppercase leading-tight text-ink 4xl:text-[12px]">{name}</span>
          </div>
        )))}
      </div>
      <p className="rounded-full bg-ink/80 px-3 py-1 text-[11.5px] font-semibold text-parch">{fieldTargetText(item, t)}</p>
      <p className="text-center text-[12px] text-ink/70">{t('field.previewHint')}</p>
      {item.description?.[language] && <p className="text-center text-[12px] text-ink/80">{item.description[language]}</p>}
    </div>
  );
}

// A small, mostly still picture of an item, for cards and lists.
export function ItemThumb({ item, nickname = 'Player' }) {
  const look = useMemo(() => resolveLook(null, null), []);
  const { language } = useTranslation();
  if (!item) return null;
  const single = { ...look, [slotKey(item.slot)]: item };
  switch (item.category) {
    case 'token':
      return <TokenDisc look={single} size={46} />;
    case 'nickname':
      return <span className="max-w-full px-2 text-[17px] font-bold 4xl:text-[21px]"><StyledName nickname={nickname} look={single} /></span>;
    case 'avatar':
      return (
        <AvatarFrame item={item}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/25 font-display text-[20px] font-black text-brass-light">{nickname.slice(0, 1)}</span>
        </AvatarFrame>
      );
    case 'profile':
      return (
        <span
          className="block h-14 w-24 rounded-lg border-2"
          style={item.slot === 'profile_bg' ? { ...profileBackdropStyle(item), borderColor: 'rgba(255,255,255,0.1)' } : { background: '#16181d', ...profileCardStyle(item) }}
        />
      );
    case 'effects':
      return <span className="text-[34px] leading-none 4xl:text-[42px]">{EFFECT_GLYPH[item.visual.kind] || '✨'}</span>;
    case 'titles':
      return <TitleTag item={item} size="md" />;
    case 'badges':
      return <BadgeIcon item={item} size="md" />;
    case 'emotes':
      return <span className="text-[36px] leading-none 4xl:text-[44px]">{item.visual.glyph}</span>;
    case 'sounds':
      return <span className="text-[32px] leading-none 4xl:text-[40px]">{SOUND_GLYPH[item.visual.preset] || '🔊'}</span>;
    case 'fields':
      return <FieldNameThumb item={item} language={language} />;
    default:
      return item.image ? <img src={item.image} alt="" className="h-16 w-16 rounded-lg object-cover" /> : null;
  }
}

function slotKey(slot) {
  return {
    token_shape: 'tokenShape',
    token_frame: 'tokenFrame',
    token_aura: 'tokenAura',
    token_trail: 'tokenTrail',
    token_victory: 'tokenVictory',
    name_style: 'nameStyle',
    name_decor: 'nameDecor',
    name_intro: 'nameIntro',
    avatar_frame: 'avatarFrame',
    profile_bg: 'profileBg',
    profile_card: 'profileCard',
    title: 'title',
    effect_join: 'effectJoin',
    effect_win: 'effectWin',
    effect_loss: 'effectLoss',
    effect_reward: 'effectReward',
    effect_rankup: 'effectRankup',
    effect_podium: 'effectPodium',
  }[slot] || slot;
}

const TILE_COLORS = ['#c4453a', '#e08a3c', '#e8cf4a', '#3f9463', '#3a6ea8', '#7a5fb8'];

function TokenStage({ look }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 900);
    return () => clearInterval(id);
  }, []);
  const tile = step % TILE_COLORS.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-xl bg-gradient-to-b from-[#f7efdd] to-[#e6d7b9] p-2 shadow-inner">
        <div className="grid grid-cols-6 gap-1">
          {TILE_COLORS.map((c) => (
            <div key={c} className="relative h-16 rounded-md border border-ink/15 bg-board-tile 4xl:h-24">
              <span className="absolute inset-x-0 top-0 h-2.5 rounded-t-md" style={{ backgroundColor: c }} />
            </div>
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-1/2 transition-[left] duration-500 ease-[cubic-bezier(0.34,1.2,0.44,1)]"
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${(tile + 0.5) / 6})`, transform: 'translate(-50%, -38%)' }}
        >
          <TokenDisc look={look} size={40} hop={step} />
        </div>
      </div>
      {look.tokenVictory && (
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-[12.5px] text-zinc-300">
          <span className="w-4 font-bold text-zinc-500">1</span>
          <TokenDisc look={look} size={26} />
          <span className="flex-1">{t('preview.standingsSample')}</span>
          <VictoryMark item={look.tokenVictory} place={1} />
        </div>
      )}
    </div>
  );
}

function NameStage({ look, nickname }) {
  const { t } = useTranslation();
  const [replay, setReplay] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-[radial-gradient(ellipse_at_top,rgba(201,152,47,0.12),transparent_70%)] px-4 py-6 4xl:min-h-[10rem]">
        <p key={replay} className="max-w-full text-[26px] font-bold text-parch 4xl:text-[34px]">
          <StyledName nickname={nickname} look={look} intro />
        </p>
        <div className="flex items-center gap-1.5">
          {look.title && <TitleTag item={look.title} />}
          <BadgeStrip items={look.badges} size="sm" />
        </div>
        {look.nameIntro && (
          <button type="button" onClick={() => setReplay((r) => r + 1)} className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            <DashIcon name="refresh" className="h-3.5 w-3.5" />
            {t('preview.replay')}
          </button>
        )}
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-felt-700/70 p-3 text-[12.5px] 4xl:text-[14.5px]">
        <p className="section-label mb-1.5">{t('preview.inChat')}</p>
        <p className="text-parch/80">
          <span className="font-bold text-brass-light"><StyledName nickname={nickname} look={look} /></span>
          <span className="text-parch/40">: </span>
          {t('preview.chatSample')}
        </p>
      </div>
    </div>
  );
}

function ProfileStage({ look, nickname, avatarPath }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07]" style={profileCardStyle(look.profileCard)}>
      <div className={`flex items-center gap-3 p-4 4xl:p-6 ${look.profileBg?.visual?.animated ? 'cos-gradient-anim cos-anim' : ''}`} style={look.profileBg ? profileBackdropStyle(look.profileBg) : { background: 'linear-gradient(135deg,#1b1710,#131418)' }}>
        <AvatarFrame item={look.avatarFrame} thickness={4}>
          {avatarPath
            ? <img src={avatarPath} alt="" className="h-16 w-16 rounded-full object-cover 4xl:h-20 4xl:w-20" />
            : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brass/25 font-display text-[26px] font-black text-brass-light 4xl:h-20 4xl:w-20">{nickname.slice(0, 1)}</span>}
        </AvatarFrame>
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-semibold text-zinc-50 4xl:text-[26px]"><StyledName nickname={nickname} look={look} intro /></p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {look.title && <TitleTag item={look.title} />}
            <BadgeStrip items={look.badges} size="sm" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/[0.05] text-center">
        {['42', '17', '40%'].map((v, i) => (
          <div key={v} className="bg-[#121418] py-2.5">
            <p className="text-[17px] font-semibold tnum 4xl:text-[21px]" style={{ color: i === 1 ? look.profileCard?.visual?.accent || '#f4f4f5' : '#f4f4f5' }}>{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EffectPreview({ item, nickname }) {
  const { t } = useTranslation();
  const [key, setKey] = useState(1);
  useEffect(() => { setKey((k) => k + 1); }, [item.id]);
  const headline = {
    effect_win: t('preview.effectWin'),
    effect_loss: t('preview.effectLoss'),
    effect_reward: t('preview.effectReward'),
    effect_rankup: t('preview.effectRankup'),
    effect_podium: t('preview.effectPodium'),
    effect_join: t('preview.effectJoin', { name: nickname }),
  }[item.slot];
  return (
    <div className="flex flex-col gap-2">
      <EffectStage visual={item.visual} playKey={key} className="aspect-video rounded-xl border border-white/[0.07] bg-[radial-gradient(ellipse_at_center,#1b2a22,#0a0b0d)]">
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="font-display text-[22px] font-black text-parch/80 4xl:text-[30px]">{headline}</p>
        </div>
      </EffectStage>
      <button type="button" onClick={() => setKey((k) => k + 1)} className="inline-flex items-center justify-center gap-1.5 self-center rounded-lg border border-white/10 px-3 py-1.5 text-[12.5px] text-zinc-300 hover:bg-white/[0.06]">
        <DashIcon name="play" className="h-3.5 w-3.5" />
        {t('preview.play')}
      </button>
    </div>
  );
}

export default function ItemPreview({
  item, loadout, nickname = 'Player', avatarPath = null,
}) {
  const { t, language } = useTranslation();
  // The player's loadout with this item put on.
  const ids = useMemo(() => withItem(loadout, item), [loadout, item]);
  const look = useLook(ids);
  if (!item) return null;

  let stage;
  switch (item.category) {
    case 'token':
      stage = <TokenStage look={look} />;
      break;
    case 'nickname':
    case 'titles':
    case 'badges':
      stage = <NameStage look={look} nickname={nickname} />;
      break;
    case 'avatar':
    case 'profile':
      stage = <ProfileStage look={look} nickname={nickname} avatarPath={avatarPath} />;
      break;
    case 'effects':
      stage = <EffectPreview item={item} nickname={nickname} />;
      break;
    case 'emotes':
      stage = (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.07] bg-felt-700/60 px-4 py-6">
          <Emote item={item} size="xl" loop />
          <p className="rounded-2xl rounded-bl-sm bg-white/[0.07] px-3 py-1.5 text-[13px] text-parch">
            <span className="font-bold text-brass-light"><StyledName nickname={nickname} look={look} /></span>
            {' '}
            <Emote item={item} size="sm" />
          </p>
        </div>
      );
      break;
    case 'sounds':
      stage = (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-4 py-8">
          <span className="text-[56px] leading-none">{SOUND_GLYPH[item.visual.preset] || '🔊'}</span>
          <button type="button" onClick={() => playSoundPreset(item.visual.preset)} className="btn-primary px-4 py-2">
            <DashIcon name="volume" className="h-4 w-4" />
            {t('preview.listen')}
          </button>
          <p className="text-center text-[12px] text-zinc-500">{t(`preview.sound.${item.slot}`)}</p>
        </div>
      );
      break;
    case 'fields':
      stage = <FieldStage item={item} />;
      break;
    default:
      stage = item.image ? <img src={item.image} alt="" className="mx-auto max-h-64 rounded-xl object-contain" /> : null;
  }
  return (
    <div className="flex flex-col gap-2" data-preview={item.id}>
      {stage}
      <p className="text-center text-[11px] text-zinc-500 4xl:text-[12.5px]">{t('preview.withYourLook', { item: itemName(item, language) })}</p>
    </div>
  );
}
