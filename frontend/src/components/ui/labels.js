// labels.js
// Human names for the ids the server sends: games, modes, phases, roles.

export function gameName(t, gameType) {
  return t(`menu.${gameType}.title`);
}

export function modeName(t, modeId) {
  if (!modeId) return '—';
  const key = `mode.${modeId}`;
  const label = t(key);
  return label === key ? modeId : label;
}

export function phaseName(t, gameType, phase) {
  const keys = {
    mafia: `mafia.phase.${phase}`,
    citadels: `citadels.phase.${phase}`,
    bunker: `bunker.phase.${phase}`,
    catan: `catan.phase.${phase}`,
    cosmic: `cosmic.gamePhase.${phase}`,
    throne: `throne.phase.${phase}`,
    chpok: `chpok.phase.${phase}`,
    memehype: `hype.phase.${phase}`,
    monopoly: `admin.monopolyPhase.${phase}`,
  };
  const key = keys[gameType];
  const label = key ? t(key) : phase;
  return label === key ? phase : label;
}

export function stageTone(stage) {
  return { lobby: 'blue', active: 'green', finished: 'zinc' }[stage] || 'zinc';
}

export function resultTone(result, status) {
  if (result === 'win') return 'green';
  if (result === 'loss') return 'red';
  return status === 'active' ? 'blue' : 'zinc';
}

export function citadelsRoleName(config, roleId, language) {
  const role = config?.roles?.find((r) => r.id === roleId);
  return role ? (role.name[language] || role.name.en) : roleId;
}

export function citadelsDistrict(config, districtId) {
  return config?.districts?.find((d) => d.id === districtId) || null;
}
