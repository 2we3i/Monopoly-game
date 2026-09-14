// logFormat.js
// Turns a Citadels log entry (a type plus ids) into a sentence in the
// player's language, with role and district ids replaced by their names.

import { citadelsDistrict, citadelsRoleName } from '../ui/labels';

export function formatCitadelsLog(entry, t, config, language) {
  const params = { ...entry.params };
  let type = entry.type;
  if (params.role) params.role = citadelsRoleName(config, params.role, language);
  if (params.districtId) {
    const district = citadelsDistrict(config, params.districtId);
    params.district = district ? (district.name[language] || district.name.en) : params.districtId;
  }
  if (type === 'ROUND_STARTED') {
    if (params.faceUp?.length) params.faceUp = params.faceUp.map((r) => citadelsRoleName(config, r, language)).join(', ');
    else type = 'ROUND_STARTED_CLEAN';
  }
  return t(`citadels.log.${type}`, params);
}
