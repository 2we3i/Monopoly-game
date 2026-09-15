// logFormat.js
// Turns a Catan log entry into display parts: translated text plus
// resource icons, so "P2 receives 2 wheat and 1 ore" shows the cards
// rather than spelling them out.

function resourceParts(hand) {
  return Object.entries(hand || {})
    .filter(([, n]) => n > 0)
    .map(([res, n]) => ({ res, n }));
}

export function catanLogParts(entry, t) {
  const p = entry.params || {};
  const text = (key, vars = p) => ({ text: t(`catan.log.${key}`, vars) });
  const card = (id) => t(`catan.dev.${id}.name`);

  switch (entry.type) {
    case 'PLACED_SETTLEMENT': {
      const gained = resourceParts(p.resources);
      return gained.length ? [text('PLACED_SETTLEMENT_GAIN'), ...gained] : [text('PLACED_SETTLEMENT')];
    }
    case 'PRODUCED':
      return [text('PRODUCED'), ...resourceParts(p.resources)];
    case 'YEAR_OF_PLENTY':
      return [text('YEAR_OF_PLENTY'), ...resourceParts(p.resources)];
    case 'ROLLED':
      return [text('ROLLED', {
        name: p.name, total: p.total, a: p.dice?.[0], b: p.dice?.[1],
      })];
    case 'BANK_TRADE':
      return [text('BANK_TRADE'), { res: p.give, n: p.giveCount }, { text: '→' }, { res: p.get, n: p.getCount }];
    case 'TRADE_OFFERED':
      return [text('TRADE_OFFERED'), ...resourceParts(p.give), { text: '⇄' }, ...resourceParts(p.get)];
    case 'TRADED':
      return [text('TRADED'), ...resourceParts(p.give), { text: '⇄' }, ...resourceParts(p.get)];
    case 'PLAYED_DEV':
      return [text('PLAYED_DEV', { name: p.name, card: card(p.card) })];
    case 'YOU_BOUGHT_DEV':
      return [text('YOU_BOUGHT_DEV', { card: card(p.card) })];
    case 'MONOPOLY':
      return [text('MONOPOLY', { name: p.name, count: p.count }), { res: p.resource }];
    case 'STOLE_PRIVATE':
      return [text('STOLE_PRIVATE'), { res: p.resource, n: 1 }];
    case 'BANK_SHORT':
      return [text('BANK_SHORT'), { res: p.resource }];
    case 'ROBBER_MOVED':
      return [text('ROBBER_MOVED', { name: p.name, terrain: t(`catan.terrain.${p.terrain}`) })];
    case 'BUILT_ROAD':
      return [text(p.free ? 'BUILT_ROAD_FREE' : 'BUILT_ROAD')];
    default:
      return [text(entry.type)];
  }
}

// The public "someone stole a card" line is redundant for the two players
// who also get the private line naming the card.
export function visibleLog(log) {
  return log.filter((entry, i) => !(entry.type === 'STOLE' && log[i + 1]?.type === 'STOLE_PRIVATE'));
}
