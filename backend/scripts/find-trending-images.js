#!/usr/bin/env node
// find-trending-images.js
// Gives every card of the «В тренде» pack the picture of the meme it names.
//
// The other packs are memes somebody wrote - a picture idea plus two
// captions - and scripts/find-meme-images.js goes looking for a freely
// licensed photo that could carry the joke. This pack is different: its
// cards ARE memes people already know, pulled from the shared sheet, and
// the sheet already says where each one lives. So the picture is not
// searched for. It is taken from the page the meme came from.
//
//   1. The source page (the row's `link`) is read and every picture on it
//      collected: what the page offers as its own image (og:image) and the
//      pictures inside the article, with WordPress thumbnail sizes folded
//      back onto the original file.
//   2. Gemini LOOKS at the candidates next to the meme's name and picks the
//      one that IS that meme. A page about a meme also carries the site's
//      logo, banners, thumbnails of other posts and, very often, a blank
//      template beside the meme itself, so the first picture on a page is
//      not reliably the right one. The same answer carries a short safety
//      questionnaire; any "yes", or an answer that cannot be read, drops
//      the picture. Without a key the page's own og:image is used, which is
//      right far more often than not.
//   3. The picture is saved into src/memehype/images/custom/ under the
//      row's slug and written back into sheetData.json as the row's
//      `image`, so it survives a re-sync of the sheet and is shared by the
//      two cards the row is dealt as (the 16+ and the 18+ shelf).
//
// Every picture belongs to whoever made the meme, and the row's `link`
// keeps saying where it came from: this is the same material the pack is
// already built out of. Look through them before shipping - `npm run memes
// -- --html` puts every card on one page.
//
// It is resumable: a row that already has a picture is skipped, so the
// script can be stopped and started again.
//
// Usage:
//   [GEMINI_API_KEYS=key1,key2] node scripts/find-trending-images.js
//     [--limit 20] [--only slug,slug] [--redo] [--concurrency 3]
//     [--no-model] [--dry-run] [--max-kb 600]
//
// The key is read from the environment only; it is never written anywhere.

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'src', 'memehype', 'content', 'sheetData.json');
const CUSTOM_DIR = path.join(__dirname, '..', 'src', 'memehype', 'images', 'custom');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',').map((k) => k.trim()).filter(Boolean);
const MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL
  || 'gemini-3.5-flash,gemini-3.6-flash,gemini-2.5-flash,gemini-3.1-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const LIMIT = Number(arg('limit', 0)) || Infinity;
const ONLY = (arg('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const REDO = args.includes('--redo');
const DRY = args.includes('--dry-run');
const USE_MODEL = !args.includes('--no-model') && KEYS.length > 0;
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 3)) || 3);

// A picture has to be a real one: a site logo is a few kilobytes, and
// anything past a couple of megabytes is too heavy for a phone. `--max-kb`
// tightens the ceiling, which is how a card that came back with a huge
// original is sent to look for a lighter one.
const MIN_BYTES = 8 * 1024;
const MAX_BYTES = (Number(arg('max-kb', 0)) || 3072) * 1024;
const CANDIDATES = 6;
const TYPES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
};
// Pictures that are never the meme: the furniture of a blog. The short
// words are anchored between separators - an unanchored "ads/" matches
// every WordPress upload path there is ("uplo-ads-").
const FURNITURE = /(logo|avatar|favicon|sprite|icon|banner|placeholder|emoji|smile|subscribe|telegram|[-_/](ads?|adv|default|counter|pixel|share|footer|header)[-_/.])/i;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const log = (...a) => console.log(...a); // eslint-disable-line no-console

// --- reading a meme's page ---------------------------------------------

async function getText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), url: res.url };
}

function metaContent(html, prop) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i'));
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']+)["']/i);
  return content ? content[1] : null;
}

// WordPress serves the same picture at a dozen sizes - "cat-300x200.jpg"
// is a thumbnail of "cat.jpg". Folding the size off gets the original and
// makes the duplicates collapse into one candidate.
function original(url) {
  return url.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|gif))(\?.*)?$/i, '$1');
}

// The words of a name worth matching on, cut to a stem: a heading declines
// a name differently than the sheet writes it ("Гифки с Хоумлендером" is
// the heading for "Хоумлендер нервно выдыхает"), and a five-letter stem
// survives that while still being specific enough not to match everything.
function stems(text) {
  const words = String(text || '').toLowerCase().replace(/<[^>]*>/g, ' ').split(/[^\p{L}\p{N}]+/u);
  return [...new Set(words.filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))];
}

// Not every link in the sheet is a page about one meme: some point at a
// round-up - "the memes of November 2024" - with a heading for each meme
// and its pictures under it. The first pictures on such a page belong to
// other memes, so the stretch under the heading that has the most of this
// meme's name in it is read first. On a page about a single meme the best
// heading is its own title and the stretch is the whole article, which is
// where the pictures were being read from anyway.
function section(scope, name) {
  const wanted = stems(name);
  if (!wanted.length) return null;
  const headings = [...scope.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  let best = null;
  headings.forEach((heading, i) => {
    const score = stems(heading[1]).filter((w) => wanted.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { score, i };
  });
  if (!best) return null;
  const heading = headings[best.i];
  const next = headings[best.i + 1];
  return scope.slice(heading.index + heading[0].length, next ? next.index : scope.length);
}

// Every picture on the page, best first: the stretch about this meme if
// the page is a round-up, then what the page claims to be about, then the
// pictures inside the article in the order they appear.
function pictures(html, pageUrl, name) {
  const out = [];
  const add = (raw) => {
    if (!raw) return;
    let url;
    try { url = new URL(String(raw).trim(), pageUrl).href; } catch { return; }
    if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return;
    if (FURNITURE.test(url)) return;
    url = original(url);
    if (!out.includes(url)) out.push(url);
  };

  // Only the article, when the page marks one: a sidebar and a "read next"
  // strip are full of other memes, and picking one of those would put the
  // wrong meme on the card.
  const article = html.match(/<article[\s\S]*?<\/article>/i)
    || html.match(/<div[^>]+class=["'][^"']*(?:entry-content|post-content|article-content)[^"']*["'][\s\S]*?<\/div>\s*(?:<\/div>|<footer)/i);
  const scope = article ? article[0] : html;

  const mine = section(scope, name);
  if (mine) fromImgTags(mine, add);
  add(metaContent(html, 'og:image'));
  add(metaContent(html, 'twitter:image'));
  fromImgTags(scope, add);
  return { urls: out.slice(0, CANDIDATES), article: mine ? articleLink(mine, pageUrl) : null };
}

// A round-up entry that has no picture of its own - the meme is a video
// there, or a tweet - usually links to the article about that one meme.
// That link is worth following once.
function articleLink(scope, pageUrl) {
  const here = new URL(pageUrl);
  for (const tag of scope.match(/<a[^>]+href=["'][^"']+["'][^>]*>/gi) || []) {
    const href = tag.match(/href=["']([^"']+)["']/i)[1];
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.hostname !== here.hostname) continue;
    if (url.pathname === here.pathname || url.pathname === '/') continue;
    return url.href;
  }
  return null;
}

function fromImgTags(scope, add) {
  (scope.match(/<img[^>]*>/gi) || []).forEach((tag) => {
    const srcset = tag.match(/(?:data-)?srcset=["']([^"']+)["']/i);
    if (srcset) {
      // The widest entry of a srcset is the closest thing to the original.
      const widest = srcset[1].split(',')
        .map((part) => part.trim().split(/\s+/))
        .map(([u, w]) => ({ u, w: Number(String(w).replace(/\D/g, '')) || 0 }))
        .sort((a, b) => b.w - a.w)[0];
      if (widest) add(widest.u);
    }
    const src = tag.match(/(?:data-lazy-src|data-src|src)=["']([^"']+)["']/i);
    if (src) add(src[1]);
  });
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'image/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`not an image (${type || 'no type'})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < MIN_BYTES) throw new Error(`too small (${bytes.length} B)`);
  if (bytes.length > MAX_BYTES) throw new Error(`too heavy (${Math.round(bytes.length / 1024)} KB)`);
  return { bytes, type, ext };
}

// --- asking the model which picture is the meme ------------------------

// Requests are spread over every key x model pair: each has its own rate
// and daily limit, so together they go further, and a pair that runs out
// of quota simply loses its turn.
let pair = 0;
function nextPair() {
  const combos = KEYS.flatMap((key) => MODELS.map((model) => ({ key, model })));
  const combo = combos[pair % combos.length];
  pair += 1;
  return combo;
}

// What the chosen picture must not hold, asked as four plain questions.
// They are worded flatly on purpose: an earlier version spelled the
// forbidden things out, and a request that put those words next to a meme
// about a kitten was refused before the model ever saw it.
const QUESTIONS = ['adultContent', 'violence', 'hateSymbol', 'realTragedy'];

function prompt(name) {
  return [
    'Тебе даны картинки, найденные на странице про интернет-мем.',
    `Мем называется: «${name}».`,
    '',
    'Выбери ОДНУ картинку, которая и есть этот мем: узнаваемый кадр,',
    'персонаж или картинка-шаблон, по которой мем узнают. Не выбирай',
    'логотипы сайта, баннеры, скриншоты не по теме, коллажи из других',
    'мемов и превью соседних статей. Если на странице есть и сам мем,',
    'и пустой шаблон, выбирай тот, который выразительнее как самостоятельная',
    'картинка: лицо или сцена крупно, без мелкого текста.',
    '',
    'Карточки этой игры видят подростки, поэтому про выбранную картинку',
    'нужно ответить на четыре вопроса: adultContent - содержимое 18+;',
    'violence - насилие; hateSymbol - символика ненависти; realTragedy -',
    'реальная трагедия с пострадавшими. Если хоть на один ответ "да",',
    'картинка не подойдёт.',
    '',
    'Ответь ТОЛЬКО одним JSON-объектом, без пояснений и без markdown:',
    '{"pick": <номер картинки, начиная с 1, или null>, "why": "<до 12 слов>",',
    ` ${QUESTIONS.map((q) => `"${q}": true|false`).join(', ')}}`,
    'Поля-вопросы описывают ВЫБРАННУЮ картинку. Если не подходит ни одна,',
    'верни {"pick": null}.',
  ].join('\n');
}

function readJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// The index of the chosen candidate, or null with the reason why not. A
// model that cannot be reached, cannot be read, or answers "yes" to any
// safety question leaves the row without a picture rather than guessing.
async function askModel(name, candidates) {
  const parts = [{ text: prompt(name) }];
  candidates.forEach((c, i) => {
    parts.push({ text: `Картинка ${i + 1}:` });
    parts.push({ inline_data: { mime_type: c.type, data: c.bytes.toString('base64') } });
  });

  for (let attempt = 0; attempt < KEYS.length * MODELS.length; attempt += 1) {
    const { key, model } = nextPair();
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          }),
        },
      );
      if (res.status === 429 || res.status >= 500) { await sleep(1500); continue; }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) { await sleep(400); continue; }
      const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      const answer = readJson(text);
      // Nothing readable came back - an answer held back, or one that
      // wandered off the format. That is the pair's problem, not the
      // picture's, so the next pair gets a turn.
      if (!answer) { await sleep(300); continue; }
      const i = Number(answer.pick);
      if (!Number.isInteger(i) || i < 1 || i > candidates.length) {
        return { index: null, why: answer.why || 'nothing on the page is the meme' };
      }
      const flagged = QUESTIONS.filter((q) => answer[q] === true);
      // A question left unanswered is not a "no": the picture is dropped.
      const unanswered = QUESTIONS.filter((q) => typeof answer[q] !== 'boolean');
      if (flagged.length || unanswered.length) {
        return { index: null, why: `rejected (${[...flagged, ...unanswered.map((q) => `${q}?`)].join(', ')})` };
      }
      return { index: i - 1, why: answer.why || '' };
    } catch {
      await sleep(400);
    }
  }
  return { index: null, why: 'no model gave a readable answer' };
}

// --- one row ------------------------------------------------------------

// The pictures of one page, downloaded, plus where to look next if it
// turned out to have none of its own.
async function lookAt(link, name) {
  const { html, url } = await getText(link);
  const { urls, article } = pictures(html, url, name);
  const candidates = [];
  for (const candidate of urls) {
    try {
      candidates.push({ url: candidate, ...(await download(candidate)) });
    } catch (e) {
      if (process.env.VERBOSE) log(`      skip ${candidate}: ${e.message}`);
    }
  }
  return { candidates, article };
}

async function choose(name, candidates) {
  if (!candidates.length) return { ok: false, why: 'no picture of this meme on the page' };
  if (!USE_MODEL) return { ok: true, chosen: candidates[0], why: 'the first picture the page offers' };
  const { index, why } = await askModel(name, candidates);
  return index === null ? { ok: false, why } : { ok: true, chosen: candidates[index], why };
}

async function findFor(row) {
  if (!row.link) return { ok: false, why: 'no link in the sheet' };
  const page = await lookAt(row.link, row.name);
  const found = await choose(row.name, page.candidates);
  // Nothing on a round-up page was this meme: its own article, linked from
  // the entry, is the one place left worth looking.
  if (!found.ok && page.article) {
    const own = await lookAt(page.article, row.name);
    if (own.candidates.length) {
      const second = await choose(row.name, own.candidates);
      if (second.ok) return second;
    }
  }
  return found;
}

// --- the run ------------------------------------------------------------

async function main() {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const wanted = data.rows.filter((row) => (ONLY.length ? ONLY.includes(row.slug) : REDO || !row.image));
  const todo = LIMIT === Infinity ? wanted : wanted.slice(0, LIMIT);

  log(`${data.rows.length} rows in the sheet, ${todo.length} to look at.`);
  log(USE_MODEL
    ? `Gemini picks the picture (${KEYS.length} key(s) x ${MODELS.length} model(s)).`
    : 'No key given: the first picture each page offers is used.');
  if (DRY) log('Dry run: nothing is written.');
  log('');

  const report = { saved: [], failed: [] };
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const row = todo[cursor];
      const n = `${cursor + 1}/${todo.length}`;
      cursor += 1;
      if (!row) return;
      try {
        const found = await findFor(row);
        if (!found.ok) {
          report.failed.push([row.slug, found.why]);
          log(`  x ${n} ${row.name} - ${found.why}`);
          continue;
        }
        const file = `trending-${row.slug}${found.chosen.ext}`;
        if (!DRY) {
          fs.writeFileSync(path.join(CUSTOM_DIR, file), found.chosen.bytes);
          // A picture saved earlier under another extension would stay
          // behind as a stray file, so it goes.
          Object.values(TYPES).filter((e) => e !== found.chosen.ext)
            .forEach((e) => fs.rmSync(path.join(CUSTOM_DIR, `trending-${row.slug}${e}`), { force: true }));
          row.image = file;
        }
        report.saved.push(row.slug);
        log(`  + ${n} ${row.name} -> ${file} (${Math.round(found.chosen.bytes.length / 1024)} KB)${found.why ? ` - ${found.why}` : ''}`);
      } catch (e) {
        report.failed.push([row.slug, e.message]);
        log(`  x ${n} ${row.name} - ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (!DRY && report.saved.length) fs.writeFileSync(DATA, `${JSON.stringify(data, null, 2)}\n`);
  log('');
  log(`Saved ${report.saved.length}, failed ${report.failed.length}.`);
  if (report.failed.length) {
    log('Left without a picture (those cards draw their emoji art until one is put in custom/):');
    report.failed.forEach(([slug, why]) => log(`  ${slug}: ${why}`));
  }
}

main().catch((err) => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
