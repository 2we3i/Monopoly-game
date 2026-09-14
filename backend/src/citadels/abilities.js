// abilities.js
// Active role powers. Each entry takes (game, player, payload), validates
// the payload against the real game state - never against anything the
// client claims - and applies the effect through the game's own helpers.
//
// Secrecy lives here too: the Assassin's and the Thief's choices go into
// private log entries only their holder can read. The rest of the table
// learns the target when the engine calls that role, not before.

const { CitadelsError } = require('./errors');
const { ROLES, roleDef } = require('./roles');
const { districtDef } = require('./districts');

function assertRoleTarget(game, roleId, forbidden) {
  if (typeof roleId !== 'string' || !ROLES[roleId]) throw new CitadelsError('Choose a role.');
  if (forbidden.includes(roleId)) throw new CitadelsError('That role cannot be targeted.');
  if (game.faceUp.includes(roleId)) throw new CitadelsError('That role is face up and not in play this round.');
}

const ABILITIES = {
  KILL_ROLE(game, player, { targetRole }) {
    assertRoleTarget(game, targetRole, ['ASSASSIN']);
    game.assassinated = targetRole;
    game.addLog('ASSASSIN_TARGETED', { role: targetRole }, [player.id]);
    game.addLog('ASSASSIN_ACTED', { name: player.nickname });
  },

  ROB_ROLE(game, player, { targetRole }) {
    assertRoleTarget(game, targetRole, ['ASSASSIN', 'THIEF']);
    game.robbed = targetRole;
    game.addLog('THIEF_TARGETED', { role: targetRole }, [player.id]);
    game.addLog('THIEF_ACTED', { name: player.nickname });
  },

  MAGIC(game, player, { mode, targetPlayerId, cardUids }) {
    if (mode === 'SWAP') {
      const target = game.getPlayer(targetPlayerId);
      if (!target || target.id === player.id) throw new CitadelsError('Choose another player.');
      const mine = player.hand;
      player.hand = target.hand;
      target.hand = mine;
      game.addLog('MAGIC_SWAP', { name: player.nickname, target: target.nickname });
      return;
    }
    if (mode === 'REDRAW') {
      if (!Array.isArray(cardUids) || cardUids.length === 0) throw new CitadelsError('Choose cards to discard.');
      const unique = [...new Set(cardUids)];
      if (unique.length !== cardUids.length || !unique.every((uid) => player.hand.includes(uid))) {
        throw new CitadelsError('You can only discard cards from your own hand.');
      }
      player.hand = player.hand.filter((uid) => !unique.includes(uid));
      game.discard(unique);
      player.hand.push(...game.drawCards(unique.length));
      game.addLog('MAGIC_REDRAW', { name: player.nickname, count: unique.length });
      return;
    }
    throw new CitadelsError('Choose swap or redraw.');
  },

  DESTROY(game, player, { targetPlayerId, cardUid }) {
    const target = game.getPlayer(targetPlayerId);
    if (!target) throw new CitadelsError('Choose a player.');
    const entry = target.city.find((c) => c.uid === cardUid);
    if (!entry) throw new CitadelsError('That district is not in that city.');
    if (target.city.length >= game.settings.citySize) throw new CitadelsError('A completed city cannot be attacked.');
    // The Bishop's protection holds for the round unless the Bishop was
    // assassinated - by the Warlord's turn the Bishop has already been
    // called, so this reveals nothing that is still secret.
    if (roleDef(target.role)?.protectsCity && game.assassinated !== target.role) {
      throw new CitadelsError('The Bishop\'s districts are protected.');
    }
    const def = districtDef(entry.districtId);
    if (def.special?.indestructible) throw new CitadelsError('This district cannot be destroyed.');
    const wall = target.city.some((c) => c.uid !== entry.uid && districtDef(c.districtId).special?.wallTax);
    const price = Math.max(0, def.cost - 1 + (wall ? 1 : 0));
    if (player.gold < price) throw new CitadelsError(`Destroying it costs ${price} gold.`);
    player.gold -= price;
    target.city = target.city.filter((c) => c.uid !== entry.uid);
    game.discard([entry.uid]);
    game.addLog('DESTROYED', {
      name: player.nickname, target: target.nickname, districtId: def.id, cost: price,
    });
  },
};

module.exports = ABILITIES;
