// ThroneGame.jsx
// The hot-seat Iron Throne table. The lords sit around one device, and any
// house can be handed to the computer. Setup picks the houses, who plays
// them and how long the war lasts; the table puts the map in the middle
// with the turn, resources and houses on one side and the chosen territory,
// cards, diplomacy and chronicle on the other. Online rooms use the same
// map, panels and controls (ThroneOnline.jsx).
//
// The campaign is kept in localStorage - a strategy game outlives a tab.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { navigate } from '../../../lib/router';
import LanguageSwitcher from '../../LanguageSwitcher';
import Modal from '../../Modal';
import Icon from '../../icons';
import { DashIcon } from '../../ui/dash';
import {
  ENGINE_VERSION, HOUSES, HOUSE_IDS, MIN_HOUSES, ROUND_OPTIONS, TARGET_OPTIONS, act, aiStep, createGame, currentHouse,
  standings,
} from './engine';
import { SEA, TERRITORY } from './westeros';
import ThroneMap from './ThroneMap';
import {
  BattleReport, DiplomacyPanel, EventPanel, HandPanel, HouseRoster, LogPanel, ProposalDialog, ResourcesPanel,
  RulesModal, SeaPanel, TerritoryPanel, ThronePanel, TurnBanner, useThroneText,
} from './ThronePanels';
import { IronThroneBadge, SigilBadge } from './throneArt';
import useThroneControls from './useThroneControls';

const STORAGE_KEY = 'landmark_tabletop_throne';
const AI_DELAY = 280;
const AI_BATTLE_PAUSE = 1500;

const DEFAULT_SETUP = {
  houses: {
    stark: 'human', lannister: 'ai', baratheon: 'ai', greyjoy: 'ai', tyrell: 'ai', martell: 'ai',
  },
  names: {},
  roundLimit: 10,
  target: 7,
};

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // The game still works; it just will not survive a reload.
  }
}

function validSetup(setup) {
  return !!setup && setup.houses && typeof setup.houses === 'object'
    && ROUND_OPTIONS.includes(setup.roundLimit) && TARGET_OPTIONS.includes(setup.target);
}

// --- Setup -----------------------------------------------------------------------

function Setup({
  setup, onChange, onStart, onRules,
}) {
  const { t, house } = useThroneText();
  const inGame = HOUSE_IDS.filter((h) => setup.houses[h]);
  const setControl = (h, control) => onChange({ ...setup, houses: { ...setup.houses, [h]: control } });
  return (
    <div className="flex flex-col gap-5">
      <section className="throne-panel flex flex-col items-center gap-3 overflow-hidden px-5 py-7 text-center sm:flex-row sm:text-left">
        <IronThroneBadge className="h-24 w-24 shrink-0 4xl:h-32 4xl:w-32" />
        <div className="min-w-0 flex-1">
          <p className="throne-label">{t('throne.ui.setupKicker')}</p>
          <h2 className="throne-heading text-[clamp(1.6rem,4.5vw,2.4rem)] leading-tight">{t('menu.throne.title')}</h2>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#e9dfc8]/65">{t('throne.ui.setupText')}</p>
        </div>
        <button type="button" onClick={onRules} className="throne-btn shrink-0 px-4 py-2.5">
          <Icon.scroll className="h-4 w-4" />
          {t('throne.rules.title')}
        </button>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <h3 className="throne-heading text-[18px]">{t('throne.ui.chooseHouses')}</h3>
          <p className="text-[12.5px] text-[#e9dfc8]/50">{t('throne.ui.chooseHint')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {HOUSE_IDS.map((h) => {
            const control = setup.houses[h];
            return (
              <article key={h} className={`throne-panel flex flex-col gap-2.5 p-3 transition-opacity ${control ? '' : 'opacity-55'}`} style={{ borderColor: control ? `${HOUSES[h].color}88` : undefined }}>
                <div className="flex items-center gap-3">
                  <SigilBadge house={h} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0">
                    <p className="throne-heading truncate text-[18px]" style={{ color: HOUSES[h].color }}>{house(h)}</p>
                    <p className="truncate text-[12px] italic text-[#e9dfc8]/55">{t(`throne.words.${h}`)}</p>
                    <p className="truncate text-[11.5px] text-[#e9dfc8]/40">{t('throne.ui.seat', { t: t(`throne.t.${HOUSES[h].seat}`) })}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={house(h)}>
                  {[['human', 'throne.ui.human'], ['ai', 'throne.ui.ai'], [null, 'throne.ui.absent']].map(([value, key]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={control === value}
                      onClick={() => setControl(h, value)}
                      className={`throne-btn px-1 py-1.5 text-[12px] ${control === value ? 'throne-btn-gold' : ''}`}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
                {control === 'human' && (
                  <input
                    value={setup.names[h] || ''}
                    maxLength={24}
                    onChange={(e) => onChange({ ...setup, names: { ...setup.names, [h]: e.target.value } })}
                    placeholder={t('throne.ui.lordName')}
                    className="field border-[#6e5a2c]/50 bg-black/30"
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="throne-panel p-3">
          <p className="throne-label mb-1.5">{t('throne.ui.rounds')}</p>
          <div className="grid grid-cols-3 gap-1">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => onChange({ ...setup, roundLimit: n })} className={`throne-btn ${setup.roundLimit === n ? 'throne-btn-gold' : ''}`}>{n}</button>
            ))}
          </div>
        </div>
        <div className="throne-panel p-3">
          <p className="throne-label mb-1.5">{t('throne.ui.targetPower')}</p>
          <div className="grid grid-cols-3 gap-1">
            {TARGET_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => onChange({ ...setup, target: n })} className={`throne-btn ${setup.target === n ? 'throne-btn-gold' : ''}`}>{n}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col items-center gap-2">
        <button type="button" disabled={inGame.length < MIN_HOUSES} onClick={onStart} className="throne-btn throne-btn-gold w-full max-w-md py-3.5 text-[16px]">
          {t('throne.ui.start')}
        </button>
        {inGame.length < MIN_HOUSES && <p className="text-[12.5px] text-[#f0a090]">{t('throne.ui.needHouses', { n: MIN_HOUSES })}</p>}
        <p className="text-[12px] text-[#e9dfc8]/45">{t('throne.ui.deviceHint')}</p>
      </div>
    </div>
  );
}

// --- Overlays on the map --------------------------------------------------------------

function GameOver({ game, onNew, onBack }) {
  const { t, house } = useThroneText();
  const winner = game.winners[0];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <section className="throne-panel throne-card-in w-full max-w-md overflow-hidden">
        <div className="flex flex-col items-center gap-2 border-b border-white/[0.08] px-5 py-6 text-center" style={{ background: `linear-gradient(180deg, ${HOUSES[winner].color}33, transparent)` }}>
          <div className="relative">
            <IronThroneBadge className="h-24 w-24" />
            <span className="absolute -bottom-1 -right-3"><SigilBadge house={winner} className="h-12 w-12" /></span>
          </div>
          <p className="throne-label">{t('throne.ui.gameOver')}</p>
          <h2 className="throne-heading text-[28px] leading-tight" style={{ color: HOUSES[winner].color }}>{house(winner)}</h2>
          <p className="text-[13px] text-[#e9dfc8]/70">{t(`throne.reason.${game.reason}`)}</p>
        </div>
        <ol className="flex flex-col gap-1 p-4">
          {standings(game).map((row, i) => (
            <li key={row.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[13px] ${row.id === winner ? 'border-[#d9b765]/50 bg-[#d9b765]/10' : 'border-white/[0.06] bg-black/20'} ${row.out ? 'opacity-45' : ''}`}>
              <span className="w-5 text-center font-mono text-[#e9dfc8]/45">{i + 1}</span>
              <SigilBadge house={row.id} className="h-6 w-6" />
              <span className="min-w-0 flex-1 truncate text-[#f1e7cf]">{house(row.id)}</span>
              <span className="text-[11.5px] text-[#e9dfc8]/50 tnum">{t('throne.ui.landsN', { n: row.lands })}</span>
              <span className="w-8 text-right font-mono font-bold tnum text-[#e8c262]">{row.vp}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
          <button type="button" onClick={onNew} className="throne-btn throne-btn-gold py-2.5">{t('throne.ui.newCampaign')}</button>
          <button type="button" onClick={onBack} className="throne-btn py-2.5">{t('tabletop.back')}</button>
        </div>
      </section>
    </div>
  );
}

function PassDevice({ house: h, onReady }) {
  const { t, house } = useThroneText();
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
      <button type="button" onClick={onReady} className="throne-panel throne-card-in flex max-w-sm flex-col items-center gap-2 px-6 py-6 text-center">
        <SigilBadge house={h} className="h-20 w-20" />
        <p className="throne-label">{t('throne.ui.passTitle')}</p>
        <p className="throne-heading text-[24px]" style={{ color: HOUSES[h].color }}>{house(h)}</p>
        <p className="text-[13px] text-[#e9dfc8]/65">{t('throne.ui.passText')}</p>
        <span className="throne-btn throne-btn-gold mt-1 px-5 py-2">{t('throne.ui.ready')}</span>
      </button>
    </div>
  );
}

function ConfirmDialog({
  title, text, onConfirm, onClose,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      title={title}
      icon={<Icon.warning className="h-5 w-5" />}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-quiet px-4">{t('common.cancel')}</button>
          <button type="button" onClick={onConfirm} className="btn-primary px-4">{t('tabletop.confirm')}</button>
        </div>
      )}
    >
      <p className="text-[14px] text-parch/75">{text}</p>
    </Modal>
  );
}

// --- The table ------------------------------------------------------------------------

export default function ThroneGame() {
  const { t } = useTranslation();
  const [saved] = useState(loadSaved);
  const [setup, setSetup] = useState(() => (validSetup(saved?.setup) ? saved.setup : DEFAULT_SETUP));
  const [game, setGame] = useState(() => (saved?.game?.v === ENGINE_VERSION && saved.game.game === 'throne' ? saved.game : null));
  const [readyFor, setReadyFor] = useState(() => (saved?.game ? saved.game.turnNo : null));
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { persist({ setup, game }); }, [setup, game]);

  const cur = game ? currentHouse(game) : null;
  const humanTurn = !!game && game.phase === 'play' && game.houses[cur].control === 'human' && !game.proposal;
  const dispatch = useCallback((action) => setGame((g) => (g ? act(g, action) : g)), []);
  const controls = useThroneControls({
    game, canAct: humanTurn, dispatch, initialSeenBattle: saved?.game?.battle?.id ?? null,
  });
  const { battle, setSeenBattle } = controls;
  const humans = game ? game.order.filter((h) => game.houses[h].control === 'human' && !game.houses[h].out) : [];
  const needsPass = humanTurn && humans.length > 1 && readyFor !== game.turnNo && !battle;

  // Computer houses play one visible step at a time.
  useEffect(() => {
    if (!game || game.phase !== 'play') return undefined;
    const aiTurn = game.houses[cur].control === 'ai' && !game.proposal;
    if (!aiTurn) return undefined;
    if (battle) {
      const id = setTimeout(() => setSeenBattle(battle.id), AI_BATTLE_PAUSE);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setGame((g) => (g ? aiStep(g) : g)), AI_DELAY);
    return () => clearTimeout(id);
  }, [game, cur, battle, setSeenBattle]);

  const start = () => {
    const g = createGame({
      houses: setup.houses, names: setup.names, roundLimit: setup.roundLimit, target: setup.target,
    });
    setSeenBattle(null);
    setReadyFor(g.turnNo);
    controls.resetSelection();
    setGame(g);
  };

  const inGame = !!game;

  let selection = null;
  if (game) {
    const { selected } = controls;
    if (selected === 'throne') selection = <ThronePanel s={game} />;
    else if (selected && SEA[selected]) selection = <SeaPanel s={game} id={selected} onSelect={controls.setSelected} />;
    else if (selected && TERRITORY[selected]) {
      selection = (
        <TerritoryPanel
          s={game}
          id={selected}
          humanTurn={humanTurn}
          send={controls.send}
          onSend={controls.setSend}
          pending={controls.pending}
          onConfirm={controls.confirmPending}
          onCancel={controls.cancelPending}
          onAction={dispatch}
          onSelect={controls.setSelected}
        />
      );
    } else {
      selection = (
        <section className="throne-panel p-3">
          <p className="throne-heading text-[16px]">{t('throne.ui.selectTitle')}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#e9dfc8]/60">{t('throne.ui.selectHint')}</p>
        </section>
      );
    }
  }

  return (
    <div className={`table-throne ${inGame ? 'flex h-[100dvh] flex-col overflow-hidden' : 'min-h-screen'}`}>
      <header className="z-30 shrink-0 border-b border-[#6e5a2c]/30 bg-[#0e0d0b]/90 backdrop-blur">
        <div className={`mx-auto flex items-center gap-2 px-3 py-2 4xl:px-8 4xl:py-3 ${inGame ? 'max-w-none' : 'max-w-6xl 4xl:max-w-[1700px]'}`}>
          <button type="button" onClick={() => navigate('/tabletop')} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('tabletop.back')}>
            <DashIcon name="arrowLeft" className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabletop.back')}</span>
          </button>
          <IronThroneBadge className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="throne-heading truncate text-[18px] leading-tight 4xl:text-[24px]">{t('menu.throne.title')}</h1>
            {game && (
              <p className="truncate text-[11.5px] text-[#e9dfc8]/50">
                {t('throne.ui.roundOf', { round: game.round, limit: game.roundLimit })}
                {' · '}
                {t(`throne.event.${game.event}.name`)}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setRules(true)} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('throne.rules.title')}>
            <Icon.scroll className="h-4 w-4" />
            <span className="hidden sm:inline">{t('throne.rules.title')}</span>
          </button>
          {game && (
            <button type="button" onClick={() => (game.phase === 'over' ? setGame(null) : setConfirm('new'))} className="btn-ghost shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('tabletop.newGame')}>
              <Icon.refresh className="h-4 w-4" />
              <span className="hidden sm:inline">{t('tabletop.newGame')}</span>
            </button>
          )}
          {game?.phase === 'play' && (
            <button type="button" onClick={() => setConfirm('finish')} className="btn-quiet hidden shrink-0 px-2.5 py-1.5 text-[13px] md:inline-flex" aria-label={t('tabletop.finishEarly')}>
              <Icon.flag className="h-4 w-4" />
            </button>
          )}
          <LanguageSwitcher variant="dark" />
        </div>
      </header>

      {!game && (
        <main className="mx-auto w-full max-w-6xl px-4 py-5 4xl:max-w-[1700px] 4xl:px-10 4xl:py-8">
          <Setup setup={setup} onChange={setSetup} onStart={start} onRules={() => setRules(true)} />
        </main>
      )}

      {game && (
        <main className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:grid lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(290px,350px)] lg:overflow-hidden 3xl:grid-cols-[340px_minmax(0,1fr)_400px] 4xl:grid-cols-[440px_minmax(0,1fr)_520px] 4xl:gap-3 4xl:p-3">
          <aside className="scrollbar-thin order-2 flex flex-col gap-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto">
            <TurnBanner s={game} humanTurn={humanTurn} onEndTurn={() => dispatch({ type: 'endTurn' })} aiBusy={!humanTurn} />
            <ResourcesPanel s={game} />
            <HouseRoster s={game} onSelectHouse={(h) => controls.setSelected(HOUSES[h].seat)} />
            <EventPanel s={game} />
          </aside>

          <section className="relative order-1 h-[62vh] min-h-[340px] shrink-0 lg:order-2 lg:h-auto lg:min-h-0">
            <ThroneMap
              state={game}
              selected={controls.selected}
              targets={controls.targets}
              onLand={controls.onLand}
              onSea={controls.onSea}
              onThrone={controls.onThrone}
            >
              {controls.targeting != null && (
                <p className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-[#c9a0f2]/40 bg-black/70 px-3 py-1 text-[12px] text-[#e3cffa]">
                  {t('throne.ui.pickTarget', { card: t(`throne.card.${game.houses[cur].hand[controls.targeting]}.name`) })}
                </p>
              )}
              {needsPass && <PassDevice house={cur} onReady={() => setReadyFor(game.turnNo)} />}
              {game.phase === 'over' && <GameOver game={game} onNew={() => setGame(null)} onBack={() => navigate('/tabletop')} />}
            </ThroneMap>
          </section>

          <aside className="scrollbar-thin order-3 flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto">
            {selection}
            <HandPanel s={game} humanTurn={humanTurn} targeting={controls.targeting} onPlay={controls.playCard} onBuy={() => dispatch({ type: 'buyCard' })} onCancelTarget={controls.cancelTargeting} />
            <DiplomacyPanel s={game} humanTurn={humanTurn} onPropose={(to) => dispatch({ type: 'propose', to })} onBetray={(other) => dispatch({ type: 'betray', other })} />
            <LogPanel s={game} className="max-h-[420px] lg:max-h-none lg:min-h-[260px] lg:flex-1" />
          </aside>
        </main>
      )}

      {game?.proposal && <ProposalDialog s={game} onRespond={(accept) => dispatch({ type: 'respond', accept })} />}
      {battle && !game.proposal && <BattleReport report={battle} onClose={controls.closeBattle} />}
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {confirm === 'new' && (
        <ConfirmDialog
          title={t('tabletop.confirmNew.title')}
          text={t('tabletop.confirmNew.text')}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); setGame(null); }}
        />
      )}
      {confirm === 'finish' && (
        <ConfirmDialog
          title={t('tabletop.confirmFinish.title')}
          text={t('throne.ui.finishText')}
          onClose={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); dispatch({ type: 'finish' }); }}
        />
      )}
    </div>
  );
}
