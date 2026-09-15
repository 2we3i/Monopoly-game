// logFormat.js
// Turns a Cosmic Encounter log entry into a readable line. Planet ids
// ("red-2") become "planet 3 of Red", cards become their names.

export function planetLabel(planetId, t) {
  if (!planetId) return '';
  const [color, index] = String(planetId).split('-');
  // Planet labels need the colour agreeing with "planet" (feminine in Russian).
  return t('cosmic.planetOf', { n: Number(index) + 1, color: t(`cosmic.planetColor.${color}`) });
}

export function cardLabel(card, t) {
  if (!card) return '';
  switch (card.type) {
    case 'attack': return t('cosmic.cardName.attack', { n: card.value });
    case 'negotiate': return t('cosmic.card.negotiate');
    case 'morph': return t('cosmic.card.morph');
    case 'reinforcement': return t('cosmic.cardName.reinforcement', { n: card.value });
    case 'artifact': return t(`cosmic.artifact.${card.artifact}.name`);
    default: return '?';
  }
}

export function destinyLabel(destiny, t) {
  if (!destiny) return '';
  if (destiny.kind === 'color') return t('cosmic.destiny.color', { color: t(`cosmic.color.${destiny.color}`) });
  if (destiny.kind === 'wild') return t('cosmic.destiny.wild');
  return t(`cosmic.destiny.special.${destiny.rule}`);
}

const cards = (list, t) => (list || []).map((c) => cardLabel(c, t)).join(', ') || '—';

export function cosmicLogText(entry, t) {
  const p = entry.params || {};
  const key = `cosmic.log.${entry.type}`;
  switch (entry.type) {
    case 'ALIEN_REVEALED':
      return t(key, { name: p.name, alien: t(`cosmic.alien.${p.alien}.name`) });
    case 'REGROUPED':
    case 'LAUNCHED':
    case 'COLONY_CREATED':
    case 'COLONY_REINFORCED':
    case 'HOME_RESTORED':
      return t(key, { ...p, planet: planetLabel(p.planet, t) });
    case 'DESTINY_DRAWN':
      return t(key, { name: p.name, card: destinyLabel(p, t) });
    case 'INVITED':
      return t(`${key}.${p.side}`, { name: p.name, names: p.names?.length ? p.names.join(', ') : t('cosmic.nobody') });
    case 'ALLY_JOINED':
      return t(`${key}.${p.side}`, { name: p.name, count: p.count }) + (p.parasite ? ` (${t('cosmic.alien.parasite.power')})` : '');
    case 'CARDS_REVEALED':
      return t(key, { offense: cardLabel(p.offense, t), defense: cardLabel(p.defense, t) });
    case 'DEFENSE_REDRAW':
      return t(key, { name: p.name, cards: cards(p.cards, t) });
    case 'COMPENSATION_CARDS':
    case 'PLAGUE':
      return t(key, { ...p, cards: cards(p.cards, t) });
    case 'DEAL_CARDS':
      return t(key, { ...p, give: cards(p.give, t), take: cards(p.take, t) });
    case 'DEAL_DONE':
      return t(key, { by: p.by, other: p.other, give: p.give, take: p.take }) + (p.colonies?.length
        ? ` ${p.colonies.map((c) => t('cosmic.log.dealColony', { name: c.name, planet: planetLabel(c.planet, t) })).join(' ')}`
        : '');
    case 'DEAL_FAILED':
      return t(`${key}.${p.reason}`) === `${key}.${p.reason}` ? t(key) : t(`${key}.${p.reason}`);
    case 'OFFENSE_WON':
    case 'DEFENSE_WON':
      return t(key, { name: p.name }) + (p.totals ? ` (${p.totals.offense} : ${p.totals.defense})` : '');
    case 'REINFORCED':
      return t(`${key}.${p.side}`, { name: p.name, value: p.value });
    case 'ARTIFACT_PLAYED':
    case 'ARTIFACT_CANCELLED':
      return t(key, { name: p.name, artifact: t(`cosmic.artifact.${p.artifact}.name`) }) + (p.target ? ` → ${p.target}` : '');
    case 'FORCE_FIELD':
      return t(key, { names: (p.names || []).join(', ') });
    case 'POWER_FIDO_OFFER':
      return t(key, { name: p.name, target: p.target, card: cardLabel(p.card, t) });
    case 'POWER_FIDO_ACCEPTED':
      return t(key, { name: p.name, fido: p.fido, reward: t(`cosmic.fetch.reward.${p.reward}`) });
    case 'GAME_OVER':
      return t(key, { names: (p.names || []).join(', ') });
    default:
      return t(key, p);
  }
}
