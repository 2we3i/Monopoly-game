// PartyRoom.js
// What every "one big screen, a phone each" party game has in common.
//
// ЧПОК and Meme Hype are different games with the same room around them:
// seats that are phones or screens, a host who runs the table, a lobby,
// a clock per phase, players who drop out, and a payload per viewer. This
// class is that room. A game extends it and supplies the rounds.
//
// A subclass provides:
//   static ErrorClass, static PHASES (LOBBY, GAME_OVER plus its own),
//   static MIN_PLAYERS, sanitizeSettings(patch, base), maxSeats(),
//   screenPlaysByDefault(isFirstSeat), onSeatLeft(player), finish(reason)
// and everything about rounds.

const crypto = require('crypto');

const token = () => crypto.randomBytes(8).toString('hex');

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickOption(value, options, fallback) {
  const n = Math.round(Number(value));
  return options.includes(n) ? n : fallback;
}

class PartyRoom {
  constructor(gameType, roomCode, hostId, settings) {
    this.gameType = gameType;
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.settings = this.sanitizeSettings(settings);
    this.players = [];
    this.phase = this.constructor.PHASES.LOBBY;
    this.round = 0;
    this.phaseEndsAt = null;
    this.results = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.endedAt = null;
  }

  fail(message) {
    const ErrorClass = this.constructor.ErrorClass || Error;
    return new ErrorClass(message);
  }

  get inLobby() {
    return this.phase === this.constructor.PHASES.LOBBY;
  }

  get isOver() {
    return this.phase === this.constructor.PHASES.GAME_OVER;
  }

  // --- seats -----------------------------------------------------------

  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId) || null;
  }

  // Everyone taking part: not a seat that was left, and not a screen that
  // is only showing the game.
  activePlayers() {
    return this.players.filter((p) => !p.left && p.playing);
  }

  presentPlayers() {
    return this.players.filter((p) => !p.left);
  }

  // Defaults a subclass may override.
  maxSeats() {
    return 12;
  }

  screenPlaysByDefault(isFirstSeat) {
    return isFirstSeat;
  }

  // The phases in which a newcomer may take a seat after the start.
  lateJoinPhases() {
    return [];
  }

  // Extra fields a new seat starts with.
  freshSeat() {
    return {};
  }

  onSeatLeft() {}

  setPlaying(playerId, playing) {
    const player = this.getPlayer(playerId);
    if (!player) throw this.fail('Player not found.');
    if (!this.inLobby) throw this.fail('That can only be changed before the game starts.');
    if (playing && !player.playing && this.activePlayers().length >= this.maxSeats()) {
      throw this.fail(`This room holds at most ${this.maxSeats()} players.`);
    }
    player.playing = !!playing;
    if (!player.playing) player.ready = false;
    return player;
  }

  addPlayer({
    playerId, socketId, nickname, avatarUrl = null, accountId = null, guestKeyHash = null, device = null,
  }) {
    const existing = this.getPlayer(playerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      // A payload that does not say which device it is leaves the seat
      // alone, so a reconnect never relabels a phone.
      if (device) existing.device = device;
      if (accountId) {
        existing.nickname = nickname || existing.nickname;
        existing.avatarUrl = avatarUrl;
      }
      return existing;
    }
    if (this.isOver) throw this.fail('This game is over.');
    if (!this.inLobby) {
      if (this.settings.allowLateJoin === false || this.lateJoinPhases().length === 0) {
        throw this.fail('This game has already started.');
      }
      if (!this.lateJoinPhases().includes(this.phase)) {
        throw this.fail('The round is in progress - you can join at the end of it.');
      }
    }
    const isFirst = this.players.length === 0;
    const kind = device || 'screen';
    const wantsToPlay = kind !== 'screen' || this.screenPlaysByDefault(isFirst);
    if (wantsToPlay && this.activePlayers().length >= this.maxSeats()) {
      throw this.fail(`This room holds at most ${this.maxSeats()} players.`);
    }
    const player = {
      id: playerId,
      socketId,
      nickname: String(nickname || 'Player').slice(0, 20),
      avatarUrl,
      accountId,
      guestKeyHash,
      device: kind,
      playing: wantsToPlay,
      connected: true,
      left: false,
      isHost: isFirst,
      ready: false,
      score: 0,
      roundsPlayed: 0,
      exitReason: null,
      surrendered: false,
      ...this.freshSeat(),
    };
    if (player.isHost) this.hostId = player.id;
    this.players.push(player);
    return player;
  }

  handOffHost(leaving) {
    if (!leaving.isHost) return;
    leaving.isHost = false;
    const candidates = this.players.filter((p) => p.id !== leaving.id && !p.left);
    // A room with no host at all can never be started or moved on, so the
    // last fallback is a seat that has also been left.
    const remaining = this.players.filter((p) => p.id !== leaving.id);
    const heir = candidates.find((p) => p.accountId && p.connected)
      || candidates.find((p) => p.accountId)
      || candidates.find((p) => p.connected)
      || candidates[0]
      || remaining.find((p) => p.accountId)
      || remaining[0];
    if (heir) {
      heir.isHost = true;
      this.hostId = heir.id;
    }
  }

  removePlayer(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (this.inLobby) {
      this.handOffHost(player);
      this.players = this.players.filter((p) => p.id !== playerId);
      return;
    }
    player.left = true;
    player.connected = false;
    player.socketId = null;
    this.handOffHost(player);
    if (this.isOver) return;
    this.onSeatLeft(player);
    if (this.activePlayers().length < this.constructor.MIN_PLAYERS) this.finish('tooFew');
  }

  setConnected(playerId, connected, socketId = null) {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    player.connected = connected;
    player.socketId = connected ? socketId : null;
    return player;
  }

  setReady(playerId, ready) {
    const player = this.getPlayer(playerId);
    if (!player) throw this.fail('Player not found.');
    if (this.inLobby) player.ready = !!ready;
    return player;
  }

  assertHost(playerId) {
    if (playerId !== this.hostId) throw this.fail('Only the host can do that.');
  }

  updateSettings(playerId, patch) {
    this.assertHost(playerId);
    if (!this.inLobby) throw this.fail('Settings can only be changed before the game starts.');
    this.settings = this.sanitizeSettings(patch, this.settings);
    return this.settings;
  }

  assertCanStart(playerId, label) {
    this.assertHost(playerId);
    if (!this.inLobby) throw this.fail('The game has already started.');
    const min = this.constructor.MIN_PLAYERS;
    if (this.activePlayers().length < min) {
      throw this.fail(`${label} needs at least ${min} players with a phone connected.`);
    }
  }

  enterPhase(phase, durationSec) {
    this.phase = phase;
    this.phaseEndsAt = durationSec ? Date.now() + durationSec * 1000 : null;
  }

  // The standings every party game ends with. `extra(p)` adds a game's own
  // columns (round wins, votes received...).
  buildResults(reason, extra = () => ({})) {
    const standings = this.players
      .filter((p) => p.playing)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        score: p.score,
        rounds: p.roundsPlayed,
        left: !!p.left,
        exitReason: p.exitReason || null,
        ...extra(p),
      }))
      .sort((a, b) => (a.left - b.left) || (b.score - a.score) || a.nickname.localeCompare(b.nickname));
    // Only a player who is still here can win, and a table where nobody
    // scored has no winner rather than a room full of them.
    const staying = standings.filter((row) => !row.left);
    const best = staying.reduce((max, row) => Math.max(max, row.score), 0);
    return {
      reason,
      rounds: this.round,
      standings,
      winnerIds: best > 0 ? staying.filter((r) => r.score === best).map((r) => r.playerId) : [],
    };
  }

  endWith(results) {
    this.results = results;
    this.phase = this.constructor.PHASES.GAME_OVER;
    this.phaseEndsAt = null;
    this.endedAt = Date.now();
  }

  // The seat as every viewer may see it; a game adds its own fields.
  publicSeat(p, viewer) {
    return {
      id: p.id,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
      isGuest: !p.accountId,
      isHost: p.isHost,
      device: p.device,
      playing: !!p.playing,
      connected: p.connected,
      left: !!p.left,
      exitReason: p.exitReason || null,
      surrendered: !!p.surrendered,
      ready: p.ready,
      score: p.score,
      isYou: viewer ? p.id === viewer.id : false,
    };
  }

  // Restoring from disk: nobody is connected until they say so.
  static restore(game, data, fields) {
    fields.forEach((field) => {
      if (data[field] !== undefined && data[field] !== null) game[field] = data[field];
    });
    game.players.forEach((p) => {
      p.connected = false;
      p.socketId = null;
      if (p.playing === undefined) p.playing = true;
    });
    return game;
  }
}

PartyRoom.BASE_FIELDS = [
  'players', 'phase', 'round', 'results', 'phaseEndsAt', 'createdAt', 'startedAt', 'endedAt',
];

module.exports = {
  PartyRoom, shuffle, token, pickOption,
};
