// ThronePanels.jsx
// The side panels of the Iron Throne table: whose turn it is and what they
// hold, the chosen territory and its army with every action it allows, the
// Westeros card, tactic cards, diplomacy, the Iron Throne race and the
// chronicle of what happened. Panels only read the state and call back; the
// rules live in engine.js and the flow in ThroneGame.jsx.

import { useTranslation } from '../../../i18n/LanguageContext';
import Modal from '../../Modal';
import {
  ALLIANCE_ROUNDS, COST, FORT_LIMIT, HAND_LIMIT, HOUSES, STRUCTURES, allianceCost, allianceOf, armyCap, armyOf,
  cardTargets, currentHouse, defenseOf, fortifyProblem, freeUnits, incomeOf, isAllied, landsOf, markerProblem,
  recruitProblem, standings, strengthIn, structureOf, supplyOf, throneHolder, unitCost, vpOf, winChance,
} from './engine';
import { SEA, TERRITORY } from './westeros';
import {
  CardMark, EventMark, FootmanMark, IronThroneBadge, KnightMark, ResourceMark, SigilBadge,
} from './throneArt';

export function useThroneText() {
  const { t, language } = useTranslation();
  const house = (h) => (h ? t(`throne.house.${h}`) : t('throne.neutral'));
  const land = (id) => (id ? t(`throne.t.${id}`) : '');
  const logText = (e) => {
    const v = e.vars || {};
    const key = e.key === 'playCard' && v.t ? 'playCardAt' : e.key;
    return t(`throne.log.${key}`, {
      ...v,
      house: house(e.house),
      other: 'other' in v ? house(v.other) : '',
      t: land(v.t),
      from: land(v.from),
      to: land(v.to),
      card: v.card ? t(`throne.card.${v.card}.name`) : '',
      event: v.event ? t(`throne.event.${v.event}.name`) : '',
    });
  };
  return {
    t, language, house, land, logText,
  };
}

export function PanelTitle({ children, aside }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="throne-heading min-w-0 flex-1 truncate text-[15px] 4xl:text-[19px]">{children}</h3>
      {aside}
    </div>
  );
}

function Stat({
  kind, label, value, sub, warn = false,
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 ${warn ? 'border-[#8f2a22]/60 bg-[#8f2a22]/10' : 'border-white/[0.06] bg-black/25'}`}>
      <span className="text-[#d9b765]"><ResourceMark kind={kind} className="h-4 w-4" /></span>
      <div className="min-w-0 leading-tight">
        <p className="throne-label truncate">{label}</p>
        <p className="font-mono text-[15px] font-bold tnum text-[#f1e7cf]">
          {value}
          {sub && <span className="ml-1 text-[11px] font-semibold text-[#e9dfc8]/45">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

// --- Turn and resources ---------------------------------------------------------

export function TurnBanner({
  s, humanTurn, onEndTurn, aiBusy, lordName, waitingText, aside,
}) {
  const { t, house } = useThroneText();
  const h = currentHouse(s);
  const me = s.houses[h];
  return (
    <section className="throne-panel flex flex-col gap-2.5 p-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <SigilBadge house={h} className="h-14 w-14 4xl:h-20 4xl:w-20" />
          <span className="throne-turn-ring pointer-events-none absolute -inset-1 rounded-full" style={{ '--ring': HOUSES[h].color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="throne-label flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{t('throne.ui.turnOf', { round: s.round, limit: s.roundLimit })}</span>
            {aside}
          </p>
          <p className="throne-heading truncate text-[19px] leading-tight 4xl:text-[24px]" style={{ color: HOUSES[h].color }} title={house(h)}>{house(h)}</p>
          <p className="truncate text-[12px] text-[#e9dfc8]/60">
            {lordName ?? (me.name || (me.control === 'ai' ? t('throne.ui.ai') : t('throne.ui.human')))}
            {' · '}
            <span className="italic">{t(`throne.words.${h}`)}</span>
          </p>
        </div>
      </div>
      {humanTurn ? (
        <button type="button" onClick={onEndTurn} className="throne-btn throne-btn-gold w-full py-2.5 text-[14px]">
          {t('throne.ui.endTurn')}
        </button>
      ) : (
        <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[12.5px] text-[#e9dfc8]/70">
          <span className={`h-2 w-2 rounded-full bg-[#d9b765] ${aiBusy ? 'animate-pulse' : ''}`} />
          {waitingText || t('throne.ui.aiThinking')}
        </span>
      )}
    </section>
  );
}

export function ResourcesPanel({ s, house: viewerHouse }) {
  const { t } = useThroneText();
  const h = viewerHouse || currentHouse(s);
  const me = s.houses[h];
  const army = armyOf(s, h);
  const cap = armyCap(s, h);
  const income = incomeOf(s, h);
  return (
    <section className="throne-panel p-3">
      <PanelTitle aside={<span className="text-[11px] text-[#e9dfc8]/45">{t('throne.ui.nextIncome', { gold: income.gold, influence: income.influence })}</span>}>
        {t('throne.ui.resources')}
      </PanelTitle>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat kind="gold" label={t('throne.ui.gold')} value={me.gold} />
        <Stat kind="influence" label={t('throne.ui.influence')} value={me.influence} />
        <Stat kind="commands" label={t('throne.ui.commands')} value={me.commands} warn={me.commands === 0} />
        <Stat kind="army" label={t('throne.ui.army')} value={army.units} sub={`/ ${cap}`} warn={army.units >= cap} />
        <Stat kind="supply" label={t('throne.ui.supply')} value={supplyOf(s, h)} />
        <Stat kind="power" label={t('throne.ui.power')} value={vpOf(s, h)} sub={`/ ${s.target}`} />
      </div>
      {me.bonus > 0 && <p className="mt-2 text-[12px] text-[#e8c262]">{t('throne.ui.bonusReady', { n: me.bonus })}</p>}
    </section>
  );
}

export function HouseRoster({ s, onSelectHouse, names }) {
  const { t, house } = useThroneText();
  const cur = currentHouse(s);
  const king = throneHolder(s);
  return (
    <section className="throne-panel p-3">
      <PanelTitle>{t('throne.ui.houses')}</PanelTitle>
      <ul className="flex flex-col gap-1.5">
        {s.order.map((h) => {
          const me = s.houses[h];
          const vp = vpOf(s, h);
          const army = armyOf(s, h);
          const ally = isAllied(s, cur, h);
          return (
            <li key={h}>
              <button
                type="button"
                onClick={() => onSelectHouse?.(h)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  h === cur ? 'border-[#d9b765]/60 bg-[#d9b765]/10' : 'border-white/[0.06] bg-black/20 hover:border-white/15'
                } ${me.out ? 'opacity-40' : ''}`}
              >
                <SigilBadge house={h} className="h-8 w-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-semibold text-[#f1e7cf] ${me.out ? 'line-through' : ''}`}>
                    {house(h)}
                    {king === h && <span className="ml-1 text-[#e8c262]" title={t('throne.ui.ironThrone')}>♛</span>}
                    {ally && <span className="ml-1 text-[11px] text-[#8fc1dd]">· {t('throne.ui.ally')}</span>}
                  </p>
                  {names?.[h] && <p className="truncate text-[11px] leading-tight text-[#e9dfc8]/50">{names[h]}</p>}
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (vp / s.target) * 100)}%`, background: HOUSES[h].color }} />
                  </div>
                </div>
                <div className="shrink-0 text-right leading-tight">
                  <p className="font-mono text-[13px] font-bold tnum text-[#e8c262]">{vp}<span className="text-[#e9dfc8]/40">/{s.target}</span></p>
                  <p className="text-[10.5px] text-[#e9dfc8]/50 tnum">
                    {landsOf(s, h).length}
                    {' ⚑ · '}
                    {army.strength}
                    {' ⚔'}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function EventPanel({ s }) {
  const { t } = useThroneText();
  return (
    <section className="throne-panel p-3">
      <PanelTitle aside={<span className="throne-label">{t('throne.ui.roundOf', { round: s.round, limit: s.roundLimit })}</span>}>
        {t('throne.ui.westerosCard')}
      </PanelTitle>
      <div key={`${s.round}-${s.event}`} className="throne-card-in throne-parchment flex items-start gap-3 rounded-lg p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#3a2a18]/40 bg-[#3a2a18]/10 text-[#3a2a18]">
          <EventMark event={s.event} className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[16px] font-bold leading-tight text-[#24190d]">{t(`throne.event.${s.event}.name`)}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[#3a2a18]">{t(`throne.event.${s.event}.text`)}</p>
        </div>
      </div>
    </section>
  );
}

// --- Selection -----------------------------------------------------------------------

function Stepper({
  icon, label, value, max, onChange,
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
      <span className="text-[#d9b765]">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#e9dfc8]/80">{label}</span>
      <button type="button" disabled={value <= 0} onClick={() => onChange(value - 1)} className="throne-btn h-7 w-7 p-0" aria-label="−">−</button>
      <span className="w-9 text-center font-mono text-[14px] font-bold tnum text-[#f1e7cf]">
        {value}
        <span className="text-[10px] text-[#e9dfc8]/40">/{max}</span>
      </span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} className="throne-btn h-7 w-7 p-0" aria-label="+">+</button>
    </div>
  );
}

function Chip({ children, tone = 'plain', title }) {
  const tones = {
    plain: 'border-white/[0.08] bg-white/[0.04] text-[#e9dfc8]/75',
    gold: 'border-[#d9b765]/40 bg-[#d9b765]/10 text-[#e8c262]',
    blood: 'border-[#e3624f]/40 bg-[#8f2a22]/15 text-[#f0a090]',
    sea: 'border-[#8fc1dd]/35 bg-[#8fc1dd]/10 text-[#b7d8ea]',
  };
  return <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function TerritoryPanel({
  s, id, humanTurn, send, onSend, pending, onConfirm, onCancel, onAction, onSelect,
}) {
  const { t, house, land } = useThroneText();
  const tt = TERRITORY[id];
  const l = s.lands[id];
  const h = currentHouse(s);
  const st = structureOf(s, id);
  const mine = l.owner === h;
  const free = freeUnits(l);
  const why = (reason) => (reason ? t(`throne.why.${reason}`) : undefined);
  const recruitF = recruitProblem(s, id, 'f');
  const recruitK = recruitProblem(s, id, 'k');
  const marker = markerProblem(s, id);
  const fort = fortifyProblem(s, id);
  const me = s.houses[h];

  return (
    <section className="throne-panel p-3">
      <div className="mb-2 flex items-start gap-2.5">
        {l.owner ? <SigilBadge house={l.owner} className="h-11 w-11 shrink-0" /> : <IronThroneBadge className="h-11 w-11 shrink-0 opacity-50" />}
        <div className="min-w-0 flex-1">
          <p className="throne-label">{t(`throne.region.${tt.region}`)} · {t(`throne.structure.${st || 'none'}`)}</p>
          <h3 className="throne-heading truncate text-[19px] leading-tight">{land(id)}</h3>
          <p className="truncate text-[12.5px]" style={{ color: l.owner ? HOUSES[l.owner].color : '#e9dfc8aa' }}>
            {l.owner ? house(l.owner) : l.garrison ? t('throne.neutral') : t('throne.ui.unclaimed')}
            {l.owner && l.owner !== h && isAllied(s, h, l.owner) && <span className="ml-1 text-[#8fc1dd]">· {t('throne.ui.ally')}</span>}
          </p>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {st && <Chip tone="gold" title={t('throne.ui.powerHint')}>♛ {t('throne.ui.powerN', { n: STRUCTURES[st].vp })}</Chip>}
        {st && <Chip>{t('throne.ui.goldN', { n: STRUCTURES[st].gold + (tt.port ? 1 : 0) })}</Chip>}
        {tt.port && <Chip tone="sea">⚓ {t('throne.ui.port')}</Chip>}
        {tt.supply > 0 && <Chip>{t('throne.ui.supplyN', { n: tt.supply })}</Chip>}
        {tt.crown > 0 && <Chip tone="gold">{t('throne.ui.crown')}</Chip>}
        {l.marker && <Chip tone="gold">{t('throne.ui.marker')}</Chip>}
        {l.walls && <Chip tone="gold">{t('throne.card.walls.name')}</Chip>}
        <Chip tone={defenseOf(s, id) ? 'blood' : 'plain'} title={t('throne.ui.defenseHint')}>🛡 {t('throne.ui.defenseN', { n: defenseOf(s, id) })}</Chip>
      </div>

      {(l.f + l.k > 0 || l.garrison > 0) && (
        <div className="mb-2 rounded-lg border border-white/[0.06] bg-black/25 p-2">
          <p className="throne-label mb-1">{l.owner ? t('throne.ui.armyHere') : t('throne.neutral')}</p>
          {l.owner ? (
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#f1e7cf]">
              <span className="flex items-center gap-1"><FootmanMark className="h-4 w-4 text-[#d9b765]" />{t('throne.ui.footmenN', { n: l.f })}</span>
              <span className="flex items-center gap-1"><KnightMark className="h-4 w-4 text-[#d9b765]" />{t('throne.ui.knightsN', { n: l.k })}</span>
              <span className="text-[#e9dfc8]/60">{t('throne.ui.strengthN', { n: strengthIn(l) })}</span>
              {mine && (l.tf + l.tk > 0) && <span className="text-[11.5px] text-[#e9dfc8]/45">{t('throne.ui.tiredN', { n: l.tf + l.tk })}</span>}
            </div>
          ) : (
            <p className="text-[13px] text-[#f1e7cf]">{t('throne.ui.garrisonN', { n: l.garrison })}</p>
          )}
        </div>
      )}

      {pending && pending.from === id && (
        <AttackConfirm s={s} pending={pending} send={send} onConfirm={onConfirm} onCancel={onCancel} />
      )}

      {mine && humanTurn && !pending && (
        <div className="flex flex-col gap-2">
          {free.f + free.k > 0 ? (
            <div>
              <p className="throne-label mb-1">{t('throne.ui.sendTroops')}</p>
              <div className="flex flex-col gap-1">
                <Stepper icon={<FootmanMark />} label={t('throne.ui.footmen')} value={send.f} max={free.f} onChange={(f) => onSend({ ...send, f })} />
                {free.k > 0 && <Stepper icon={<KnightMark />} label={t('throne.ui.knights')} value={send.k} max={free.k} onChange={(k) => onSend({ ...send, k })} />}
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-[#e9dfc8]/60">
                {me.commands > 0 ? t('throne.ui.moveHint', { n: me.commands }) : t('throne.ui.noCommands')}
              </p>
            </div>
          ) : (
            l.f + l.k > 0 && <p className="text-[12px] text-[#e9dfc8]/55">{t('throne.ui.allTired')}</p>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!!recruitF} title={why(recruitF)} onClick={() => onAction({ type: 'recruit', territory: id, unit: 'f' })} className="throne-btn">
              <FootmanMark />
              {t('throne.ui.recruitF', { n: unitCost(s, 'f') })}
            </button>
            <button type="button" disabled={!!recruitK} title={why(recruitK)} onClick={() => onAction({ type: 'recruit', territory: id, unit: 'k' })} className="throne-btn">
              <KnightMark />
              {t('throne.ui.recruitK', { n: unitCost(s, 'k') })}
            </button>
            <button type="button" disabled={!!marker} title={why(marker) || t('throne.ui.markerHint')} onClick={() => onAction({ type: 'marker', territory: id })} className="throne-btn">
              {t('throne.ui.placeMarker', { n: COST.marker })}
            </button>
            <button type="button" disabled={!!fort} title={why(fort) || t('throne.ui.fortHint', { n: FORT_LIMIT })} onClick={() => onAction({ type: 'fortify', territory: id })} className="throne-btn">
              {t('throne.ui.buildFort', { n: COST.fort })}
            </button>
          </div>
          {(recruitF && recruitF !== 'noSite') && <p className="text-[11.5px] text-[#e9dfc8]/45">{why(recruitF)}</p>}
        </div>
      )}

      <div className="mt-2.5">
        <p className="throne-label mb-1">{t('throne.ui.borders')}</p>
        <div className="flex flex-wrap gap-1">
          {tt.neighbors.map((n) => (
            <button key={n} type="button" onClick={() => onSelect(n)} className="rounded-md border border-white/[0.07] bg-black/20 px-1.5 py-0.5 text-[11.5px] text-[#e9dfc8]/75 hover:border-[#d9b765]/50 hover:text-[#f1e7cf]">
              {s.lands[n].owner && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: HOUSES[s.lands[n].owner].color }} />}
              {land(n)}
            </button>
          ))}
          {tt.seas.map((sea) => (
            <button key={sea} type="button" onClick={() => onSelect(sea)} className="rounded-md border border-[#8fc1dd]/20 bg-[#8fc1dd]/5 px-1.5 py-0.5 text-[11.5px] italic text-[#b7d8ea]/80 hover:border-[#8fc1dd]/50">
              {t(`throne.sea.${sea}`)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AttackConfirm({
  s, pending, send, onConfirm, onCancel,
}) {
  const { t, land, house } = useThroneText();
  const h = currentHouse(s);
  const target = s.lands[pending.to];
  const atk = send.f + 2 * send.k + s.houses[h].bonus;
  const def = defenseOf(s, pending.to);
  const attack = pending.kind === 'attack';
  const chance = Math.round(winChance(atk, def) * 100);
  return (
    <div className="throne-card-in mb-2 rounded-lg border border-[#e3624f]/40 bg-[#8f2a22]/10 p-2.5">
      <p className="throne-label">{t(attack ? 'throne.ui.attackTitle' : 'throne.ui.captureTitle')}{pending.voyage ? ` · ${t('throne.ui.byVoyage')}` : ''}</p>
      <p className="throne-heading text-[16px]">{land(pending.from)} → {land(pending.to)}</p>
      {attack ? (
        <>
          <p className="mt-1 text-[12.5px] text-[#e9dfc8]/75">
            {t('throne.ui.versus', { atk, def, other: target.owner ? house(target.owner) : t('throne.neutral') })}
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/50">
            <div className="h-full rounded-full" style={{ width: `${chance}%`, background: chance >= 60 ? '#6f9e52' : chance >= 40 ? '#d9b765' : '#e3624f' }} />
          </div>
          <p className="mt-1 text-[12px] text-[#e9dfc8]/60">{t('throne.ui.chance', { n: chance })}</p>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] text-[#e9dfc8]/75">{t('throne.ui.captureText')}</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={onCancel} className="throne-btn">{t('common.cancel')}</button>
        <button type="button" onClick={onConfirm} className={`throne-btn ${attack ? 'throne-btn-blood' : 'throne-btn-gold'}`} disabled={send.f + send.k < 1}>
          {t(attack ? 'throne.ui.attack' : 'throne.ui.capture')}
        </button>
      </div>
    </div>
  );
}

export function SeaPanel({ s, id, onSelect }) {
  const { t, land } = useThroneText();
  const sea = SEA[id];
  return (
    <section className="throne-panel p-3">
      <p className="throne-label">{t('throne.ui.seaZone')}</p>
      <h3 className="throne-heading text-[19px] italic text-[#b7d8ea]">{t(`throne.sea.${id}`)}</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-[#e9dfc8]/65">{t(s.event === 'storm' ? 'throne.ui.seaStorm' : 'throne.ui.seaHint')}</p>
      <p className="throne-label mb-1 mt-2.5">{t('throne.ui.coasts')}</p>
      <div className="flex flex-wrap gap-1">
        {sea.coasts.map((c) => (
          <button key={c} type="button" onClick={() => onSelect(c)} className="rounded-md border border-white/[0.07] bg-black/20 px-1.5 py-0.5 text-[11.5px] text-[#e9dfc8]/80 hover:border-[#d9b765]/50">
            {TERRITORY[c].port && '⚓ '}
            {s.lands[c].owner && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: HOUSES[s.lands[c].owner].color }} />}
            {land(c)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function ThronePanel({ s }) {
  const { t, house } = useThroneText();
  const king = throneHolder(s);
  return (
    <section className="throne-panel p-3">
      <div className="flex items-center gap-3">
        <IronThroneBadge className="h-16 w-16 shrink-0" />
        <div className="min-w-0">
          <h3 className="throne-heading text-[19px]">{t('throne.ui.ironThrone')}</h3>
          <p className="text-[12.5px] text-[#e9dfc8]/70">{king ? t('throne.ui.throneHeld', { house: house(king) }) : t('throne.ui.throneEmpty')}</p>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-[#e9dfc8]/65">{t('throne.ui.throneGoal', { n: s.target, rounds: s.roundLimit })}</p>
      <ol className="mt-2 flex flex-col gap-1">
        {standings(s).map((row, i) => (
          <li key={row.id} className={`flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] ${row.out ? 'opacity-40' : ''}`}>
            <span className="w-4 font-mono text-[#e9dfc8]/45">{i + 1}</span>
            <SigilBadge house={row.id} className="h-5 w-5" />
            <span className="min-w-0 flex-1 truncate text-[#f1e7cf]">{house(row.id)}</span>
            <span className="font-mono font-bold tnum text-[#e8c262]">{row.vp}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// --- Cards and diplomacy ---------------------------------------------------------------

export function HandPanel({
  s, humanTurn, targeting, onPlay, onBuy, onCancelTarget, me: viewerHouse,
}) {
  const { t } = useThroneText();
  const h = viewerHouse || currentHouse(s);
  const me = s.houses[h];
  const canBuy = humanTurn && me.gold >= COST.card && me.hand.length < HAND_LIMIT;
  return (
    <section className="throne-panel p-3">
      <PanelTitle aside={<span className="font-mono text-[12px] text-[#e9dfc8]/50">{me.hand.length}/{HAND_LIMIT}</span>}>
        {t('throne.ui.tactics')}
      </PanelTitle>
      {targeting != null && (
        <div className="throne-card-in mb-2 flex items-center gap-2 rounded-lg border border-[#c9a0f2]/40 bg-[#c9a0f2]/10 px-2.5 py-2 text-[12.5px] text-[#e3cffa]">
          <span className="flex-1">{t('throne.ui.pickTarget', { card: t(`throne.card.${me.hand[targeting]}.name`) })}</span>
          <button type="button" onClick={onCancelTarget} className="throne-btn px-2 py-1 text-[12px]">{t('common.cancel')}</button>
        </div>
      )}
      {me.hand.length === 0 && <p className="text-[12.5px] text-[#e9dfc8]/50">{t('throne.ui.noCards')}</p>}
      <ul className="flex flex-col gap-1.5">
        {me.hand.map((card, i) => {
          const targets = cardTargets(s, card);
          const blocked = !humanTurn || me.cardPlayed || (targets && targets.length === 0);
          return (
            // eslint-disable-next-line react/no-array-index-key
            <li key={`${card}-${i}`} className={`throne-parchment flex items-start gap-2 rounded-lg p-2 ${targeting === i ? 'ring-2 ring-[#c9a0f2]' : ''}`}>
              <span className="mt-0.5 text-[#3a2a18]"><CardMark card={card} className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-bold leading-tight text-[#24190d]">{t(`throne.card.${card}.name`)}</p>
                <p className="text-[11.5px] leading-snug text-[#3a2a18]">{t(`throne.card.${card}.text`)}</p>
              </div>
              <button type="button" disabled={blocked} onClick={() => onPlay(i)} className="throne-btn throne-btn-dark shrink-0 px-2 py-1 text-[12px]">
                {t('throne.ui.play')}
              </button>
            </li>
          );
        })}
      </ul>
      {humanTurn && me.cardPlayed && <p className="mt-1.5 text-[11.5px] text-[#e9dfc8]/45">{t('throne.ui.cardPlayed')}</p>}
      <button type="button" disabled={!canBuy} onClick={onBuy} className="throne-btn mt-2 w-full">
        <ResourceMark kind="cards" />
        {t('throne.ui.buyCard', { n: COST.card })}
      </button>
    </section>
  );
}

export function DiplomacyPanel({
  s, humanTurn, onPropose, onBetray, me: viewerHouse,
}) {
  const { t, house } = useThroneText();
  const h = viewerHouse || currentHouse(s);
  const me = s.houses[h];
  const cost = allianceCost(s);
  const others = s.order.filter((o) => o !== h && !s.houses[o].out);
  return (
    <section className="throne-panel p-3">
      <PanelTitle>{t('throne.ui.diplomacy')}</PanelTitle>
      <p className="mb-2 text-[12px] leading-snug text-[#e9dfc8]/55">{t('throne.ui.diplomacyHint', { n: ALLIANCE_ROUNDS })}</p>
      <ul className="flex flex-col gap-1.5">
        {others.map((o) => {
          const al = allianceOf(s, h, o);
          return (
            <li key={o} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
              <SigilBadge house={o} className="h-7 w-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-[#f1e7cf]">{house(o)}</p>
                <p className={`text-[11px] ${al ? 'text-[#8fc1dd]' : 'text-[#e9dfc8]/45'}`}>
                  {al ? t('throne.ui.alliedUntil', { n: al.until }) : t('throne.ui.noPact')}
                </p>
              </div>
              {al ? (
                <button type="button" disabled={!humanTurn || me.influence < COST.betray} onClick={() => onBetray(o)} className="throne-btn throne-btn-blood px-2 py-1 text-[11.5px]" title={t('throne.ui.betrayHint')}>
                  {t('throne.ui.betray', { n: COST.betray })}
                </button>
              ) : (
                <button type="button" disabled={!humanTurn || me.proposed || me.influence < cost} onClick={() => onPropose(o)} className="throne-btn px-2 py-1 text-[11.5px]">
                  {t('throne.ui.propose', { n: cost })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {humanTurn && me.proposed && <p className="mt-1.5 text-[11.5px] text-[#e9dfc8]/45">{t('throne.ui.proposedAlready')}</p>}
    </section>
  );
}

// --- Chronicle ----------------------------------------------------------------------------

export function LogPanel({ s, className = '' }) {
  const { t, logText } = useThroneText();
  const entries = s.log.slice(-90).reverse();
  const previous = s.turnNo - 1;
  return (
    <section className={`throne-panel flex min-h-0 flex-col p-3 ${className}`}>
      <PanelTitle>{t('throne.ui.chronicle')}</PanelTitle>
      <ol className="scrollbar-thin -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {entries.map((e, i) => {
          const header = i === 0 || entries[i - 1].turnNo !== e.turnNo;
          const isPrev = e.turnNo === previous;
          return (
            <li key={e.n}>
              {header && (
                <p className={`throne-label mb-1 mt-2 flex items-center gap-1.5 first:mt-0 ${isPrev ? 'text-[#e8c262]' : ''}`}>
                  <span className="h-px flex-1 bg-white/10" />
                  {e.turnNo === s.turnNo ? t('throne.ui.thisTurn') : isPrev ? t('throne.ui.prevTurn') : t('throne.ui.roundShort', { n: e.round })}
                  <span className="h-px flex-1 bg-white/10" />
                </p>
              )}
              <p className={`flex items-start gap-1.5 py-0.5 text-[12px] leading-snug ${isPrev || e.turnNo === s.turnNo ? 'text-[#f1e7cf]/90' : 'text-[#e9dfc8]/55'}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: e.house ? HOUSES[e.house].color : '#d9b765' }} />
                <span>{logText(e)}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- Dialogs ---------------------------------------------------------------------------------

function Die({ value, tone }) {
  const pips = {
    1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]], 5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]],
  };
  return (
    <svg viewBox="0 0 24 24" className="throne-die h-10 w-10" aria-label={String(value)}>
      <rect x="1" y="1" width="22" height="22" rx="4" fill={tone} stroke="#0c0b09" strokeWidth="1.5" />
      {(pips[value] || []).map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="#f4ecdc" />)}
    </svg>
  );
}

export function BattleReport({ report, onClose }) {
  const { t, house, land } = useThroneText();
  const side = (h, base, roll, total, loss, label) => (
    <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
      {h ? <SigilBadge house={h} className="h-14 w-14" /> : <IronThroneBadge className="h-14 w-14 opacity-60" />}
      <p className="throne-label">{label}</p>
      <p className="max-w-[9rem] truncate text-[13px] font-semibold text-[#f1e7cf]">{house(h)}</p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[18px] font-bold text-[#e9dfc8]/80">{base}</span>
        <span className="text-[#e9dfc8]/40">+</span>
        <Die value={roll} tone={h ? HOUSES[h].deep : '#3d3a33'} />
      </div>
      <p className="font-display text-[30px] font-black leading-none text-[#f1e7cf]">{total}</p>
      <p className="text-[11.5px] text-[#f0a090]">{t('throne.ui.lossesN', { n: loss })}</p>
    </div>
  );
  return (
    <Modal
      onClose={onClose}
      title={t('throne.ui.battleFor', { t: land(report.to) })}
      subtitle={report.voyage ? t('throne.ui.byVoyage') : t('throne.ui.fromLand', { t: land(report.from) })}
      accent={`linear-gradient(90deg, ${HOUSES[report.attacker].color}, ${report.defender ? HOUSES[report.defender].color : '#55524a'})`}
      footer={<div className="flex justify-end"><button type="button" onClick={onClose} className="throne-btn throne-btn-gold px-5">{t('throne.ui.ok')}</button></div>}
    >
      <div className="flex items-start gap-2">
        {side(report.attacker, report.atkBase, report.rollA, report.atk, report.atkLoss, t('throne.ui.attacker'))}
        <span className="mt-16 font-display text-[20px] text-[#e9dfc8]/40">⚔</span>
        {side(report.defender, report.defBase, report.rollD, report.def, report.defLoss + (report.win ? report.garrison : 0), t('throne.ui.defender'))}
      </div>
      <p className={`mt-4 rounded-lg border px-3 py-2 text-center text-[14px] font-semibold ${report.win ? 'border-[#6f9e52]/50 bg-[#6f9e52]/10 text-[#b9dca0]' : 'border-[#e3624f]/40 bg-[#8f2a22]/15 text-[#f0a090]'}`}>
        {report.win ? t('throne.ui.battleWon', { house: house(report.attacker), t: land(report.to) }) : t('throne.ui.battleLost', { house: house(report.attacker), t: land(report.to) })}
      </p>
      {report.retreat && <p className="mt-2 text-center text-[12.5px] text-[#e9dfc8]/65">{t('throne.ui.retreat', { t: land(report.retreat) })}</p>}
      {report.routed && <p className="mt-2 text-center text-[12.5px] text-[#e9dfc8]/65">{t('throne.ui.routed')}</p>}
      <p className="mt-2 text-center text-[11.5px] text-[#e9dfc8]/40">{t('throne.ui.battleRule')}</p>
    </Modal>
  );
}

export function ProposalDialog({ s, onRespond, online = false }) {
  const { t, house } = useThroneText();
  const { from, to } = s.proposal;
  return (
    <Modal
      onClose={() => onRespond(false)}
      title={t('throne.ui.proposalTitle')}
      subtitle={t('throne.ui.proposalFor', { house: house(to) })}
      accent={`linear-gradient(90deg, ${HOUSES[from].color}, ${HOUSES[to].color})`}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onRespond(false)} className="throne-btn px-4">{t('throne.ui.decline')}</button>
          <button type="button" onClick={() => onRespond(true)} className="throne-btn throne-btn-gold px-4">{t('throne.ui.accept')}</button>
        </div>
      )}
    >
      <div className="flex items-center justify-center gap-4">
        <SigilBadge house={from} className="h-16 w-16" />
        <span className="font-display text-[26px] text-[#d9b765]">⚭</span>
        <SigilBadge house={to} className="h-16 w-16" />
      </div>
      <p className="mt-3 text-center text-[14px] text-[#e9dfc8]/85">{t('throne.ui.proposalText', { from: house(from), to: house(to), n: s.round + ALLIANCE_ROUNDS })}</p>
      {!online && <p className="mt-2 text-center text-[12px] text-[#e9dfc8]/50">{t('throne.ui.passDevice', { house: house(to) })}</p>}
    </Modal>
  );
}

export function RulesModal({ onClose }) {
  const { t } = useThroneText();
  const sections = ['goal', 'turn', 'army', 'battle', 'economy', 'diplomacy', 'cards', 'map'];
  return (
    <Modal onClose={onClose} title={t('throne.rules.title')} subtitle={t('menu.throne.title')} widthClass="max-w-2xl" icon={<IronThroneBadge className="h-7 w-7" />}>
      <div className="flex flex-col gap-4">
        {sections.map((sec) => (
          <section key={sec}>
            <h3 className="throne-heading mb-1 text-[16px]">{t(`throne.rules.${sec}.title`)}</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-snug text-parch/80">
              {t(`throne.rules.${sec}.text`).split('|').map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
