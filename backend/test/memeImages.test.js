// memeImages.test.js
// Meme Hype pictures: your own files in images/custom/ are picked up by
// meme id, win over found photos, are served, and never cross ratings.

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meme-custom-'));
process.env.MEMEHYPE_CUSTOM_IMAGES = dir;
fs.writeFileSync(path.join(dir, 'animals.16.m2.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
fs.writeFileSync(path.join(dir, 'everyday.18.m1.jpg'), 'x');
fs.writeFileSync(path.join(dir, 'animals.16.m999.jpg'), 'x');
fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a picture');

require('./helpers/testEnv');

const express = require('express');
const content = require('../src/memehype/content');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${msg}`);
}

(async () => {
  const mine = content.memeById('animals.16.m2', '16');
  assert(mine.image === '/memes/custom/animals.16.m2.png', 'a file named by meme id becomes that meme\'s picture');
  assert(mine.imageSource === 'custom' && mine.credit === null, 'it wins over a found photo and carries no Commons credit');
  assert(content.memeById('everyday.18.m1', '18').image === '/memes/custom/everyday.18.m1.jpg', '18+ memes take custom pictures too');
  assert(content.memeById('everyday.18.m1', '16') === null, 'and a 16+ lookup still cannot reach them');
  assert(!content.credits().some((c) => c.meme === 'animals.16.m2'), 'the credits list skips your own pictures');
  assert(content.unmatchedCustom().join() === 'animals.16.m999.jpg', 'a file matching no meme is reported, other files are ignored');
  const plain = content.memesFor('16', content.PACK_IDS).find((m) => !m.image);
  assert(!plain || (plain.imageSource === null && plain.image === null), 'a meme without any picture keeps its emoji art');

  const app = express();
  app.use(content.CUSTOM_URL, express.static(content.CUSTOM_DIR));
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${mine.image}`);
  assert(res.status === 200 && res.headers.get('content-type') === 'image/png', 'the picture is served at its URL');
  server.close();

  fs.rmSync(dir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`\nMeme image tests: ${passed} passed`);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
