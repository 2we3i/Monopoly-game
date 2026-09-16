// useThroneControls.js
// How a lord works the Iron Throne map, shared by the hot-seat table and
// the online room so both behave the same:
//
//   click a territory      select it (info + actions in the right panel)
//   own army selected      highlighted lands are where it can go - blue a
//                          march, gold a free capture, red a battle
//   click a highlight      march at once; a capture or battle asks first
//   tactic card            highlighted targets, click one to play it
//   Escape / Enter         cancel (card, attack, selection) / confirm attack
//
// `canAct` says whether the viewer may act right now (their turn, nothing
// pending); `dispatch` sends an engine action - applied locally on the
// hot-seat table, sent to the server online.

import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import {
  CARD_TARGET, HOUSES, cardTargets, currentHouse, freeUnits, moveTargets,
} from './engine';

export default function useThroneControls({
  game, canAct, dispatch, initialSeenBattle = null, selectSeatOnTurn = true,
}) {
  const [selected, setSelected] = useState(null);
  const [sendPick, setSendPick] = useState(null);
  const [pending, setPending] = useState(null);
  const [targeting, setTargeting] = useState(null);
  const [seenBattle, setSeenBattle] = useState(initialSeenBattle);

  const cur = game ? currentHouse(game) : null;

  // A new turn starts clean; the lord whose turn it is finds their seat.
  const turnNo = game?.turnNo;
  useEffect(() => {
    setPending(null);
    setTargeting(null);
    if (game && canAct && selectSeatOnTurn) {
      const seat = HOUSES[cur].seat;
      setSelected(game.lands[seat]?.owner === cur ? seat : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnNo]);

  // The troops to send default to everything free in the selected land; a
  // choice made with the steppers sticks to that land and never exceeds
  // what is still free after the state changes.
  const selLand = game && selected ? game.lands[selected] : null;
  const free = selLand ? freeUnits(selLand) : { f: 0, k: 0 };
  const send = sendPick && sendPick.id === selected
    ? { f: Math.min(sendPick.f, free.f), k: Math.min(sendPick.k, free.k) }
    : free;
  const setSend = (next) => setSendPick({ id: selected, f: next.f, k: next.k });

  const targets = useMemo(() => {
    const map = new Map();
    if (!game || !canAct) return map;
    const me = game.houses[cur];
    if (targeting != null) {
      (cardTargets(game, me.hand[targeting]) || []).forEach((id) => map.set(id, 'card'));
      return map;
    }
    if (selLand && selLand.owner === cur && me.commands > 0 && send.f + send.k > 0) {
      moveTargets(game, selected).forEach((m) => map.set(m.id, m.kind));
    }
    return map;
  }, [game, canAct, cur, targeting, selLand, selected, send.f, send.k]);

  const select = useCallback((id) => {
    setPending(null);
    setSelected(id);
  }, []);

  const onLand = (id) => {
    if (!canAct) {
      setSelected(id);
      return;
    }
    if (targeting != null) {
      if (targets.has(id)) {
        dispatch({ type: 'playCard', index: targeting, target: id });
        setTargeting(null);
      }
      return;
    }
    const kind = targets.get(id);
    if (kind === 'move') {
      dispatch({
        type: 'move', from: selected, to: id, f: send.f, k: send.k,
      });
      setPending(null);
      return;
    }
    if (kind) {
      const voyage = moveTargets(game, selected).find((m) => m.id === id)?.voyage;
      setPending({
        from: selected, to: id, kind, voyage,
      });
      return;
    }
    select(id);
  };

  const onSea = (id) => { if (targeting == null) select(id); };
  const onThrone = () => { if (targeting == null) select('throne'); };

  const confirmPending = () => {
    if (!pending) return;
    dispatch({
      type: 'move', from: pending.from, to: pending.to, f: send.f, k: send.k,
    });
    setPending(null);
  };

  const playCard = (index) => {
    const card = game.houses[cur].hand[index];
    if (CARD_TARGET[card]) {
      setTargeting(index);
      setPending(null);
    } else {
      dispatch({ type: 'playCard', index });
    }
  };

  const battle = game?.battle && game.battle.id !== seenBattle ? game.battle : null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'Escape') {
        if (targeting != null) setTargeting(null);
        else if (pending) setPending(null);
        else setSelected(null);
      }
      if (e.key === 'Enter' && pending && !battle) confirmPending();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return {
    selected,
    setSelected: select,
    send,
    setSend,
    pending,
    cancelPending: () => setPending(null),
    confirmPending,
    targeting,
    cancelTargeting: () => setTargeting(null),
    targets,
    onLand,
    onSea,
    onThrone,
    playCard,
    battle,
    closeBattle: () => battle && setSeenBattle(battle.id),
    setSeenBattle,
    resetSelection: () => {
      setSelected(null);
      setPending(null);
      setTargeting(null);
    },
  };
}
