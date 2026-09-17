#!/usr/bin/env node
// meme-catalog.js
// Lists every Meme Hype meme with its id and where its picture comes from,
// so you know what to name a file in src/memehype/images/custom/.
//
// Usage (from backend/):
//   npm run memes                         all memes
//   npm run memes -- --missing            only memes still drawn as emoji
//   npm run memes -- --pack ussr --rating 18
//   npm run memes -- --html               also writes backend/meme-catalog.html,
//                                         a page with every card to look at
//                                         (kept out of the served folders:
//                                         it lists the 18+ captions too)
//
// Picture sources: custom = your file, found = a Commons photo from
// scripts/find-meme-images.js, emoji = no picture yet.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const content = require('../src/memehype/content');

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const onlyPack = arg('pack');
const onlyRating = arg('rating');
const missing = args.includes('--missing');

const memes = content.RATINGS.flatMap((r) => content.PACKS.flatMap((p) => p.byRating[r].memes))
  .filter((m) => (!onlyPack || m.pack === onlyPack) && (!onlyRating || m.rating === onlyRating))
  .filter((m) => !missing || !m.image);

const source = (m) => m.imageSource || 'emoji';
const caption = (m) => [m.top, m.bottom].filter(Boolean).join(' / ');

memes.forEach((m) => {
  console.log(`${m.id.padEnd(18)} ${source(m).padEnd(6)} ${m.art}  ${caption(m)}`);
});

const count = (s) => memes.filter((m) => source(m) === s).length;
console.log(`\n${memes.length} memes: ${count('custom')} custom, ${count('found')} found, ${count('emoji')} emoji.`);
console.log(`Your pictures go to ${content.CUSTOM_DIR}`);
console.log(`named <id>${content.CUSTOM_EXT[0]} (also ${content.CUSTOM_EXT.slice(1).join(' ')}). Restart the server afterwards.`);

const unmatched = content.unmatchedCustom();
if (unmatched.length) {
  console.log(`\nThese files match no meme id - check the names: ${unmatched.join(', ')}`);
}
const heavy = fs.existsSync(content.CUSTOM_DIR)
  ? fs.readdirSync(content.CUSTOM_DIR)
    .filter((f) => content.CUSTOM_EXT.includes(path.extname(f).toLowerCase()))
    .filter((f) => fs.statSync(path.join(content.CUSTOM_DIR, f)).size > 600 * 1024)
  : [];
if (heavy.length) {
  console.log(`\nOver 600 KB (slow on phones - shrink to ~600px wide): ${heavy.join(', ')}`);
}

if (args.includes('--html')) {
  const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
  // The page opens straight from disk, so pictures are linked as files.
  const src = (m) => {
    if (m.imageSource === 'custom') {
      const name = decodeURIComponent(m.image.slice(content.CUSTOM_URL.length + 1));
      return pathToFileURL(path.join(content.CUSTOM_DIR, name)).href;
    }
    if (m.imageSource === 'found') {
      return pathToFileURL(path.join(content.IMAGES_DIR, m.image.slice(content.IMAGE_URL.length + 1))).href;
    }
    return null;
  };
  const cards = memes.map((m) => {
    const pic = src(m)
      ? `<img src="${esc(src(m))}" alt="">`
      : `<div class="art">${esc(m.art)}</div>`;
    return `<figure class="${source(m)}">${pic}<figcaption><code>${m.id}</code> <b>${source(m)}</b><br>${esc(caption(m))}</figcaption></figure>`;
  }).join('\n');
  const file = path.join(__dirname, '..', 'meme-catalog.html');
  fs.writeFileSync(file, `<!doctype html>
<html lang="ru"><meta charset="utf-8"><title>Meme Hype catalog</title>
<style>
body { font: 13px system-ui, sans-serif; margin: 16px; background: #f4f4f5; color: #18181b; }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
figure { margin: 0; background: #fff; border-radius: 10px; overflow: hidden; border: 2px solid transparent; }
figure.custom { border-color: #22c55e; } figure.emoji { border-color: #f59e0b; }
img, .art { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #27272a; }
.art { display: flex; align-items: center; justify-content: center; font-size: 56px; }
figcaption { padding: 6px 8px; } code { user-select: all; }
</style>
<h1>Meme Hype - ${memes.length} memes</h1>
<p>Green - your picture, orange - no picture yet. Save a file as <code>&lt;id&gt;.jpg</code> in <code>${esc(content.CUSTOM_DIR)}</code> and restart the server.</p>
<main>
${cards}
</main>
</html>
`);
  console.log(`\nCatalog page: ${file}`);
}
