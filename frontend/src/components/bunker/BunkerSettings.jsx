// BunkerSettings.jsx
// The host's rule book for the Bunker.
//
// Every control sends a PATCH to the server, which sanitises it, merges it
// into the room's settings and hands the whole table back - so what this
// panel shows is always what the engine will actually play, never a local
// guess. Nothing here knows what any individual card, item, event or
// scenario is: the lists are whatever /api/bunker/config answered with, so
// content added on the server appears here without a change to this file.

import { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import Modal from '../Modal';
import Icon from '../icons';
import { Segmented, Toggle } from '../mafia/MafiaSettings';
import { CHAR_ORDER, CharIcon, RARITY_TONE } from './bunkerText';

const TABS = ['scenario', 'players', 'characters', 'baggage', 'cards', 'rounds', 'voting', 'events'];

function Row({ title, hint, children, stacked = false }) {
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 ${stacked ? '' : 'flex items-center gap-3'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-parch">{title}</p>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-parch/40">{hint}</p>}
      </div>
      <div className={stacked ? 'mt-2' : 'shrink-0'}>{children}</div>
    </div>
  );
}

// A list of ids the host ticks on and off. Used for the action-card deck,
// the event deck, the characteristics and the baggage rarities - anything
// where the content comes from the server.
function Checklist({
  ids, selected, onChange, disabled, label, tone,
}) {
  const on = new Set(selected || []);
  const toggle = (id) => {
    const next = new Set(on);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const active = on.has(id);
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(id)}
            aria-pressed={active}
            className={`rounded-lg border px-2 py-1 text-left text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? (tone?.(id) || 'border-brass/45 bg-brass/[0.12] text-parch')
                : 'border-white/[0.08] bg-black/25 text-parch/35 line-through'
            }`}
          >
            {label(id)}
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  value, onChange, min, max, step = 1, disabled, format,
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-white/15 accent-brass disabled:opacity-40 sm:w-36"
      />
      <span className="w-12 text-right text-[12.5px] font-bold text-parch tnum">{format(value)}</span>
    </div>
  );
}

export default function BunkerSettings({
  state, config, isHost, onPatch, onClose,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('scenario');
  const s = state.settings;
  const schema = config?.schema;
  const ro = !isHost;

  // Patches are always shaped like the settings themselves, so the server
  // merges them without this panel having to know the whole object.
  const patch = (next) => { if (isHost) onPatch(next); };
  const sec = (name) => (next) => patch({ [name]: next });
  const players = sec('players');
  const characters = sec('characters');
  const baggage = sec('baggage');
  const cards = sec('actionCards');
  const rounds = sec('rounds');
  const voting = sec('voting');
  const events = sec('events');

  const seatOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const seconds = (v) => `${v}${t('mafia.secondsShort')}`;

  const body = {
    // --- which kind of Bunker this is ------------------------------
    scenario: (
      <>
        <p className="text-[12px] leading-snug text-parch/45">{t('bunker.settings.scenarioIntro')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(schema?.scenarios || []).map((sc) => {
            const active = s.scenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                disabled={ro}
                onClick={() => patch({ scenario: sc.id })}
                className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                  active ? 'border-brass/60 bg-brass/[0.1]' : 'border-white/[0.08] bg-black/25 enabled:hover:border-white/20'
                }`}
              >
                <p className="flex items-center gap-2 text-[13.5px] font-bold text-parch">
                  {active && <Icon.check className="h-3.5 w-3.5 text-brass-light" />}
                  {t(`bunker.scenario.${sc.id}`)}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-parch/45">{t(`bunker.scenarioText.${sc.id}`)}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[11.5px] leading-snug text-parch/35">{t('bunker.settings.scenarioNote')}</p>
      </>
    ),

    // --- who is at the table ----------------------------------------
    players: (
      <>
        <Row title={t('bunker.settings.maxPlayers')} hint={t('bunker.settings.maxPlayersHint')}>
          <Slider
            value={s.maxPlayers}
            min={Math.max(schema?.limits.minPlayers || 4, state.players.length)}
            max={schema?.limits.maxPlayers || 16}
            disabled={ro}
            onChange={(v) => patch({ maxPlayers: v })}
            format={String}
          />
        </Row>
        <Row title={t('bunker.settings.minPlayers')} hint={t('bunker.settings.minPlayersHint')}>
          <Slider
            value={s.players.min}
            min={schema?.limits.minPlayers || 4}
            max={s.maxPlayers}
            disabled={ro}
            onChange={(v) => players({ min: v })}
            format={String}
          />
        </Row>
        <Row title={t('bunker.settings.seats')} hint={t('bunker.settings.seatsHint', { n: state.seats })}>
          <Segmented
            disabled={ro}
            value={s.seats}
            onChange={(v) => patch({ seats: Number(v) })}
            options={seatOptions.map((v) => ({ value: v, label: v === 0 ? t('bunker.settings.seatsAuto') : String(v) }))}
          />
        </Row>
        <Row title={t('bunker.settings.bots')} hint={t('bunker.settings.botsHint')}>
          <Toggle checked={s.players.bots} disabled={ro} onChange={(v) => players({ bots: v })} label={t('bunker.settings.bots')} />
        </Row>
        {s.players.bots && (
          <Row title={t('bunker.settings.botCount')} hint={t('bunker.settings.botCountHint')}>
            <Slider
              value={s.players.botCount}
              min={0}
              max={Math.min(schema?.limits.maxBots || 12, s.maxPlayers - 1)}
              disabled={ro}
              onChange={(v) => players({ botCount: v })}
              format={String}
            />
          </Row>
        )}
        <Row title={t('bunker.settings.spectators')} hint={t('bunker.settings.spectatorsHint')}>
          <Toggle checked={s.players.allowSpectators} disabled={ro} onChange={(v) => players({ allowSpectators: v })} label={t('bunker.settings.spectators')} />
        </Row>
      </>
    ),

    // --- what a character is made of --------------------------------
    characters: (
      <>
        <Row title={t('bunker.settings.categories')} hint={t('bunker.settings.categoriesHint')} stacked>
          <Checklist
            ids={CHAR_ORDER.filter((k) => !k.startsWith('baggage') && !k.startsWith('secret'))}
            selected={s.characters.categories}
            disabled={ro}
            onChange={(next) => characters({ categories: next })}
            label={(k) => t(`bunker.char.${k}`)}
          />
          <p className="mt-1.5 text-[11px] text-parch/35">{t('bunker.settings.categoriesLocked')}</p>
        </Row>
        <Row title={t('bunker.settings.secrets')} hint={t('bunker.settings.secretsHint')}>
          <Segmented
            disabled={ro}
            value={s.characters.secrets}
            onChange={(v) => characters({ secrets: Number(v) })}
            options={[0, 1, 2].map((v) => ({ value: v, label: String(v) }))}
          />
        </Row>
        <Row title={t('bunker.settings.hiddenFromOwner')} hint={t('bunker.settings.hiddenFromOwnerHint')}>
          <Segmented
            disabled={ro}
            value={s.characters.hiddenFromOwner}
            onChange={(v) => characters({ hiddenFromOwner: Number(v) })}
            options={[0, 1, 2, 3].map((v) => ({ value: v, label: String(v) }))}
          />
        </Row>
        <Row title={t('bunker.settings.randomness')} hint={t(`bunker.settings.randomness.${s.characters.randomness}Hint`)}>
          <Segmented
            disabled={ro}
            value={s.characters.randomness}
            onChange={(v) => characters({ randomness: v })}
            options={(schema?.randomness || ['balanced', 'chaotic']).map((v) => ({ value: v, label: t(`bunker.settings.randomness.${v}`) }))}
          />
        </Row>
        <Row title={t('bunker.settings.rarityBias')} hint={t('bunker.settings.rarityBiasHint')}>
          <Segmented
            disabled={ro}
            value={s.characters.rarityBias}
            onChange={(v) => characters({ rarityBias: v })}
            options={['normal', 'flat', 'rare'].map((v) => ({ value: v, label: t(`bunker.settings.rarityBias.${v}`) }))}
          />
        </Row>
        {/* How much of the ridiculous shelf is dealt. The hint changes
            with the setting, because "a pinch" and "nothing but" are very
            different games. */}
        <Row title={t('bunker.settings.absurdity')} hint={t(`bunker.settings.absurdity.${s.characters.absurdity || 'light'}Hint`)}>
          <Segmented
            disabled={ro}
            value={s.characters.absurdity || 'light'}
            onChange={(v) => characters({ absurdity: v })}
            options={(schema?.absurdity || ['off', 'light', 'normal', 'full', 'only'])
              .map((v) => ({ value: v, label: t(`bunker.settings.absurdity.${v}`) }))}
          />
        </Row>
      </>
    ),

    // --- what they bring with them -----------------------------------
    baggage: (
      <>
        <Row title={t('bunker.settings.baggageCount')} hint={t('bunker.settings.baggageCountHint')}>
          <Segmented
            disabled={ro}
            value={s.baggage.count}
            onChange={(v) => baggage({ count: v === 'random' ? 'random' : Number(v) })}
            options={(schema?.baggageCounts || [1, 2, 3, 4, 'random']).map((v) => ({
              value: v, label: v === 'random' ? t('bunker.settings.baggageRandom') : String(v),
            }))}
          />
        </Row>
        <Row title={t('bunker.settings.rarities')} hint={t('bunker.settings.raritiesHint')} stacked>
          <Checklist
            ids={config?.rarities || []}
            selected={s.baggage.rarities}
            disabled={ro}
            onChange={(next) => baggage({ rarities: next })}
            label={(r) => t(`bunker.rarity.${r}`)}
            tone={(r) => RARITY_TONE[r]}
          />
        </Row>
        <Row title={t('bunker.settings.specialProperties')} hint={t('bunker.settings.specialPropertiesHint')}>
          <Toggle checked={s.baggage.specialProperties} disabled={ro} onChange={(v) => baggage({ specialProperties: v })} label={t('bunker.settings.specialProperties')} />
        </Row>
        <Row title={t('bunker.settings.allowTrade')} hint={t('bunker.settings.allowTradeHint')}>
          <Toggle checked={s.baggage.allowTrade} disabled={ro} onChange={(v) => baggage({ allowTrade: v })} label={t('bunker.settings.allowTrade')} />
        </Row>
        <Row title={t('bunker.settings.allowSteal')} hint={t('bunker.settings.allowStealHint')}>
          <Toggle checked={s.baggage.allowSteal} disabled={ro} onChange={(v) => baggage({ allowSteal: v })} label={t('bunker.settings.allowSteal')} />
        </Row>
      </>
    ),

    // --- the action cards ---------------------------------------------
    cards: (
      <>
        <Row title={t('bunker.settings.cardsEnabled')} hint={t('bunker.settings.cardsEnabledHint')}>
          <Toggle checked={s.actionCards.enabled} disabled={ro} onChange={(v) => cards({ enabled: v })} label={t('bunker.settings.cardsEnabled')} />
        </Row>
        {s.actionCards.enabled && (
          <>
            <Row title={t('bunker.settings.cardsPerPlayer')} hint={t('bunker.settings.cardsPerPlayerHint')}>
              <Slider value={s.actionCards.perPlayer} min={0} max={6} disabled={ro} onChange={(v) => cards({ perPlayer: v })} format={String} />
            </Row>
            <Row title={t('bunker.settings.drawChance')} hint={t('bunker.settings.drawChanceHint')}>
              <Slider
                value={Math.round(s.actionCards.drawChance * 100)}
                min={5}
                max={100}
                step={5}
                disabled={ro}
                onChange={(v) => cards({ drawChance: v / 100 })}
                format={(v) => `${v}%`}
              />
            </Row>
            <Row title={t('bunker.settings.maxUsesPerRound')} hint={t('bunker.settings.maxUsesPerRoundHint')}>
              <Segmented
                disabled={ro}
                value={s.actionCards.maxUsesPerRound}
                onChange={(v) => cards({ maxUsesPerRound: Number(v) })}
                options={[0, 1, 2, 3].map((v) => ({ value: v, label: v === 0 ? '∞' : String(v) }))}
              />
            </Row>
            <Row title={t('bunker.settings.maxUsesPerGame')} hint={t('bunker.settings.maxUsesPerGameHint')}>
              <Slider
                value={s.actionCards.maxUsesPerGame}
                min={0}
                max={20}
                disabled={ro}
                onChange={(v) => cards({ maxUsesPerGame: v })}
                format={(v) => (v === 0 ? '∞' : String(v))}
              />
            </Row>
            <Row title={t('bunker.settings.cardDeck')} hint={t('bunker.settings.cardDeckHint', { n: s.actionCards.deck.length })} stacked>
              <Checklist
                ids={(schema?.actionCards || []).map((c) => c.id)}
                selected={s.actionCards.deck}
                disabled={ro}
                onChange={(next) => cards({ deck: next })}
                label={(id) => t(`bunker.card.${id}.name`)}
              />
            </Row>
          </>
        )}
      </>
    ),

    // --- the shape of a round -----------------------------------------
    rounds: (
      <>
        <Row title={t('bunker.settings.totalRounds')} hint={t('bunker.settings.totalRoundsHint')}>
          <Slider
            value={s.rounds.total}
            min={0}
            max={12}
            disabled={ro}
            onChange={(v) => rounds({ total: v })}
            format={(v) => (v === 0 ? '∞' : String(v))}
          />
        </Row>
        <Row title={t('bunker.settings.firstVoteRound')} hint={t('bunker.settings.firstVoteRoundHint')}>
          <Segmented
            disabled={ro}
            value={s.rounds.firstVoteRound}
            onChange={(v) => rounds({ firstVoteRound: Number(v) })}
            options={[1, 2, 3, 4].map((v) => ({ value: v, label: String(v) }))}
          />
        </Row>
        <Row title={t('bunker.settings.revealPerRound')} hint={t('bunker.settings.revealPerRoundHint')}>
          <Segmented
            disabled={ro}
            value={s.rounds.revealPerRound}
            onChange={(v) => rounds({ revealPerRound: Number(v) })}
            options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))}
          />
        </Row>
        <Row title={t('bunker.settings.turnSec')} hint={t('bunker.settings.turnSecHint')}>
          <Slider value={s.turnSec} min={20} max={180} step={5} disabled={ro} onChange={(v) => patch({ turnSec: v })} format={seconds} />
        </Row>
        <Row title={t('bunker.settings.discussSec')} hint={t('bunker.settings.discussSecHint')}>
          <Slider value={s.discussSec} min={30} max={600} step={15} disabled={ro} onChange={(v) => patch({ discussSec: v })} format={seconds} />
        </Row>
        <Row title={t('bunker.settings.voteSec')} hint={t('bunker.settings.voteSecHint')}>
          <Slider value={s.voteSec} min={15} max={180} step={5} disabled={ro} onChange={(v) => patch({ voteSec: v })} format={seconds} />
        </Row>
        <Row title={t('bunker.settings.resultSec')} hint={t('bunker.settings.resultSecHint')}>
          <Slider value={s.rounds.resultSec} min={3} max={60} disabled={ro} onChange={(v) => rounds({ resultSec: v })} format={seconds} />
        </Row>
      </>
    ),

    // --- how the table decides -----------------------------------------
    voting: (
      <>
        <Row title={t('bunker.settings.voteMode')} hint={t(`bunker.settings.voteMode.${s.voting.mode}Hint`)}>
          <Segmented
            disabled={ro}
            value={s.voting.mode}
            onChange={(v) => voting({ mode: v })}
            options={(schema?.voteModes || ['single', 'multi']).map((v) => ({ value: v, label: t(`bunker.settings.voteMode.${v}`) }))}
          />
        </Row>
        {s.voting.mode === 'multi' && (
          <Row title={t('bunker.settings.votesPerPlayer')} hint={t('bunker.settings.votesPerPlayerHint')}>
            <Segmented
              disabled={ro}
              value={s.voting.votesPerPlayer}
              onChange={(v) => voting({ votesPerPlayer: Number(v) })}
              options={[2, 3, 4].map((v) => ({ value: v, label: String(v) }))}
            />
          </Row>
        )}
        <Row title={t('bunker.settings.secretVote')} hint={t('bunker.settings.secretVoteHint')}>
          <Toggle checked={s.voting.secret} disabled={ro} onChange={(v) => voting({ secret: v })} label={t('bunker.settings.secretVote')} />
        </Row>
        <Row title={t('bunker.settings.allowChange')} hint={t('bunker.settings.allowChangeHint')}>
          <Toggle checked={s.voting.allowChange} disabled={ro} onChange={(v) => voting({ allowChange: v })} label={t('bunker.settings.allowChange')} />
        </Row>
        <Row title={t('bunker.settings.allowTie')} hint={t('bunker.settings.allowTieHint')}>
          <Toggle checked={s.voting.allowTie} disabled={ro} onChange={(v) => voting({ allowTie: v })} label={t('bunker.settings.allowTie')} />
        </Row>
        <Row title={t('bunker.settings.tieRule')} hint={t(`bunker.settings.tieRule.${s.voting.tieRule}Hint`)}>
          <Segmented
            disabled={ro || !s.voting.allowTie}
            value={s.voting.tieRule}
            onChange={(v) => voting({ tieRule: v })}
            options={(schema?.tieRules || ['revote', 'random', 'none', 'all']).map((v) => ({ value: v, label: t(`bunker.settings.tieRule.${v}`) }))}
          />
        </Row>
      </>
    ),

    // --- what happens to the shelter -------------------------------------
    events: (
      <>
        <Row title={t('bunker.settings.eventsEnabled')} hint={t('bunker.settings.eventsEnabledHint')}>
          <Toggle checked={s.events.enabled} disabled={ro} onChange={(v) => events({ enabled: v })} label={t('bunker.settings.eventsEnabled')} />
        </Row>
        {s.events.enabled && (
          <>
            <Row title={t('bunker.settings.eventChance')} hint={t('bunker.settings.eventChanceHint')}>
              <Slider
                value={Math.round(s.events.chance * 100)}
                min={0}
                max={100}
                step={5}
                disabled={ro}
                onChange={(v) => events({ chance: v / 100 })}
                format={(v) => `${v}%`}
              />
            </Row>
            <Row title={t('bunker.settings.eventDeck')} hint={t('bunker.settings.eventDeckHint', { n: s.events.deck.length })} stacked>
              <Checklist
                ids={(schema?.events || []).map((e) => e.id)}
                selected={s.events.deck}
                disabled={ro}
                onChange={(next) => events({ deck: next })}
                label={(id) => t(`bunker.event.${id}.name`)}
              />
            </Row>
          </>
        )}
      </>
    ),
  };

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-3xl"
      title={t('bunker.settings.title')}
      subtitle={isHost ? t('bunker.settings.liveNote') : t('bunker.settings.hostOnly')}
      icon={<Icon.settings className="h-4.5 w-4.5" />}
      bodyClass="!p-0"
      footer={(
        <button type="button" onClick={onClose} className="btn-primary w-full py-2.5">{t('bunker.settings.done')}</button>
      )}
    >
      {/* The tabs scroll sideways on a phone rather than wrapping into a
          block that pushes the settings themselves off the screen. */}
      <nav className="scrollbar-thin sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-white/[0.07] bg-felt-700/95 px-3 py-2 backdrop-blur">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors ${
              tab === id ? 'bg-brass/20 text-brass-light' : 'text-parch/45 hover:bg-white/[0.05] hover:text-parch'
            }`}
          >
            {t(`bunker.settings.tab.${id}`)}
          </button>
        ))}
      </nav>
      <div className="flex flex-col gap-2 p-3 sm:p-4">
        {body[tab]}
      </div>
    </Modal>
  );
}

// A compact read-only summary of the rules, for the lobby's side panel.
export function RulesSummary({ state, t }) {
  const s = state.settings;
  const pills = [
    { key: 'scenario', text: t(`bunker.scenario.${s.scenario}`), tone: 'bg-brass/20 text-brass-light' },
    { key: 'seats', text: t('bunker.summary.seats', { n: state.seats }) },
    { key: 'chars', text: t('bunker.summary.chars', { n: (state.categories || []).length }) },
    { key: 'bags', text: t('bunker.summary.bags', { n: s.baggage.count === 'random' ? '?' : s.baggage.count }) },
    { key: 'secrets', text: t('bunker.summary.secrets', { n: s.characters.secrets }) },
  ];
  if (s.actionCards.enabled) pills.push({ key: 'cards', text: t('bunker.summary.cards', { n: s.actionCards.perPlayer }), tone: 'bg-violet-400/20 text-violet-200' });
  if (s.events.enabled) pills.push({ key: 'events', text: t('bunker.summary.events'), tone: 'bg-orange-400/20 text-orange-200' });
  if (s.voting.secret) pills.push({ key: 'secretVote', text: t('bunker.summary.secretVote') });
  if (s.voting.mode === 'multi') pills.push({ key: 'multi', text: t('bunker.summary.multiVote', { n: s.voting.votesPerPlayer }) });
  if (s.players.bots && s.players.botCount > 0) pills.push({ key: 'bots', text: t('bunker.summary.bots', { n: s.players.botCount }) });
  if (s.rounds.total > 0) pills.push({ key: 'rounds', text: t('bunker.summary.rounds', { n: s.rounds.total }) });

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <span key={p.key} className={`pill ${p.tone || 'bg-white/[0.07] text-parch/70'}`}>{p.text}</span>
      ))}
    </div>
  );
}

// The character sheet this table will deal, shown in the lobby so players
// know what they are in for before the first card is dealt.
export function SheetPreview({ state, t }) {
  const keys = CHAR_ORDER.filter((k) => (state.categories || []).includes(k));
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <span key={key} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/25 px-2 py-1 text-[12px] text-parch/70">
          <CharIcon name={key} className="h-3.5 w-3.5 text-parch/45" />
          {t(`bunker.char.${key}`)}
        </span>
      ))}
    </div>
  );
}
