// ThroneOnline.jsx
// An online Iron Throne room at war. Everything drawn here comes from the
// payload the server built for THIS lord: other houses' tactic cards arrive
// only as counts and the dice are thrown on the server. The map, the panels
// and the way a lord works them are the same as on the hot-seat table
// (useThroneControls); actions are sent to the server, which decides.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n/LanguageContext';
import RoomChat from '../../chat/RoomChat';
import SocialBar from '../../social/SocialBar';
import { SpectatorBanner, SpectatorStrip, SurrenderButton } from '../../room/RoomStatus';
import Icon from '../../icons';
import { useOutcomeEffects, useTurnSound } from '../../../cosmetics/useGameCosmetics';
import { HOUSES, currentHouse } from './engine';
import { SEA, TERRITORY } from './westeros';
import ThroneMap from './ThroneMap';
import {
  BattleReport, DiplomacyPanel, EventPanel, HandPanel, HouseRoster, LogPanel, ProposalDialog, ResourcesPanel,
  RulesModal, SeaPanel, TerritoryPanel, ThronePanel, TurnBanner, useThroneText,
} from './ThronePanels';
import { IronThroneBadge, SigilBadge } from './throneArt';
import useThroneControls from './useThroneControls';

const OTHERS_BATTLE_MS = 3500;

function useCountdown(endsAt) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) { setLeft(0); return undefined; }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

function Countdown({ endsAt }) {
  const left = useCountdown(endsAt);
  if (!endsAt) return null;
  return (
    <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tnum ${left <= 15 ? 'bg-[#8f2a22]/40 text-[#f0a090]' : 'bg-black/40 text-[#e9dfc8]/80'}`}>
      ⏳ {left}
    </span>
  );
}

function ChronicleAndChat({ state, chat, actions }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('log');
  const [seen, setSeen] = useState(chat.length);
  useEffect(() => { if (tab === 'chat') setSeen(chat.length); }, [tab, chat.length]);
  const unread = Math.max(0, chat.length - seen);
  const me = state.players.find((p) => p.isYou);
  return (
    <section className="throne-panel flex h-[26rem] shrink-0 flex-col overflow-hidden p-0 lg:h-auto lg:min-h-[18rem] lg:flex-1">
      <div className="flex shrink-0 border-b border-white/[0.07]">
        {['log', 'chat'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${tab === id ? 'border-b-2 border-[#d9b765] text-[#f1e7cf]' : 'text-[#e9dfc8]/45 hover:text-[#e9dfc8]/75'}`}
          >
            {t(`throne.online.${id}`)}
            {id === 'chat' && unread > 0 && tab !== 'chat' && <span className="rounded-full bg-rent px-1.5 text-[10px] text-white">{unread}</span>}
          </button>
        ))}
      </div>
      {tab === 'log' ? (
        <LogPanel s={state.game} className="min-h-0 flex-1 rounded-none border-0 shadow-none before:hidden after:hidden" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <RoomChat
            messages={chat}
            onSend={actions.sendChat}
            players={state.players}
            myPlayerId={me?.id}
            renderSystem={(m) => t(`throne.system.${m.type}`, m.params)}
            nameTone={() => 'text-[#e8c262]'}
          />
        </div>
      )}
    </section>
  );
}

function OnlineGameOver({
  state, actions, onLeave, onHide,
}) {
  const { t, house } = useThroneText();
  const { results, you } = state;
  const winner = results.winners[0];
  const place = results.standings.findIndex((r) => r.playerId === you?.id) + 1;
  const humans = results.standings.filter((r) => r.playerId).length;
  let outcome = null;
  if (place) outcome = results.winnerIds.includes(you.id) ? 'win' : (place === 2 && humans >= 3) ? 'podium' : 'loss';
  useOutcomeEffects(outcome, `throne-${state.roomCode}-${winner}-${state.game?.turnNo}`);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]">
      <section className="throne-panel throne-card-in w-full max-w-md overflow-hidden">
        <div className="flex flex-col items-center gap-2 border-b border-white/[0.08] px-5 py-6 text-center" style={{ background: `linear-gradient(180deg, ${HOUSES[winner].color}33, transparent)` }}>
          <div className="relative">
            <IronThroneBadge className="h-24 w-24" />
            <span className="absolute -bottom-1 -right-3"><SigilBadge house={winner} className="h-12 w-12" /></span>
          </div>
          <p className="throne-label">{t('throne.ui.gameOver')}</p>
          <h2 className="throne-heading text-[28px] leading-tight" style={{ color: HOUSES[winner].color }}>{house(winner)}</h2>
          <p className="text-[13px] text-[#e9dfc8]/70">
            {results.standings.find((r) => r.house === winner)?.nickname || t('throne.online.computer')}
            {' · '}
            {t(`throne.reason.${results.reason}`)}
          </p>
        </div>
        <ol className="flex flex-col gap-1 p-4">
          {results.standings.map((row, i) => (
            <li key={row.house} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[13px] ${row.winner ? 'border-[#d9b765]/50 bg-[#d9b765]/10' : 'border-white/[0.06] bg-black/20'} ${row.out ? 'opacity-45' : ''}`}>
              <span className="w-5 text-center font-mono text-[#e9dfc8]/45">{i + 1}</span>
              <SigilBadge house={row.house} className="h-6 w-6" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[#f1e7cf]">{house(row.house)}</span>
                <span className="block truncate text-[11px] text-[#e9dfc8]/50">{row.nickname || t('throne.online.computer')}</span>
              </span>
              <span className="text-[11.5px] text-[#e9dfc8]/50 tnum">{t('throne.ui.landsN', { n: row.lands })}</span>
              <span className="w-8 text-right font-mono font-bold tnum text-[#e8c262]">{row.vp}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2 px-4 pb-4">
          {you?.isHost ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => actions.restart(true)} className="throne-btn throne-btn-gold py-2.5">⚔ {t('throne.online.newGame')}</button>
              <button type="button" onClick={() => actions.restart(false)} className="throne-btn py-2.5">
                <Icon.settings className="h-4 w-4" />
                {t('throne.online.changeSettings')}
              </button>
            </div>
          ) : (
            <p className="text-center text-[12px] text-[#e9dfc8]/50">{t('throne.online.waitingHost')}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={onHide} className="throne-btn py-2">{t('throne.online.viewMap')}</button>
            <button type="button" onClick={onLeave} className="throne-btn py-2">{t('throne.online.leave')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ThroneOnline({
  state, chat, actions, onLeave, spectating,
}) {
  const { t, house } = useThroneText();
  const g = state.game;
  const myHouse = state.you?.house || null;
  const cur = g ? currentHouse(g) : null;
  const running = state.phase === 'PLAY' && g?.phase === 'play';
  const myTurn = running && cur === myHouse && !g.proposal && !!g.houses[myHouse] && !g.houses[myHouse].out;
  const [rules, setRules] = useState(false);
  const [hideResults, setHideResults] = useState(false);

  const controls = useThroneControls({
    game: g, canAct: myTurn, dispatch: actions.act, initialSeenBattle: g?.battle?.id ?? null,
  });
  useTurnSound(myTurn);

  useEffect(() => { if (state.phase !== 'GAME_OVER') setHideResults(false); }, [state.phase]);

  const ownerOf = useMemo(() => {
    const map = {};
    state.players.forEach((p) => { if (p.house) map[p.house] = p; });
    return map;
  }, [state.players]);
  const names = useMemo(() => Object.fromEntries(Object.entries(ownerOf).map(([h, p]) => [
    h, `${p.nickname}${p.left ? ` · ${t('throne.online.left')}` : !p.connected ? ` · ${t('throne.online.away')}` : ''}`,
  ])), [ownerOf, t]);

  // Other lords' battles close by themselves; your own waits for you.
  const { battle, closeBattle } = controls;
  useEffect(() => {
    if (!battle || battle.attacker === myHouse || battle.defender === myHouse) return undefined;
    const id = setTimeout(closeBattle, OTHERS_BATTLE_MS);
    return () => clearTimeout(id);
  }, [battle, myHouse, closeBattle]);

  if (!g) return <div className="table-throne min-h-screen" />;

  const owner = ownerOf[cur];
  const curControl = g.houses[cur]?.control;
  let waitingText = t('throne.online.aiTurn');
  if (g.proposal) waitingText = t('throne.online.offerSent', { house: house(g.proposal.to) });
  else if (curControl === 'human' && owner) waitingText = t('throne.online.waitingFor', { name: owner.nickname });

  let selection;
  const { selected } = controls;
  if (selected === 'throne') selection = <ThronePanel s={g} />;
  else if (selected && SEA[selected]) selection = <SeaPanel s={g} id={selected} onSelect={controls.setSelected} />;
  else if (selected && TERRITORY[selected]) {
    selection = (
      <TerritoryPanel
        s={g}
        id={selected}
        humanTurn={myTurn}
        send={controls.send}
        onSend={controls.setSend}
        pending={controls.pending}
        onConfirm={controls.confirmPending}
        onCancel={controls.cancelPending}
        onAction={actions.act}
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

  return (
    <div className="table-throne flex min-h-screen flex-col lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <header className="z-30 shrink-0 border-b border-[#6e5a2c]/30 bg-[#0e0d0b]/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 4xl:px-8 4xl:py-3">
          <IronThroneBadge className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="throne-heading truncate text-[18px] leading-tight 4xl:text-[24px]">{t('menu.throne.title')}</h1>
            <p className="truncate text-[11.5px] text-[#e9dfc8]/50">
              {state.roomCode}
              {' · '}
              {t('throne.ui.roundOf', { round: g.round, limit: g.roundLimit })}
              {' · '}
              {t(`throne.event.${g.event}.name`)}
            </p>
          </div>
          {myHouse && (
            <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[12px] text-[#e9dfc8]/80 sm:flex">
              <SigilBadge house={myHouse} className="h-5 w-5" />
              {t('throne.online.yourHouse', { house: house(myHouse) })}
            </span>
          )}
          <SocialBar compact />
          <button type="button" onClick={() => setRules(true)} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]" aria-label={t('throne.rules.title')}>
            <Icon.scroll className="h-4 w-4" />
            <span className="hidden sm:inline">{t('throne.rules.title')}</span>
          </button>
          {/* Giving up hands the house to the computer at once; the war
              goes on without its lord. The dialog asks first. */}
          {!spectating && myHouse && state.phase !== 'GAME_OVER' && !state.players.some((p) => p.isYou && p.left) && (
            <SurrenderButton onSurrender={actions.surrender} className="btn-danger shrink-0 px-2.5 py-1.5 text-[13px]" />
          )}
          <button type="button" onClick={onLeave} className="btn-quiet shrink-0 px-2.5 py-1.5 text-[13px]">{t('throne.online.leave')}</button>
        </div>
      </header>

      {spectating && <SpectatorBanner onLeave={onLeave} className="mx-2 mt-2 shrink-0" />}
      {state.spectators?.length > 0 && <SpectatorStrip spectators={state.spectators} className="mx-2 mt-2 shrink-0" />}

      {myHouse && g.houses[myHouse]?.out && running && (
        <p className="shrink-0 bg-[#8f2a22]/25 px-4 py-1.5 text-center text-[12.5px] text-[#f0a090]">{t('throne.online.fallen')}</p>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:grid lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(290px,350px)] lg:overflow-hidden 3xl:grid-cols-[340px_minmax(0,1fr)_400px] 4xl:grid-cols-[440px_minmax(0,1fr)_520px] 4xl:gap-3 4xl:p-3">
        <aside className="scrollbar-thin order-2 flex flex-col gap-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto">
          <TurnBanner
            s={g}
            humanTurn={myTurn}
            onEndTurn={() => actions.act({ type: 'endTurn' })}
            aiBusy={running && !myTurn}
            lordName={owner ? owner.nickname : t('throne.online.computer')}
            waitingText={waitingText}
            aside={running && <Countdown endsAt={state.phaseEndsAt} />}
          />
          {myHouse && g.houses[myHouse] && <ResourcesPanel s={g} house={myHouse} />}
          <HouseRoster s={g} names={names} onSelectHouse={(h) => controls.setSelected(HOUSES[h].seat)} />
          <EventPanel s={g} />
        </aside>

        <section className="relative order-1 h-[62vh] min-h-[340px] shrink-0 lg:order-2 lg:h-auto lg:min-h-0">
          <ThroneMap
            state={g}
            selected={controls.selected}
            targets={controls.targets}
            onLand={controls.onLand}
            onSea={controls.onSea}
            onThrone={controls.onThrone}
          >
            {controls.targeting != null && myHouse && (
              <p className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-[#c9a0f2]/40 bg-black/70 px-3 py-1 text-[12px] text-[#e3cffa]">
                {t('throne.ui.pickTarget', { card: t(`throne.card.${g.houses[myHouse].hand[controls.targeting]}.name`) })}
              </p>
            )}
            {state.phase === 'GAME_OVER' && state.results && !hideResults && (
              <OnlineGameOver state={state} actions={actions} onLeave={onLeave} onHide={() => setHideResults(true)} />
            )}
            {state.phase === 'GAME_OVER' && hideResults && (
              <div className="absolute inset-x-0 top-3 z-20 flex justify-center">
                <button type="button" onClick={() => setHideResults(false)} className="throne-btn throne-btn-gold px-4 py-2">🏆 {t('throne.online.showResults')}</button>
              </div>
            )}
          </ThroneMap>
        </section>

        <aside className="scrollbar-thin order-3 flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto">
          {selection}
          {myHouse && g.houses[myHouse] && (
            <>
              <HandPanel
                s={g}
                me={myHouse}
                humanTurn={myTurn}
                targeting={controls.targeting}
                onPlay={controls.playCard}
                onBuy={() => actions.act({ type: 'buyCard' })}
                onCancelTarget={controls.cancelTargeting}
              />
              <DiplomacyPanel
                s={g}
                me={myHouse}
                humanTurn={myTurn}
                onPropose={(to) => actions.act({ type: 'propose', to })}
                onBetray={(other) => actions.act({ type: 'betray', other })}
              />
            </>
          )}
          <ChronicleAndChat state={state} chat={chat} actions={actions} />
        </aside>
      </main>

      {running && g.proposal && g.proposal.to === myHouse && (
        <ProposalDialog s={g} online onRespond={(accept) => actions.act({ type: 'respond', accept })} />
      )}
      {battle && !(g.proposal && g.proposal.to === myHouse) && <BattleReport report={battle} onClose={closeBattle} />}
      {rules && <RulesModal onClose={() => setRules(false)} />}
    </div>
  );
}
