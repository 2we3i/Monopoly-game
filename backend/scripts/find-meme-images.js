#!/usr/bin/env node
// find-meme-images.js
// Finds a real, freely licensed photo for every Meme Hype meme.
//
// Gemini cannot search the web for pictures, so the work is split:
//   1. Gemini reads a batch of memes (picture idea + captions + pack theme)
//      and writes English search queries for a photo that would carry each
//      meme.
//   2. Wikimedia Commons is searched with those queries. Only files under a
//      free licence (public domain, CC0, CC BY, CC BY-SA) are kept.
//   3. Candidates go through safety filters that do not trust each other:
//      Commons title, description and categories are checked against a
//      blocklist before download, and the picture Gemini picks (step 4) is
//      then shown to it ALONE with a strict questionnaire (nudity, sexual,
//      violence, a person as the subject, text on the image...). Any "yes" -
//      or any answer that cannot be read - rejects it. Commons titles are
//      not trustworthy on their own: a file called "Cat face" can be
//      anything.
//   4. Gemini LOOKS at the candidates and picks the one that makes the
//      funniest, clearest meme for that caption, or none; a pick that fails
//      the questionnaire is dropped and the choice is made again.
//   5. The chosen picture is saved to src/memehype/images/ and recorded in
//      manifest.json with its source, author and licence, because CC BY
//      requires attribution.
//
// A person still reviews every picture before it ships: automatic filters
// cut the risk down, they do not remove it.
//
// It is resumable: memes that already have a picture are skipped, so the
// script can be stopped and started again. A meme is matched to its picture
// by a fingerprint of its content, so editing a meme's text makes it look
// for a new picture instead of keeping one that no longer fits.
//
// Usage:
//   GEMINI_API_KEYS=key1,key2 [GEMINI_MODELS=a,b] node scripts/find-meme-images.js
//     [--limit 20] [--pack animals] [--rating 16] [--redo] [--concurrency 4]
//     [--reject id,id]
//
// The key is read from the environment only; it is never written anywhere.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const content = require('../src/memehype/content');

// One key or several (GEMINI_API_KEYS=a,b). Keys are never printed: logs
// name them #1, #2...
const KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',').map((k) => k.trim()).filter(Boolean);
const KEY = KEYS[0];
// Requests are spread over every key x model pair: each has its own rate
// and daily limit (on the free tier some models allow only 20 requests a
// day), so together they go much further, and a pair that runs out of quota
// or a retired model just drops out of the rotation for a while.
// GEMINI_MODELS overrides the list.
const MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL
  || 'gemini-3.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-3.5-flash-lite')
  .split(',').map((m) => m.trim()).filter(Boolean);
const IMAGES_DIR = path.join(__dirname, '..', 'src', 'memehype', 'images');
const MANIFEST = path.join(IMAGES_DIR, 'manifest.json');
// Photos a reviewer turned down: { memeId: [source page, ...] }. Use
// --reject <memeId,...> to drop a meme's current photo and never pick it
// again (works without a key; with one, new photos are looked for at once).
const REJECTED = path.join(IMAGES_DIR, 'rejected.json');
const UA = 'LandmarkMemeHype/1.1 (party game; free-licence image lookup)';
const THUMB_WIDTH = 480;
const BATCH = 12;
const CANDIDATES = 8;
// Anything whose title, description or categories mention one of these is
// never even shown to the model.
const BLOCK = /(nud|naked|nsfw|erotic|porn|\bsex|genital|vulva|vagina|penis|\banus\b|buttock|breast|nipple|topless|lingerie|underwear|bikini|thong|bdsm|fetish|body ?paint|boudoir|striptease|stripper|playboy|corpse|dead body|cadaver|\bblood|\bgore\b|wound|injur|autopsy|execution|hanging|weapon|\bguns?\b|rifle|swastika|nazi|\bdrugs?\b|syringe|portrait|selfie|\bpeople\b|\bpersons?\b|\bm[ae]n\b|\bwom[ae]n\b|\bgirls?\b|\bboys?\b|\bchild|\bkids?\b|\bteen|actress|\bactor|politician|celebrit)/i;
const NEGATIVE = '-nude -naked -erotic -nsfw -sexy -portrait -selfie -woman -man -girl';

const FREE = /^(public domain|pd|cc0|cc by(-sa)? ?\d(\.\d)?|cc-by(-sa)?-\d(\.\d)?|cc by(-sa)?)/i;

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const LIMIT = Number(arg('limit', 0)) || Infinity;
const ONLY_PACK = arg('pack');
const ONLY_RATING = arg('rating');
const REDO = args.includes('--redo');
const REJECT = args.flatMap((a, i) => (args[i - 1] === '--reject' ? a.split(',') : []));
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 4)) || 4);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The same fingerprint the content loader checks before using a picture.
const fingerprint = (m) => crypto.createHash('sha1').update(`${m.art}|${m.top}|${m.bottom}`).digest('hex').slice(0, 12);

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

function loadRejected() {
  try {
    return JSON.parse(fs.readFileSync(REJECTED, 'utf8'));
  } catch {
    return {};
  }
}

function saveManifest(manifest) {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
}

// --- Gemini ----------------------------------------------------------------

// Every key x model pair is a lane. lane -> time it may be used again;
// Infinity once it is gone for good.
const LANES = KEYS.flatMap((key, k) => MODELS.map((model) => ({
  key, model, name: `#${k + 1} ${model}`,
})));
const resting = new Map();
let turn = 0;

function nextLane() {
  const now = Date.now();
  for (let i = 0; i < LANES.length; i += 1) {
    const lane = LANES[(turn + i) % LANES.length];
    if ((resting.get(lane) || 0) <= now) {
      turn = (turn + i + 1) % LANES.length;
      return lane;
    }
  }
  return null;
}

function rest(lane, ms, why) {
  resting.set(lane, ms === Infinity ? Infinity : Date.now() + ms);
  console.log(`  ... ${lane.name}: ${why}, ${ms === Infinity ? 'dropped' : `resting ${Math.round(ms / 1000)}s`}`);
}

// How long a 429 asks to wait: a spent daily quota means hours, otherwise
// the server's retryDelay (or a backoff).
function quotaWait(body, attempt) {
  const details = body.error?.details || [];
  const daily = details.some((d) => (d.violations || []).some((v) => /PerDay/i.test(v.quotaId || '')));
  if (daily) return { ms: 3 * 3600000, why: '429 daily quota' };
  const delay = details.find((d) => d.retryDelay)?.retryDelay;
  const seconds = delay ? parseFloat(delay) : 0;
  return { ms: seconds > 0 ? seconds * 1000 + 1000 : Math.min(120000, 15000 * 2 ** Math.min(attempt, 3)), why: '429' };
}

async function gemini(parts, { json = true, attempt = 0 } = {}) {
  const lane = nextLane();
  if (!lane) {
    const soonest = Math.min(...LANES.map((l) => resting.get(l) || 0));
    if (!Number.isFinite(soonest)) throw new Error('no Gemini model is available');
    if (attempt >= 30) throw new Error('Gemini: every key and model is out of quota');
    console.log(`  ... every lane is resting, waiting ${Math.round((soonest - Date.now()) / 60000)} min`);
    await sleep(Math.max(1000, soonest - Date.now()));
    return gemini(parts, { json, attempt: attempt + 1 });
  }
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${lane.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': lane.key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.4 },
      }),
    });
  } catch (err) {
    rest(lane, 10000, err.message);
    return gemini(parts, { json, attempt: attempt + 1 });
  }
  if (res.status === 404 || res.status === 400 || res.status === 403) {
    const body = await res.json().catch(() => ({}));
    // A bad request about the content is ours, not the model's.
    if (res.status === 400 && !/model/i.test(body.error?.message || '')) throw new Error(`Gemini: ${body.error?.message}`);
    rest(lane, Infinity, `${res.status} ${(body.error?.message || '').slice(0, 60)}`);
    return gemini(parts, { json, attempt });
  }
  if (res.status === 429 || res.status >= 500) {
    const body = await res.json().catch(() => ({}));
    const wait = res.status === 429
      ? quotaWait(body, attempt)
      : { ms: Math.min(120000, 15000 * 2 ** Math.min(attempt, 3)), why: String(res.status) };
    rest(lane, wait.ms, wait.why);
    if (attempt >= 60) throw new Error(`Gemini ${res.status} after retries`);
    return gemini(parts, { json, attempt: attempt + 1 });
  }
  const body = await res.json();
  if (body.error) throw new Error(`Gemini: ${body.error.message}`);
  const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!json) return text;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/[[{][\s\S]*[\]}]/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function describe(m) {
  const pack = content.packById(m.pack);
  return {
    id: m.id,
    pack: pack?.title?.en,
    rating: `${m.rating}+`,
    idea: m.art,
    topCaption: m.top,
    bottomCaption: m.bottom,
  };
}

async function writeQueries(memes) {
  const prompt = `You are picking stock photos for a Russian meme party game.
For each meme below, the "idea" emoji describe the picture and the captions are the meme text (Russian).
Write 3 short English search queries (2-4 words each) for Wikimedia Commons that would find a PHOTO
carrying this meme: a funny, expressive, clear photo - usually an animal, an object or a scene.
Prefer animals and objects over people. Use plain words that a photo title would contain
(e.g. "goose", "hamster cheeks", "cat in box"); no brands, cartoon characters, weapons, food made of animals
or anything sexual. For the "USSR and the 90s" pack prefer Soviet-era objects,
places and scenes (cassette, dacha, Soviet kitchen, carpet on wall, old TV...).
Return JSON: [{"id": "...", "queries": ["...", "...", "..."]}]

Memes:
${JSON.stringify(memes.map(describe), null, 1)}`;
  const out = await gemini([{ text: prompt }]);
  return Array.isArray(out) ? out : [];
}

// --- Wikimedia Commons -------------------------------------------------------

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commons(query) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap ${NEGATIVE}`,
    gsrlimit: '20',
    prop: 'imageinfo|categories',
    clshow: '!hidden',
    cllimit: 'max',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: String(THUMB_WIDTH),
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const body = await res.json();
  return Object.values(body.query?.pages || {}).map((p) => {
    const info = p.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    return {
      title: p.title,
      mime: info.mime,
      width: info.width,
      height: info.height,
      thumb: info.thumburl,
      page: info.descriptionurl,
      license: strip(meta.LicenseShortName?.value),
      licenseUrl: meta.LicenseUrl?.value || null,
      author: strip(meta.Artist?.value) || 'Unknown author',
      restrictions: strip(meta.Restrictions?.value),
      text: [p.title, strip(meta.ImageDescription?.value), strip(meta.ObjectName?.value),
        ...(p.categories || []).map((c) => c.title)].join(' | '),
    };
  }).filter((c) => c.thumb
    && /image\/(jpeg|png)/.test(c.mime)
    && FREE.test(c.license)
    && !c.restrictions
    && !BLOCK.test(c.text)
    && c.width >= 300 && c.height >= 300
    && c.width / c.height <= 1.7 && c.height / c.width <= 1.7);
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- safety -------------------------------------------------------------------

// One picture, one strict questionnaire. The model is asked facts, not
// taste, and anything but a clean, readable "all false" is a rejection.
const SAFETY_KEYS = ['nudity', 'sexual_or_suggestive', 'underwear_or_swimwear', 'violence_or_gore',
  'weapon', 'drugs_or_smoking', 'person_is_main_subject', 'human_face_visible', 'readable_text_or_watermark',
  'hate_symbol', 'medical_or_disturbing'];

async function isSafe(c) {
  const out = await gemini([
    {
      text: `You are a strict content-safety checker for a family-friendly card game.
Look at this image carefully and answer each question with true or false.
If you are not completely sure, answer true.
Return JSON with exactly these boolean keys: ${SAFETY_KEYS.join(', ')}.`,
    },
    { inline_data: { mime_type: c.mime, data: c.bytes.toString('base64') } },
  ]);
  if (!out || typeof out !== 'object') return { ok: false, flags: ['unreadable answer'] };
  const flags = SAFETY_KEYS.filter((k) => out[k] !== false);
  return { ok: flags.length === 0, flags };
}

// --- choosing ------------------------------------------------------------------

async function choose(meme, candidates) {
  const parts = [{
    text: `Meme for a party game (${meme.rating}+ age mode, Russian captions).
Top caption: "${meme.top}"
Bottom caption: "${meme.bottom}"
Picture idea (emoji): ${meme.art}

Below are ${candidates.length} numbered candidate photos. Pick the one that makes the funniest, clearest meme
with these captions. The subject must be large, sharp and obvious at a glance on a small card, and the photo
should fit the captions' mood. Answer null only if none of the photos could work at all. Reject a photo if it has visible text or watermarks, is a map/diagram/document,
is blurry, shows nudity, gore or violence, or shows an identifiable private person as the subject.
Return JSON: {"pick": <number or null>, "reason": "<short>"}`,
  }];
  candidates.forEach((c, i) => {
    parts.push({ text: `Photo ${i + 1}:` });
    parts.push({ inline_data: { mime_type: c.mime, data: c.bytes.toString('base64') } });
  });
  const out = await gemini(parts);
  const n = Number(out?.pick);
  return Number.isInteger(n) && n >= 1 && n <= candidates.length ? { candidate: candidates[n - 1], reason: out.reason } : null;
}

// One query at a time: its candidates go to Gemini, and only if none of
// them works does the next query get a turn.
async function findFor(meme, queries, usedSources) {
  const seen = new Set();
  for (const q of queries.slice(0, 3)) {
    // eslint-disable-next-line no-await-in-loop
    const found = (await commons(q)).filter((c) => !seen.has(c.title) && !usedSources.has(c.page));
    found.forEach((c) => seen.add(c.title));
    const candidates = [];
    for (const c of found.slice(0, CANDIDATES)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        candidates.push({ ...c, query: q, bytes: await download(c.thumb) });
      } catch { /* a file that will not download is skipped */ }
    }
    // Gemini picks the best fit; that picture alone then goes through the
    // strict safety check. A rejected picture leaves the pool and the pick
    // is made again, so what comes out has always passed the check.
    for (let round = 0; round < 3 && candidates.length > 0; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      const pick = await choose(meme, candidates);
      if (!pick) break;
      // eslint-disable-next-line no-await-in-loop
      const safety = await isSafe(pick.candidate);
      if (safety.ok) return pick;
      console.log(`    rejected (${safety.flags.join(', ')}): ${pick.candidate.title}`);
      candidates.splice(candidates.indexOf(pick.candidate), 1);
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const manifest = loadManifest();
  const rejected = loadRejected();
  REJECT.forEach((id) => {
    const entry = manifest[id];
    if (!entry) return;
    rejected[id] = [...new Set([...(rejected[id] || []), entry.source])];
    fs.rmSync(path.join(IMAGES_DIR, entry.file), { force: true });
    delete manifest[id];
    console.log(`rejected ${id}: ${entry.title}`);
  });
  if (REJECT.length) {
    saveManifest(manifest);
    fs.writeFileSync(REJECTED, `${JSON.stringify(rejected, null, 2)}
`);
  }
  if (!KEY) {
    if (REJECT.length) return; // rejecting alone needs no key
    console.error('Set GEMINI_API_KEY (or GEMINI_API_KEYS=a,b) in the environment.');
    process.exit(1);
  }
  const usedSources = new Set(Object.values(manifest).map((e) => e.source));
  const all = content.RATINGS.flatMap((r) => content.memesFor(r, content.PACK_IDS))
    .filter((m) => (!ONLY_PACK || m.pack === ONLY_PACK) && (!ONLY_RATING || m.rating === ONLY_RATING));
  const todo = all.filter((m) => REDO || manifest[m.id]?.fingerprint !== fingerprint(m)).slice(0, LIMIT);
  console.log(`${KEYS.length} key(s) x models ${MODELS.join(', ')}. ${all.length} memes, ${todo.length} to look for.`);

  let found = 0;
  let missed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let queries = [];
    try {
      // eslint-disable-next-line no-await-in-loop
      queries = await writeQueries(batch);
    } catch (err) {
      console.log(`  queries failed: ${err.message}`);
    }
    const work = async (meme) => {
      const q = queries.find((x) => x.id === meme.id)?.queries || [];
      if (q.length === 0) {
        missed += 1;
        console.log(`- ${meme.id}: no queries`);
        return;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const pick = await findFor(meme, q, new Set([...usedSources, ...(rejected[meme.id] || [])]));
        if (!pick) {
          missed += 1;
          console.log(`- ${meme.id} (${meme.bottom || meme.top}): nothing fitting for ${q.join(' / ')}`);
          return;
        }
        const c = pick.candidate;
        // Another worker may have taken the same photo meanwhile.
        if (usedSources.has(c.page)) {
          missed += 1;
          console.log(`- ${meme.id}: its photo went to another meme, run again`);
          return;
        }
        const ext = c.mime === 'image/png' ? 'png' : 'jpg';
        const file = `${meme.id}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, file), c.bytes);
        manifest[meme.id] = {
          file,
          fingerprint: fingerprint(meme),
          title: c.title.replace(/^File:/, ''),
          source: c.page,
          author: c.author.slice(0, 160),
          license: c.license,
          licenseUrl: c.licenseUrl,
          query: c.query,
        };
        usedSources.add(c.page);
        saveManifest(manifest);
        found += 1;
        console.log(`+ ${meme.id} (${meme.bottom || meme.top}) <- ${c.title} [${c.license}]`);
      } catch (err) {
        missed += 1;
        console.log(`! ${meme.id}: ${err.message}`);
      }
    };
    // A few memes at a time; the batch finishes before the next one starts.
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(batch.slice(j, j + CONCURRENCY).map(work));
    }
  }
  console.log(`Done: ${found} found, ${missed} without a picture. Manifest: ${Object.keys(manifest).length} entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
