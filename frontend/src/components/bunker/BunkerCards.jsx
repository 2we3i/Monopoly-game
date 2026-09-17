// BunkerCards.jsx
// The action-card hand, the picker that aims a card, and the public record
// of what has been played.
//
// The client never decides whether a card is legal: the server sends
// `you.playable`, one entry per card in hand, saying whether it can be
// played right now and - when it cannot - why not. This file only draws
// that answer and collects the target the card asks for.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import Modal from '../Modal';
import Icon from '../icons';
import { CHAR_ORDER, CharIcon, cardText } from './bunkerText';

// The picture on each card's face. Cards the server adds later fall back
// to a neutral glyph rather than rendering blank.
const CARD_GLYPH = {
  peek_characteristic: '👁️',
  peek_baggage: '🎒',
  expose_secret: '🗝️',
  inspect_item: '🔍',
  hide_characteristic: '🙈',
  swap_characteristic: '🔄',
  block_reveal: '🤐',
  demand_reveal: '📢',
  extra_reveal: '➕',
  swap_baggage: '↔️',
  protect_player: '🛡️',
  immunity: '✨',
  double_vote: '✌️',
  change_vote: '🔀',
  cancel_vote: '🚫',
  postpone_vote: '⏸️',
  random_event: '🎲',
  impersonate: '🎭',
};

const glyphOf = (id) => CARD_GLYPH[id] || '🃏';

// What a card needs to be pointed at, mirrored from the server's own
// declaration so the picker asks for exactly that and nothing more.
const NEEDS_PLAYER = ['player', 'anyPlayer', 'playerCharacteristic'];
const NEEDS_KEY = ['ownCharacteristic', 'playerCharacteristic'];

export function CardFace({
  id, size = 'md', dimmed = false, onClick, disabled, selected, badge, t,
}) {
  const big = size === 'lg';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={t(`bunker.card.${id}.text`)}
      className={`relative flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-all ${
        big ? 'min-h-[7.5rem] w-full' : 'min-w-[5.5rem]'
      } ${
        selected
          ? 'border-brass bg-brass/[0.14] shadow-[0_0_0_1px_rgba(201,152,47,0.5)]'
          : dimmed
            ? 'border-white/[0.06] bg-black/30 opacity-45'
            : 'border-violet-400/25 bg-violet-400/[0.07]'
      } ${onClick && !disabled ? 'cursor-pointer hover:-translate-y-0.5 hover:border-brass/60' : 'cursor-default'}`}
    >
      <span className={big ? 'text-[26px] leading-none' : 'text-[19px] leading-none'} aria-hidden="true">{glyphOf(id)}</span>
      <span className={`font-semibold leading-tight text-parch ${big ? 'text-[12.5px]' : 'text-[11px]'}`}>
        {t(`bunker.card.${id}.name`)}
      </span>
      {big && <span className="text-[10.5px] leading-snug text-parch/45">{t(`bunker.card.${id}.text`)}</span>}
      {badge && <span className="pill bg-black/45 text-[9.5px] text-parch/55">{badge}</span>}
    </button>
  );
}

// Aims one card: picks the player and/or the characteristic it needs, then
// plays it. A card that needs nothing is played straight from the hand.
function AimModal({
  card, def, state, config, language, t, onCancel, onPlay,
}) {
  const [targetId, setTargetId] = useState(null);
  const [key, setKey] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const needsPlayer = NEEDS_PLAYER.includes(def.target);
  const needsKey = NEEDS_KEY.includes(def.target);
  const ownKeys = def.target === 'ownCharacteristic';

  const me = state.players.find((p) => p.isYou);
  const candidates = state.players.filter((p) => p.status === 'alive'
    && (def.target === 'anyPlayer' ? true : !p.isYou));

  // Which characteristics this card may be pointed at.
  const keyOptions = useMemo(() => {
    const inPlay = CHAR_ORDER.filter((k) => (state.categories || []).includes(k));
    const pool = def.keyFilter === 'baggage' ? inPlay.filter((k) => k.startsWith('baggage')) : inPlay;
    if (!ownKeys) return pool;
    // A card that acts on one of YOUR cards may need it already face up.
    return def.requiresRevealed ? pool.filter((k) => me?.revealed.includes(k)) : pool;
  }, [state.categories, def.keyFilter, def.requiresRevealed, ownKeys, me]);

  useEffect(() => { setError(null); }, [targetId, key]);

  const subject = ownKeys ? me : state.players.find((p) => p.id === targetId);
  const ready = (!needsPlayer || targetId) && (!needsKey || key);

  const play = async () => {
    setBusy(true);
    const res = await onPlay({ cardId: card.id, index: card.index, targetId, key });
    setBusy(false);
    if (res && res.ok === false) setError(res.error || t('bunker.cards.failed'));
  };

  return (
    <Modal
      onClose={onCancel}
      widthClass="max-w-lg"
      title={t(`bunker.card.${card.id}.name`)}
      subtitle={t(`bunker.card.${card.id}.text`)}
      icon={<span className="text-[20px]" aria-hidden="true">{glyphOf(card.id)}</span>}
      footer={(
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-quiet flex-1 py-2.5">{t('common.cancel')}</button>
          <button type="button" onClick={play} disabled={!ready || busy} className="btn-primary flex-[2] py-2.5">
            {t('bunker.cards.play')}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="pill bg-white/[0.07] text-parch/60">{t(`bunker.cards.stage.${def.stage}`)}</span>
          <span className="pill bg-white/[0.07] text-parch/60">{t(`bunker.cards.duration.${def.duration}`)}</span>
          <span className="pill bg-white/[0.07] text-parch/60">{t(`bunker.cards.target.${def.target}`)}</span>
        </div>

        {needsPlayer && (
          <div>
            <p className="section-label mb-1.5">{t('bunker.cards.pickPlayer')}</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetId(p.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                    targetId === p.id ? 'border-brass bg-brass/[0.14] text-parch' : 'border-white/10 bg-black/25 text-parch/70 hover:border-white/25'
                  }`}
                >
                  <span className="font-mono text-parch/50 tnum">№{p.number}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.nickname}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {needsKey && (
          <div>
            <p className="section-label mb-1.5">
              {ownKeys ? t('bunker.cards.pickOwnKey') : t('bunker.cards.pickKey')}
            </p>
            {keyOptions.length === 0 ? (
              <p className="text-[12.5px] text-parch/45">{t('bunker.cards.noKeys')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {keyOptions.map((k) => {
                  const value = subject?.cards?.[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKey(k)}
                      className={`flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                        key === k ? 'border-brass bg-brass/[0.14]' : 'border-white/10 bg-black/25 hover:border-white/25'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-parch/80">
                        <CharIcon name={k} className="h-3.5 w-3.5 text-parch/45" />
                        {t(`bunker.char.${k}`)}
                      </span>
                      <span className="truncate text-[11px] text-parch/45">
                        {value ? cardText(config, k, value, language, t) : t('bunker.hidden')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <p className="rounded-lg bg-rent/15 px-2.5 py-2 text-[12.5px] text-rent-light">{error}</p>}
      </div>
    </Modal>
  );
}

// The hand: every card this player holds, whether it can be played, and
// why not when it cannot.
export function HandPanel({
  state, config, language, t, onPlay, spectating,
}) {
  const [aiming, setAiming] = useState(null);
  const you = state.you;
  const defs = useMemo(
    () => Object.fromEntries((config?.schema?.actionCards || []).map((d) => [d.id, d])),
    [config],
  );

  // Aiming a card that is no longer playable (the phase moved on) closes.
  useEffect(() => {
    if (!aiming) return;
    const still = you?.playable?.find((c) => c.index === aiming.index && c.playable);
    if (!still) setAiming(null);
  }, [state.phase, state.round, you, aiming]);

  if (spectating || !you || !state.settings.actionCards.enabled) return null;
  const hand = you.playable || [];
  if (!hand.length) {
    return (
      <section className="bunker-plate p-3 4xl:p-4">
        <p className="section-label mb-1">🃏 {t('bunker.cards.title')}</p>
        <p className="text-[12.5px] text-parch/40">{t('bunker.cards.empty')}</p>
      </section>
    );
  }

  const limits = state.settings.actionCards;
  const usesLeft = limits.maxUsesPerRound > 0
    ? Math.max(0, limits.maxUsesPerRound - (you.cardUses?.round || 0))
    : null;

  const start = (card) => {
    const def = defs[card.id];
    if (!def) return;
    // A card that needs no aiming is played straight away.
    if (def.target === 'none' || def.target === 'self') {
      onPlay({ cardId: card.id, index: card.index, targetId: null, key: null });
      return;
    }
    setAiming(card);
  };

  return (
    <section className="bunker-plate p-3 4xl:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="section-label flex-1">🃏 {t('bunker.cards.title')}</p>
        {usesLeft !== null && (
          <span className={`pill ${usesLeft > 0 ? 'bg-white/[0.07] text-parch/60' : 'bg-rent/20 text-rent-light'}`}>
            {t('bunker.cards.usesLeft', { n: usesLeft })}
          </span>
        )}
      </div>
      <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {hand.map((card) => (
          <div key={`${card.index}-${card.id}`} className="w-[7.5rem] shrink-0 4xl:w-[9rem]">
            <CardFace
              id={card.id}
              size="lg"
              t={t}
              dimmed={!card.playable}
              disabled={!card.playable}
              onClick={card.playable ? () => start(card) : undefined}
              badge={card.playable ? null : t(`bunker.cards.reason.${card.reason}`)}
            />
          </div>
        ))}
      </div>

      {aiming && defs[aiming.id] && (
        <AimModal
          card={aiming}
          def={defs[aiming.id]}
          state={state}
          config={config}
          language={language}
          t={t}
          onCancel={() => setAiming(null)}
          onPlay={async (payload) => {
            const res = await onPlay(payload);
            if (!res || res.ok !== false) setAiming(null);
            return res;
          }}
        />
      )}
    </section>
  );
}

// The public record: who played what, and at whom. A card whose whole
// point was that only its owner learned something says so and no more.
export function CardHistory({ state, t }) {
  const entries = (state.cardHistory || []).slice(-25).reverse();
  if (!entries.length) return null;
  return (
    <section className="bunker-plate flex max-h-56 flex-col overflow-hidden 4xl:max-h-80">
      <p className="section-label shrink-0 border-b border-white/[0.07] px-3 py-2">🃏 {t('bunker.cards.history')}</p>
      <ol className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {entries.map((e, i) => {
          const target = state.players.find((p) => p.id === e.params?.targetId);
          return (
            <li
              // eslint-disable-next-line react/no-array-index-key
              key={`${e.ts}-${i}`}
              className="flex items-start gap-1.5 text-[12px] leading-snug text-parch/70"
            >
              <span aria-hidden="true">{glyphOf(e.cardId)}</span>
              <span className="min-w-0 flex-1">
                <b className="text-parch/90">№{e.byNumber}</b>
                {' '}
                {t('bunker.cards.played', { card: t(`bunker.card.${e.cardId}.name`) })}
                {target && <span className="text-parch/50"> → №{target.number}</span>}
                {e.params?.key && <span className="text-parch/50"> · {t(`bunker.char.${e.params.key}`)}</span>}
                {e.secret && <span className="text-parch/35"> · {t('bunker.cards.secretResult')}</span>}
              </span>
              <span className="shrink-0 text-[10.5px] text-parch/25 tnum">R{e.round}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// What cards and events have told THIS player privately, and nobody else.
export function PrivateFeed({
  state, config, language, t,
}) {
  const results = (state.you?.results || []).slice(-6).reverse();
  if (!results.length) return null;
  const nameOf = (id) => {
    const p = state.players.find((x) => x.id === id);
    return p ? `№${p.number} ${p.nickname}` : '?';
  };
  return (
    <section className="bunker-plate flex flex-col gap-1.5 p-3">
      <p className="section-label">🔒 {t('bunker.cards.private')}</p>
      {results.map((r, i) => {
        let text = null;
        if (r.type === 'PEEKED') {
          text = t('bunker.private.peeked', {
            name: nameOf(r.params.targetId),
            key: t(`bunker.char.${r.params.key}`),
            value: cardText(config, r.params.key, r.params.card, language, t),
          });
        } else if (r.type === 'PEEKED_BAGGAGE') {
          const list = (r.params.items || [])
            .map((item) => cardText(config, item.key, item.card, language, t))
            .filter(Boolean)
            .join(', ');
          text = t('bunker.private.peekedBaggage', { name: nameOf(r.params.targetId), list: list || '—' });
        } else if (r.type === 'SWAPPED') {
          text = t('bunker.private.swapped', {
            key: t(`bunker.char.${r.params.key}`),
            from: cardText(config, r.params.key, r.params.from, language, t),
            to: cardText(config, r.params.key, r.params.to, language, t),
          });
        }
        if (!text) return null;
        return (
          <p
            // eslint-disable-next-line react/no-array-index-key
            key={`${r.ts}-${i}`}
            className="rounded-lg bg-brass/[0.1] px-2.5 py-1.5 text-[12px] leading-snug text-brass-light"
          >
            {text}
          </p>
        );
      })}
    </section>
  );
}

// The event that has just changed the shelter.
export function EventBanner({ state, t }) {
  const event = state.activeEvent;
  if (!event) return null;
  return (
    <section className="bunker-plate bunker-anim bunker-round flex items-start gap-3 border-orange-500/30 bg-orange-500/[0.07] p-3 4xl:p-4">
      <span className="text-[22px] leading-none" aria-hidden="true">⚡</span>
      <div className="min-w-0 flex-1">
        <p className="section-label text-orange-300">{t('bunker.events.title')}</p>
        <h3 className="text-[15px] font-bold text-parch 4xl:text-[18px]">{t(`bunker.event.${event.id}.name`)}</h3>
        {/* The event's own numbers go into its text: which two players
            argued, how many months are left, whose find it was. */}
        <p className="text-[12.5px] leading-snug text-parch/60">{t(`bunker.event.${event.id}.text`, event.params || {})}</p>
      </div>
      <span className="shrink-0 text-[11px] text-parch/30 tnum">R{event.round}</span>
    </section>
  );
}

export { glyphOf };
