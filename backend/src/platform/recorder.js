// recorder.js
// Turns live room updates into match history.
//
// Games do not call "match started" or "match ended" themselves; every
// broadcast hands the recorder a summary of the room, and the recorder
// notices the transitions: lobby -> active opens a match, active ->
// finished closes it with results, and a room that disappears (or goes
// back to its lobby) while a match is open marks that match aborted.
// Because the open match is also looked up in the database, a server
// restart in the middle of a game does not produce a duplicate.

const platformDb = require('../db/platform');
const testing = require('./testing');

const open = new Map(); // roomCode -> matchId

function openMatchId(roomCode) {
  if (open.has(roomCode)) return open.get(roomCode);
  const row = platformDb.findActiveMatch(roomCode);
  if (row) {
    open.set(roomCode, row.id);
    return row.id;
  }
  return null;
}

// summary: { gameType, roomCode, modeId, hostAccountId, stage, players:
// [{ playerId, accountId, nickname }], results: { winner, players: [...] } }
function observe(summary) {
  if (!summary || !summary.roomCode) return;
  // A Creator's test match is never recorded and never pays anything.
  if (testing.isTestRoom(summary.roomCode)) return;
  const { roomCode, stage } = summary;
  const matchId = openMatchId(roomCode);

  if (stage === 'active' && !matchId) {
    const id = platformDb.startMatch({
      roomCode,
      gameType: summary.gameType,
      modeId: summary.modeId,
      hostAccountId: summary.hostAccountId,
      startedAt: summary.startedAt || Date.now(),
      players: summary.players,
    });
    open.set(roomCode, id);
    return;
  }

  if (stage === 'finished' && matchId) {
    platformDb.finishMatch(matchId, summary.results || {});
    open.delete(roomCode);
    // Required lazily: the economy notifies players over presence, which
    // is only wired up once the server is running.
    // eslint-disable-next-line global-require
    require('../economy/service').onMatchFinished(matchId, summary);
    return;
  }

  if (stage === 'lobby' && matchId) {
    platformDb.abortMatch(matchId);
    open.delete(roomCode);
  }
}

function roomGone(roomCode, reason = 'empty') {
  const matchId = openMatchId(roomCode);
  if (matchId) platformDb.abortMatch(matchId);
  open.delete(roomCode);
  platformDb.logRoomClosed(roomCode, reason);
}

module.exports = { observe, roomGone };
