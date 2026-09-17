#!/usr/bin/env node
// sync-meme-sheet.js
// Brings the Meme Hype "trending" pack in line with the shared Google
// Sheet of memes (name + reference link), without ever losing a card.
//
//   node scripts/sync-meme-sheet.js            # sync from the sheet
//   node scripts/sync-meme-sheet.js --dry      # show what would change
//   node scripts/sync-meme-sheet.js --file x.csv   # sync from a local CSV
//   node scripts/sync-meme-sheet.js --url <csv url>
//
// How the merge works, and why it works that way:
//
//   * A row is matched to an existing card by its `id` column if the sheet
//     has one, then by its slug (a stable id made from the meme's name),
//     and then by a loosely normalised name - so a fixed typo, a changed
//     link or a new column updates the card that is already there instead
//     of adding a second one. A meme RENAMED beyond recognition, with no
//     id column to hold it together, reads as a new card and the old one
//     is flagged as missing; nothing is lost either way, and giving the
//     sheet an `id` column is how a table avoids that entirely.
//   * Rows the sheet no longer contains are NOT deleted. They are marked
//     `missingSince` and keep playing. A card can disappear from a
//     spreadsheet by accident; a card disappearing from a player's deck
//     cannot be undone.
//   * The stored list is append-only. Card ids in this game are built
//     from a card's POSITION in its pack, so keeping the order fixed is
//     what keeps every id, every uploaded picture and every Creator edit
//     attached to the card it belongs to.
//
// The result is written to src/memehype/content/sheetData.json, which the
// `trending` pack reads at start-up. Nothing is fetched at runtime.

const fs = require('fs');
const path = require('path');

const SHEET_ID = '17onOt5mN9vS__zA6ICBWhzFlZYW9wktW5Kl15qB-qa4';
const SHEET_GID = '1653526568';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const DATA_FILE = path.join(__dirname, '..', 'src', 'memehype', 'content', 'sheetData.json');

// --- CSV ---------------------------------------------------------------

// A complete CSV reader: quoted fields, doubled quotes inside them, commas
// and newlines inside quotes, and CRLF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// The columns this importer understands, by what their heading looks like.
// Only a name is required; everything else refines what the card becomes.
const COLUMNS = {
  name: /назв|name|мем|meme|title|загол/i,
  link: /ссыл|link|url|источ|source/i,
  id: /^(id|ид|slug|код|key)$/i,
  rating: /рейтинг|rating|возраст|age|18/i,
  art: /эмодзи|emoji|art|картинк|icon/i,
};

// --- the shape of a card ----------------------------------------------

// A stable id for a meme, made from its name. Latin letters, digits and
// dashes only, so it is safe in a file name and in a URL.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(name) {
  const lower = String(name).toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meme';
}

// For matching a row against a card when the slug has changed: case,
// punctuation and spacing are ignored, the letters are not.
function normalName(name) {
  return String(name).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '');
}

// Words that put a card on the 18+ shelf. A card is dealt from one shelf
// only, so this decides who ever sees it.
const ADULT = /(хуй|хуя|хуё|хуе|пизд|ебат|ебал|ебу|ёбан|еба|бляд|блять|поебат|пиздец|сука|мраз|нахуй|говн|дроч)/i;

// A picture for the card until somebody uploads a real one. Keyword first,
// so a hamster meme gets a hamster.
const EMOJI_RULES = [
  [/хомяк/i, '🐹'], [/кот|кош|котён|котен|кис/i, '🐱'], [/пёс|пес|собак|щен/i, '🐶'],
  [/белк/i, '🐿️'], [/пингвин/i, '🐧'], [/голуб/i, '🕊️'], [/обезьян/i, '🐒'],
  [/енот/i, '🦝'], [/даман|капибар/i, '🦫'], [/рыб/i, '🐟'], [/карась|прикорм/i, '🎣'],
  [/скелет/i, '💀'], [/гроб/i, '⚰️'], [/привид|призрак/i, '👻'], [/пришельц|нло/i, '👽'],
  [/танц/i, '🕺'], [/поёт|пение|рокер/i, '🎸'], [/кричит|кричащ|орёт/i, '😱'],
  [/смеё|смеет|улыб/i, '😂'], [/груст|печал/i, '😢'], [/зло|ярост|бьёт|бет /i, '😡'],
  [/качок|качк/i, '💪'], [/машин|такси|яхт/i, '🚗'], [/телефон/i, '📱'],
  [/очк|умный/i, '🤓'], [/суд|адвокат/i, '⚖️'], [/еда|пицц|сэндвич|макарон|апельсин/i, '🍕'],
  [/доктор|ливси/i, '🩺'], [/дерев/i, '🌳'], [/торнадо|бур/i, '🌪️'], [/кино|cinema/i, '🎬'],
  [/семь|родител/i, '👨‍👩‍👦'], [/начальниц|токсич/i, '💼'], [/chad|чад|гигачад/i, '🗿'],
  [/спор|решу|доказ/i, '🤔'], [/повезл|удач/i, '🍀'], [/испуг|бойся|страх/i, '😰'],
];
const EMOJI_CYCLE = ['🔥', '😎', '🤡', '🫠', '😐', '🙃', '💀', '🥴', '😤', '🤨'];

// The shelf a row belongs on: what the sheet says, if it says anything,
// and otherwise whether the name itself is for adults only.
function ratingOf(raw, name) {
  const given = String(raw.rating || '').trim();
  if (/18|adult|взр/i.test(given)) return '18';
  if (/16|все|all|clean/i.test(given)) return '16';
  return ADULT.test(name) ? '18' : '16';
}

function emojiFor(name, index) {
  const hit = EMOJI_RULES.find(([re]) => re.test(name));
  return hit ? hit[1] : EMOJI_CYCLE[index % EMOJI_CYCLE.length];
}

const BACKGROUNDS = ['flame', 'acid', 'violet', 'ocean', 'gold', 'ink', 'candy', 'steel'];

// --- loading and saving ------------------------------------------------

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(parsed.rows)) return parsed;
  } catch { /* first run */ }
  return { source: SHEET_URL, syncedAt: null, rows: [] };
}

async function fetchCsv(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`The sheet answered ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('The sheet returned a web page rather than a CSV - is it shared with "anyone with the link"?');
  }
  return text;
}

// --- the merge ---------------------------------------------------------

function merge(existing, sheetRows) {
  const rows = existing.rows.map((r) => ({ ...r }));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const byName = new Map(rows.map((r) => [normalName(r.name), r]));
  const seen = new Set();
  const report = {
    added: [], updated: [], unchanged: 0, missing: [], returned: [],
  };

  sheetRows.forEach((raw) => {
    const name = String(raw.name || '').trim();
    if (!name) return;
    const link = String(raw.link || '').trim();
    // An id column, when the sheet has one, is the strongest key there is:
    // it survives a rename that nothing else could follow.
    const given = String(raw.id || '').trim();
    const slug = given ? slugify(given) : slugify(name);
    const found = (given && bySlug.get(slug)) || bySlug.get(slugify(name)) || byName.get(normalName(name));

    if (!found) {
      const row = {
        slug,
        name,
        link,
        rating: ratingOf(raw, name),
        art: String(raw.art || '').trim() || emojiFor(name, rows.length),
        bg: BACKGROUNDS[rows.length % BACKGROUNDS.length],
        addedAt: new Date().toISOString().slice(0, 10),
        missingSince: null,
      };
      rows.push(row);
      bySlug.set(slug, row);
      byName.set(normalName(name), row);
      seen.add(row.slug);
      report.added.push(name);
      return;
    }

    seen.add(found.slug);
    const before = JSON.stringify([found.name, found.link, found.rating, found.missingSince]);
    found.name = name;
    if (link) found.link = link;
    if (String(raw.art || '').trim()) found.art = String(raw.art).trim();
    found.rating = ratingOf(raw, name);
    if (found.missingSince) {
      report.returned.push(name);
      found.missingSince = null;
    }
    if (JSON.stringify([found.name, found.link, found.rating, found.missingSince]) !== before) report.updated.push(name);
    else report.unchanged += 1;
  });

  // Gone from the sheet: flagged, never removed, never switched off.
  const today = new Date().toISOString().slice(0, 10);
  rows.forEach((row) => {
    if (seen.has(row.slug)) return;
    if (!row.missingSince) {
      row.missingSince = today;
      report.missing.push(row.name);
    }
  });

  return { rows, report };
}

// --- run ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const fileArg = args.indexOf('--file');
  const urlArg = args.indexOf('--url');

  let csv;
  if (fileArg !== -1 && args[fileArg + 1]) {
    csv = fs.readFileSync(args[fileArg + 1], 'utf8');
    console.log(`Reading ${args[fileArg + 1]}`);
  } else {
    const url = urlArg !== -1 && args[urlArg + 1] ? args[urlArg + 1] : SHEET_URL;
    console.log(`Fetching ${url}`);
    csv = await fetchCsv(url);
  }

  const table = parseCsv(csv);
  if (!table.length) throw new Error('The sheet is empty.');

  // The header names the columns; we only need "name" and "link", in
  // whatever order and under whatever heading the sheet uses today.
  // Columns are found by their heading, in whatever order and under
  // whatever name the sheet uses today - that is what makes this survive
  // the sheet being restructured.
  const header = table[0].map((h) => h.trim());
  const at = {};
  Object.entries(COLUMNS).forEach(([key, re]) => {
    const i = header.findIndex((h) => re.test(h));
    if (i !== -1) at[key] = i;
  });
  const hasHeader = at.name !== undefined || at.link !== undefined || at.id !== undefined;
  const body = hasHeader ? table.slice(1) : table;
  if (at.name === undefined) at.name = 0;
  if (at.link === undefined && !hasHeader) at.link = 1;

  const cell = (row, key) => (at[key] === undefined ? '' : row[at[key]] || '');
  const sheetRows = body.map((r) => ({
    name: cell(r, 'name'), link: cell(r, 'link'), id: cell(r, 'id'), rating: cell(r, 'rating'), art: cell(r, 'art'),
  }));
  const found = Object.entries(at).map(([key, i]) => `${key} = "${header[i]}"`).join(', ');
  console.log(`Sheet columns: ${found} (${sheetRows.length} rows)`);

  const existing = loadData();
  const { rows, report } = merge(existing, sheetRows);

  console.log('');
  console.log(`  added      ${report.added.length}`);
  console.log(`  updated    ${report.updated.length}`);
  console.log(`  unchanged  ${report.unchanged}`);
  console.log(`  returned   ${report.returned.length}`);
  console.log(`  missing    ${report.missing.length} (kept in the deck)`);
  console.log(`  total      ${rows.length}`);
  report.added.slice(0, 10).forEach((n) => console.log(`    + ${n}`));
  if (report.added.length > 10) console.log(`    + … and ${report.added.length - 10} more`);
  report.updated.slice(0, 10).forEach((n) => console.log(`    ~ ${n}`));
  report.missing.forEach((n) => console.log(`    ? ${n} (no longer in the sheet, still playable)`));

  if (dry) {
    console.log('\n--dry: nothing written.');
    return;
  }

  const out = {
    source: SHEET_URL,
    syncedAt: new Date().toISOString(),
    note: 'Generated by scripts/sync-meme-sheet.js. Rows are append-only: card ids depend on their position.',
    rows,
  };
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nWritten to ${path.relative(process.cwd(), DATA_FILE)}`);
}

main().catch((err) => {
  console.error(`\nSync failed: ${err.message}`);
  process.exit(1);
});
