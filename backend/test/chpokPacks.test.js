// chpokPacks.test.js
// The ЧПОК content system: packs, the 16+/18+ split, round events and the
// no-repeat deck - the engine alone, no sockets.

require('./helpers/testEnv');

const packs = require('../src/chpok/packs');
const { ChpokGame, sanitizeSettings } = require('../src/chpok/ChpokGame');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${msg}`);
}

function table(settings) {
  const g = new ChpokGame('PACK1', 'h', settings);
  ['h', 'a', 'b'].forEach((id, i) => g.addPlayer({
    playerId: id, socketId: `s${i}`, nickname: id, accountId: i === 0 ? 'acc' : null, device: i ? 'phone' : 'screen',
  }));
  return g;
}

const sixteen = packs.packsFor('16').map((p) => p.id);
const eighteen = packs.packsFor('18').map((p) => p.id);
assert(sixteen.length >= 7 && eighteen.length >= 5, 'there are separate 16+ and 18+ packs');
assert(packs.themesOf('16', eighteen).length === 0, 'an 18+ pack yields nothing in a 16+ room');
const total16 = packs.themesOf('16', sixteen).length;
const total18 = packs.themesOf('18', eighteen).length;
assert(total16 >= 200 && total18 >= 200, `plenty of themes in each rating (${total16} / ${total18})`);

const legacy = sanitizeSettings({ box: 'both' });
assert(legacy.rating === '18' && legacy.packs.join() === 'box1,box2', 'an old "box" setting still means the same decks');
const mixed = sanitizeSettings({ rating: '16', packs: ['box1', 'school'] });
assert(mixed.packs.join() === 'school', 'a 16+ room keeps only 16+ packs');
const switched = sanitizeSettings({ rating: '16' }, sanitizeSettings({}));
assert(switched.packs.length === sixteen.length, 'switching rating selects that rating’s packs');

// A long 16+ game: no theme twice, every theme from a 16+ pack.
const g = table({ rating: '16', packs: ['school', 'work'], rounds: 15 });
g.start('h');
const seen = [];
const events = new Set();
for (let i = 0; i < 15; i += 1) {
  seen.push(g.theme);
  events.add(g.event);
  assert(['school', 'work'].includes(g.themePack), `round ${i + 1}: theme from a chosen 16+ pack`);
  if (g.event === 'anyLetter') assert(g.letter === null, 'a free-letter round has no letter');
  const round = g.round;
  while (g.phase !== 'GAME_OVER' && g.round === round) g.advance();
}
assert(new Set(seen).size === 15, 'fifteen rounds, fifteen different themes');
assert(g.phase === 'GAME_OVER', 'the game ends after the last round');
assert(events.has('final'), 'the last round is the final');

// The rules of the special rounds.
const r = table({ rounds: 5, events: false });
r.start('h');
assert(r.event === 'normal', 'events can be switched off');
r.event = 'twoWords';
let refused = false;
try { r.submitAnswer('a', 'одно'); } catch { refused = true; }
assert(refused, 'a two-word round refuses a one-word answer');
r.submitAnswer('a', 'два слова');
r.event = 'double';
r.submitAnswer('b', 'ещё ответ');
r.submitAnswer('h', 'и третий');
r.advance();
r.castVote('b', r.answers.a.id);
r.castVote('h', r.answers.a.id);
r.castVote('a', r.answers.b.id);
r.advance();
assert(r.getPlayer('a').score === 6, 'a double round doubles the points (2 votes + bonus, x2)');

// Rooms saved before packs existed still load and play.
const old = ChpokGame.fromJSON({ ...table({}).toJSON(), settings: { box: 'chpok2', rounds: 5, answerSec: 90, voteSec: 30 } });
assert(old.settings.packs.join() === 'box2', 'a saved room from before keeps its deck');

// eslint-disable-next-line no-console
console.log(`\n=== ЧПОК PACK TESTS PASSED (${passed} checks) ===`);
