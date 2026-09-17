// MemeHypeGame.js
// MEME HYPE: a party game for 3-6 friends.
//
// The big screen shows a situation. Every player holds a hand of memes on
// their phone and plays the one that fits best. When everyone has played,
// the memes go up on the screen anonymously - MEM #1, MEM #2 - and the
// table votes for the funniest. Only then is it revealed who played what;
// votes become points, the best meme wins the round, hands are topped up
// and the next situation comes up.
//
// The room around it (seats, phones and screens, host, lobby, drop-outs)
// is the shared PartyRoom. Everything that decides anything is here: what
// is dealt to whom, which card a phone may play, who may vote for what, the
// count and the table. A hand is private: it is only ever in its owner's
// payload.

const {
  PartyRoom, shuffle, token, pickOption,
} = require('../party/PartyRoom');
const content = require('./content');

class MemeHypeError extends Error {}

const PHASES = {
  LOBBY: 'LOBBY',
  PICK: 'PICK',
  VOTE: 'VOTE',
  REVEAL: 'REVEAL',
  GAME_OVER: 'GAME_OVER',
};

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const REVEAL_SEC = 12;
const POINTS_PER_VOTE = 100;
const WIN_BONUS = 100;
// How many of a player's last-seen memes are kept out of their next draws.
const RECENT_MEMORY = 30;
const ROUND_OPTIONS = [5, 8, 10, 12, 15];
const PICK_SEC_OPTIONS = [30, 45, 60, 90];
const VOTE_SEC_OPTIONS = [20, 30, 45];
const HAND_OPTIONS = [5, 6, 7];
const SEAT_OPTIONS = [3, 4, 5, 6];
const TIMEOUT_OPTIONS = ['random', 'skip'];
const DEFAULT_SETTINGS = {
  rating: '16',
  packs: ['everyday'],
  rounds: 8,
  pickSec: 45,
  voteSec: 30,
  handSize: 6,
  maxPlayers: 6,
  onTimeout: 'random',
  allowLateJoin: true,
};

function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  let rating = content.RATINGS.includes(String(src.rating)) ? String(src.rating) : (base.rating || '16');
  // 18+ is never switched on by accident: the request has to say that the
  // host confirmed it. Staying on 18+ (any later patch) needs nothing.
  if (rating === '18' && base.rating !== '18' && src.confirmAdult !== true) rating = base.rating || '16';
  let packs = Array.isArray(src.packs)
    ? [...new Set(src.packs.filter((id) => content.PACK_IDS.includes(id)))]
    : (base.packs || []).filter((id) => content.PACK_IDS.includes(id));
  if (packs.length === 0) packs = [content.PACK_IDS[0]];
  return {
    rating,
    packs,
    rounds: pickOption(src.rounds ?? base.rounds, ROUND_OPTIONS, base.rounds),
    pickSec: pickOption(src.pickSec ?? base.pickSec, PICK_SEC_OPTIONS, base.pickSec),
    voteSec: pickOption(src.voteSec ?? base.voteSec, VOTE_SEC_OPTIONS, base.voteSec),
    handSize: pickOption(src.handSize ?? base.handSize, HAND_OPTIONS, base.handSize),
    maxPlayers: pickOption(src.maxPlayers ?? base.maxPlayers, SEAT_OPTIONS, base.maxPlayers),
    onTimeout: TIMEOUT_OPTIONS.includes(src.onTimeout) ? src.onTimeout : (base.onTimeout || 'random'),
    allowLateJoin: src.allowLateJoin === undefined ? base.allowLateJoin !== false : !!src.allowLateJoin,
  };
}

class MemeHypeGame extends PartyRoom {
  constructor(roomCode, hostId, settings) {
    super('memehype', roomCode, hostId, settings);
    this.situation = null;
    // Situation ids this room has already shown, across restarts.
    this.usedSituations = [];
    this.situationDeck = [];
    this.memeDeck = [];
    this.discard = [];
    // playerId -> [memeId]
    this.hands = {};
    // playerId -> [memeId], most recent last
    this.seen = {};
    // playerId -> { id, memeId, auto }. The id is what a phone votes for.
    this.picks = {};
    this.pickOrder = [];
    // voterId -> pick token
    this.votes = {};
    this.roundResult = null;
  }

  sanitizeSettings(patch, base) {
    const next = sanitizeSettings(patch, base);
    // Never below the number of people already sitting at the table.
    if (this.players) {
      const seated = this.activePlayers().length;
      if (next.maxPlayers < seated) next.maxPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, seated));
    }
    return next;
  }

  maxSeats() {
    return this.settings.maxPlayers;
  }

  // The big screen is the table: it shows the round and holds no hand,
  // unless the host says it plays too.
  screenPlaysByDefault() {
    return false;
  }

  freshSeat() {
    return { roundWins: 0, votesReceived: 0 };
  }

  lateJoinPhases() {
    return [PHASES.REVEAL];
  }

  // A departing player's vote goes; the meme they already played stays in
  // the round; their hand goes back into the deck.
  onSeatLeft(player) {
    delete this.votes[player.id];
    this.discard.push(...(this.hands[player.id] || []));
    delete this.hands[player.id];
  }

  meme(id) {
    return content.memeById(id, this.settings.rating);
  }

  // --- lifecycle -----------------------------------------------------

  start(playerId) {
    this.assertCanStart(playerId, 'Meme Hype');
    const { rating, packs } = this.settings;
    const memes = content.memesFor(rating, packs);
    // Every hand full at once is the least a game can be dealt from: played
    // memes come back through the discard pile after each round.
    const need = this.activePlayers().length * this.settings.handSize;
    if (content.situationsFor(rating, packs).length === 0 || memes.length === 0) {
      throw this.fail('The chosen packs have no cards for this age mode.');
    }
    if (memes.length < need) throw this.fail('Not enough memes for this many players - add another pack.');
    this.memeDeck = shuffle(memes.map((m) => m.id));
    this.discard = [];
    this.situationDeck = [];
    this.hands = {};
    this.players.forEach((p) => {
      Object.assign(p, { score: 0, roundsPlayed: 0, ...this.freshSeat() });
    });
    this.round = 0;
    this.results = null;
    this.startedAt = Date.now();
    this.beginRound();
    return this;
  }

  restart(playerId) {
    this.assertHost(playerId);
    if (!this.isOver) throw this.fail('A new game can only be set up once this one is over.');
    this.players = this.players.filter((p) => !p.left);
    this.players.forEach((p) => {
      Object.assign(p, { ready: false, score: 0, roundsPlayed: 0, ...this.freshSeat() });
    });
    Object.assign(this, {
      phase: PHASES.LOBBY,
      round: 0,
      situation: null,
      situationDeck: [],
      memeDeck: [],
      discard: [],
      hands: {},
      picks: {},
      pickOrder: [],
      votes: {},
      roundResult: null,
      results: null,
      phaseEndsAt: null,
      startedAt: null,
      endedAt: null,
    });
    return this;
  }

  // --- the decks -----------------------------------------------------

  drawSituation() {
    if (this.situationDeck.length === 0) {
      const all = content.situationsFor(this.settings.rating, this.settings.packs);
      const used = new Set(this.usedSituations);
      let fresh = all.filter((s) => !used.has(s.id));
      if (fresh.length === 0) {
        const mine = new Set(all.map((s) => s.id));
        this.usedSituations = this.usedSituations.filter((id) => !mine.has(id));
        fresh = all;
      }
      this.situationDeck = shuffle(fresh.map((s) => s.id));
    }
    const id = this.situationDeck.pop();
    this.usedSituations.push(id);
    if (this.usedSituations.length > 1000) this.usedSituations.splice(0, this.usedSituations.length - 1000);
    return content.situationsFor(this.settings.rating, this.settings.packs).find((s) => s.id === id);
  }

  // A card nobody is holding, preferring one this player has not seen
  // lately. The deck refills from the discard pile only when it runs dry,
  // so every meme comes round once before any comes round twice.
  drawMemeFor(playerId) {
    if (this.memeDeck.length === 0) {
      const held = new Set(Object.values(this.hands).flat());
      const inPlay = new Set(Object.values(this.picks).map((p) => p.memeId));
      this.memeDeck = shuffle(this.discard.filter((id) => !held.has(id) && !inPlay.has(id)));
      this.discard = [];
      if (this.memeDeck.length === 0) return null;
    }
    const recent = new Set(this.seen[playerId] || []);
    let index = this.memeDeck.findIndex((id) => !recent.has(id));
    if (index < 0) index = this.memeDeck.length - 1;
    const [id] = this.memeDeck.splice(index, 1);
    const seen = this.seen[playerId] || [];
    seen.push(id);
    if (seen.length > RECENT_MEMORY) seen.splice(0, seen.length - RECENT_MEMORY);
    this.seen[playerId] = seen;
    return id;
  }

  topUpHands() {
    this.activePlayers().forEach((p) => {
      const hand = this.hands[p.id] || [];
      while (hand.length < this.settings.handSize) {
        const id = this.drawMemeFor(p.id);
        if (!id) break;
        hand.push(id);
      }
      this.hands[p.id] = hand;
    });
  }

  // --- rounds --------------------------------------------------------

  isFinalRound() {
    return this.round >= this.settings.rounds;
  }

  multiplier() {
    return this.isFinalRound() ? 2 : 1;
  }

  beginRound() {
    this.round += 1;
    this.topUpHands();
    this.situation = this.drawSituation();
    this.picks = {};
    this.pickOrder = [];
    this.votes = {};
    this.roundResult = null;
    this.activePlayers().forEach((p) => { p.roundsPlayed += 1; });
    this.enterPhase(PHASES.PICK, this.settings.pickSec);
  }

  // One meme per player per round, from their own hand, and it cannot be
  // taken back.
  pick(playerId, memeId) {
    if (this.phase !== PHASES.PICK) throw this.fail('Picking is closed.');
    const player = this.getPlayer(playerId);
    if (!player || player.left || !player.playing) throw this.fail('You are not playing in this room.');
    if (this.picks[playerId]) throw this.fail('You have already played a meme.');
    const hand = this.hands[playerId] || [];
    const index = hand.indexOf(memeId);
    if (index < 0) throw this.fail('That meme is not in your hand.');
    hand.splice(index, 1);
    this.picks[playerId] = { id: token(), memeId, auto: false };
    return this.picks[playerId];
  }

  pendingPickIds() {
    return this.activePlayers()
      .filter((p) => !this.picks[p.id] && (this.hands[p.id] || []).length > 0)
      .map((p) => p.id);
  }

  // Time is up: whoever has not played either gets a random meme from
  // their own hand (the default - the round stays full) or sits it out.
  autoPick() {
    if (this.settings.onTimeout !== 'random') return;
    this.pendingPickIds().forEach((id) => {
      const hand = this.hands[id];
      const [memeId] = hand.splice(Math.floor(Math.random() * hand.length), 1);
      this.picks[id] = { id: token(), memeId, auto: true };
    });
  }

  openVote() {
    const entries = Object.entries(this.picks).filter(([playerId]) => this.getPlayer(playerId));
    if (entries.length < 2) {
      this.closeVote();
      return;
    }
    this.pickOrder = shuffle(entries.map(([, pick]) => pick.id));
    this.votes = {};
    this.enterPhase(PHASES.VOTE, this.settings.voteSec);
  }

  pickByToken(pickId) {
    const found = Object.entries(this.picks).find(([, p]) => p.id === pickId);
    return found ? { playerId: found[0], pick: found[1] } : null;
  }

  canVote(player) {
    if (!player || player.left || !player.playing) return false;
    return this.pickOrder.some((id) => this.pickByToken(id)?.playerId !== player.id);
  }

  vote(voterId, pickId) {
    if (this.phase !== PHASES.VOTE) throw this.fail('Voting is closed.');
    const voter = this.getPlayer(voterId);
    if (!voter || voter.left || !voter.playing) throw this.fail('You are not playing in this room.');
    if (this.votes[voterId]) throw this.fail('You have already voted.');
    const target = this.pickByToken(pickId);
    if (!target || !this.pickOrder.includes(pickId)) throw this.fail('That meme is not in this round.');
    if (target.playerId === voterId) throw this.fail('You cannot vote for your own meme.');
    this.votes[voterId] = pickId;
    return pickId;
  }

  pendingVoterIds() {
    return this.activePlayers().filter((p) => this.canVote(p) && !this.votes[p.id]).map((p) => p.id);
  }

  settled() {
    if (this.phase === PHASES.PICK) return this.pendingPickIds().length === 0;
    if (this.phase === PHASES.VOTE) return this.pendingVoterIds().length === 0;
    return false;
  }

  // 100 points a vote, 100 more for the round's best meme, everything
  // doubled in the final round.
  closeVote() {
    const tally = {};
    Object.values(this.votes).forEach((id) => { tally[id] = (tally[id] || 0) + 1; });
    const mult = this.multiplier();
    const entries = Object.entries(this.picks).map(([playerId, pick]) => {
      const player = this.getPlayer(playerId);
      return {
        playerId,
        nickname: player?.nickname || '—',
        pickId: pick.id,
        meme: this.meme(pick.memeId),
        auto: pick.auto,
        votes: tally[pick.id] || 0,
        voters: Object.entries(this.votes).filter(([, id]) => id === pick.id).map(([v]) => v),
        points: 0,
        index: this.pickOrder.indexOf(pick.id) + 1,
      };
    });
    const best = entries.reduce((max, e) => Math.max(max, e.votes), 0);
    entries.forEach((e) => {
      const won = best > 0 && e.votes === best;
      e.winner = won;
      e.points = (e.votes * POINTS_PER_VOTE + (won ? WIN_BONUS : 0)) * mult;
      const player = this.getPlayer(e.playerId);
      if (player) {
        player.score += e.points;
        player.votesReceived += e.votes;
        if (won) player.roundWins += 1;
      }
    });
    entries.sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname));
    this.discard.push(...Object.values(this.picks).map((p) => p.memeId));
    this.roundResult = {
      round: this.round,
      situation: this.situation,
      multiplier: mult,
      entries,
      winners: entries.filter((e) => e.winner).map((e) => e.playerId),
    };
    this.enterPhase(PHASES.REVEAL, REVEAL_SEC);
  }

  nextRound() {
    if (this.isFinalRound()) {
      this.finish('rounds');
      return;
    }
    if (this.activePlayers().length < MIN_PLAYERS) {
      this.finish('tooFew');
      return;
    }
    this.beginRound();
  }

  finish(reason) {
    if (this.isOver) return;
    const results = this.buildResults(reason, (p) => ({
      roundWins: p.roundWins || 0, votesReceived: p.votesReceived || 0,
    }));
    // Equal scores are separated by rounds won, then by votes.
    results.standings.sort((a, b) => (a.left - b.left) || (b.score - a.score)
      || (b.roundWins - a.roundWins) || (b.votesReceived - a.votesReceived)
      || a.nickname.localeCompare(b.nickname));
    this.endWith(results);
  }

  advance() {
    switch (this.phase) {
      case PHASES.PICK:
        this.autoPick();
        this.openVote();
        break;
      case PHASES.VOTE:
        this.closeVote();
        break;
      case PHASES.REVEAL:
        this.nextRound();
        break;
      default:
        break;
    }
    return this.phase;
  }

  // --- serialization -------------------------------------------------

  toJSON() {
    const out = {};
    MemeHypeGame.FIELDS.forEach((f) => { out[f] = this[f]; });
    return {
      gameType: 'memehype', roomCode: this.roomCode, hostId: this.hostId, settings: this.settings, ...out,
    };
  }

  static fromJSON(data) {
    const game = new MemeHypeGame(data.roomCode, data.hostId, data.settings);
    return PartyRoom.restore(game, data, MemeHypeGame.FIELDS);
  }

  // --- what each viewer may see ---------------------------------------

  statusOf(p) {
    if (p.left) return 'left';
    if (!p.playing) return 'screen';
    switch (this.phase) {
      case PHASES.LOBBY: return p.ready || p.isHost ? 'ready' : 'waiting';
      case PHASES.PICK: return this.picks[p.id] ? 'ready' : 'picking';
      case PHASES.VOTE: return this.votes[p.id] || !this.canVote(p) ? 'ready' : 'voting';
      default: return 'waiting';
    }
  }

  // The memes on the table during the vote: a number and a picture, and
  // for its owner a note that it is theirs. Nothing else.
  tableCards(viewer) {
    if (this.phase !== PHASES.VOTE) return [];
    return this.pickOrder.map((id, i) => {
      const entry = this.pickByToken(id);
      return {
        id,
        index: i + 1,
        meme: this.meme(entry.pick.memeId),
        mine: !!viewer && entry.playerId === viewer.id,
      };
    });
  }

  toClientJSON(viewerId) {
    const viewer = this.getPlayer(viewerId) || null;
    const myPick = viewer ? this.picks[viewer.id] : null;
    return {
      gameType: 'memehype',
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      finalRound: !this.inLobby && this.isFinalRound(),
      multiplier: this.inLobby ? 1 : this.multiplier(),
      settings: this.settings,
      minPlayers: MIN_PLAYERS,
      maxPlayers: this.settings.maxPlayers,
      points: { vote: POINTS_PER_VOTE, win: WIN_BONUS },
      options: {
        rounds: ROUND_OPTIONS,
        pickSec: PICK_SEC_OPTIONS,
        voteSec: VOTE_SEC_OPTIONS,
        handSize: HAND_OPTIONS,
        maxPlayers: SEAT_OPTIONS,
        onTimeout: TIMEOUT_OPTIONS,
        ratings: content.RATINGS,
        packs: content.catalog(),
      },
      phaseEndsAt: this.phaseEndsAt,
      createdAt: this.createdAt,
      situation: this.inLobby ? null : this.situation,
      players: this.players.map((p) => ({
        ...this.publicSeat(p, viewer),
        roundWins: p.roundWins || 0,
        votesReceived: p.votesReceived || 0,
        picked: !!this.picks[p.id],
        voted: !!this.votes[p.id],
        status: this.statusOf(p),
      })),
      cards: this.tableCards(viewer),
      pickedCount: Object.keys(this.picks).length,
      you: viewer
        ? {
          id: viewer.id,
          isHost: viewer.isHost,
          device: viewer.device,
          playing: !!viewer.playing,
          left: !!viewer.left,
          score: viewer.score,
          roundWins: viewer.roundWins || 0,
          hand: viewer.playing ? (this.hands[viewer.id] || []).map((id) => this.meme(id)).filter(Boolean) : [],
          canPick: this.phase === PHASES.PICK && viewer.playing && !viewer.left && !myPick,
          myPick: myPick ? { meme: this.meme(myPick.memeId), auto: myPick.auto } : null,
          myVote: this.votes[viewer.id] || null,
          canVote: this.phase === PHASES.VOTE && this.canVote(viewer) && !this.votes[viewer.id],
        }
        : null,
      waitingOn: this.phase === PHASES.PICK
        ? this.pendingPickIds()
        : (this.phase === PHASES.VOTE ? this.pendingVoterIds() : []),
      roundResult: this.phase === PHASES.REVEAL || this.isOver ? this.roundResult : null,
      results: this.isOver ? this.results : null,
    };
  }
}

MemeHypeGame.ErrorClass = MemeHypeError;
MemeHypeGame.PHASES = PHASES;
MemeHypeGame.MIN_PLAYERS = MIN_PLAYERS;
MemeHypeGame.FIELDS = [
  ...PartyRoom.BASE_FIELDS,
  'situation', 'usedSituations', 'situationDeck', 'memeDeck', 'discard', 'hands', 'seen',
  'picks', 'pickOrder', 'votes', 'roundResult',
];

module.exports = {
  MemeHypeGame,
  MemeHypeError,
  PHASES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_SETTINGS,
  POINTS_PER_VOTE,
  WIN_BONUS,
  sanitizeSettings,
};
