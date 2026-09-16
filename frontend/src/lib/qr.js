// qr.js
// A QR code encoder, small enough to read and self-contained.
//
// The big screen of a ЧПОК room shows a code that phones scan to join
// THIS room, so the thing in the picture has to be a real, scannable URL -
// a drawing of a QR code would be a picture of a feature rather than the
// feature. This is the encoder for it: byte mode, error-correction level
// M, versions 1 to 10, which comfortably covers any join link (a version
// 10 symbol holds 213 bytes).
//
// encode(text) returns a square array of arrays of booleans - true is a
// dark module. Drawing it is the caller's business; toSvgPath() builds the
// one path an <svg> needs.

const EC_LEVEL_BITS = 0b00; // level M: recovers about 15% of the symbol

// Per version (1-10) at level M: how many error-correction codewords each
// block carries, and how the data codewords are split into blocks. The two
// groups exist because some versions cannot divide their data evenly.
const VERSIONS = [
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];

// Where the small alignment squares sit, per version. Version 1 has none.
const ALIGNMENT = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const dataCodewords = (version) => VERSIONS[version - 1].groups
  .reduce((sum, [blocks, size]) => sum + blocks * size, 0);

const sizeOf = (version) => version * 4 + 17;

// The character-count field is wider once a symbol can hold more than 255
// bytes, which in byte mode happens from version 10.
const countBits = (version) => (version < 10 ? 8 : 16);

// --- GF(256) arithmetic, for the Reed-Solomon codewords ------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR field polynomial
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// The generator polynomial for `degree` error-correction codewords.
function generator(degree) {
  let poly = [1];
  for (let d = 0; d < degree; d += 1) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((coef, i) => {
      next[i] ^= coef;
      next[i + 1] ^= mul(coef, EXP[d]);
    });
    poly = next;
  }
  return poly;
}

function ecCodewords(data, degree) {
  const gen = generator(degree);
  const out = new Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    gen.slice(1).forEach((coef, i) => { out[i] ^= mul(coef, factor); });
  });
  return out;
}

// --- BCH, for the format and version areas -------------------------------

function bch(value, generatorPoly, bits) {
  let rest = value << bits;
  const genBits = generatorPoly.toString(2).length;
  while (rest.toString(2).length >= genBits) {
    rest ^= generatorPoly << (rest.toString(2).length - genBits);
  }
  return rest;
}

// 15 bits: five of level-and-mask, ten of BCH, masked so it is never all
// zero (which an unwritten symbol would look like).
function formatBits(mask) {
  const data = (EC_LEVEL_BITS << 3) | mask;
  return (((data << 10) | bch(data, 0b10100110111, 10)) ^ 0b101010000010010);
}

// 18 bits, written twice, only from version 7 up.
function versionBits(version) {
  return (version << 12) | bch(version, 0b1111100100101, 12);
}

// --- the bit stream ------------------------------------------------------

function toBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function pickVersion(byteLength) {
  for (let version = 1; version <= VERSIONS.length; version += 1) {
    const capacity = dataCodewords(version) * 8 - 4 - countBits(version);
    if (byteLength * 8 <= capacity) return version;
  }
  throw new Error('Too much data for a QR code of this size.');
}

function buildData(bytes, version) {
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits(version));
  bytes.forEach((b) => push(b, 8));

  const total = dataCodewords(version) * 8;
  for (let i = 0; i < 4 && bits.length < total; i += 1) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  // The two pad bytes the standard names, alternating to the end and
  // always starting with 0xEC however many data codewords came before.
  const PADS = [0xec, 0x11];
  for (let pad = 0; codewords.length < dataCodewords(version); pad += 1) {
    codewords.push(PADS[pad % 2]);
  }
  return codewords;
}

// Blocks are interleaved: one codeword from each block in turn, then the
// same for the error-correction codewords. A scratch on the symbol then
// damages a little of every block rather than destroying one outright.
function interleave(codewords, version) {
  const { ec, groups } = VERSIONS[version - 1];
  const blocks = [];
  let offset = 0;
  groups.forEach(([count, size]) => {
    for (let i = 0; i < count; i += 1) {
      const data = codewords.slice(offset, offset + size);
      offset += size;
      blocks.push({ data, ec: ecCodewords(data, ec) });
    }
  });

  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i += 1) {
    blocks.forEach((block) => { if (i < block.data.length) out.push(block.data[i]); });
  }
  for (let i = 0; i < ec; i += 1) blocks.forEach((block) => out.push(block.ec[i]));
  return out;
}

// --- laying out the symbol ----------------------------------------------

function blankMatrix(size) {
  return { modules: Array.from({ length: size }, () => new Array(size).fill(false)), reserved: Array.from({ length: size }, () => new Array(size).fill(false)) };
}

function setModule(m, row, col, dark, reserve = true) {
  m.modules[row][col] = dark;
  if (reserve) m.reserved[row][col] = true;
}

function placeFinder(m, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.modules.length || cc >= m.modules.length) continue; // eslint-disable-line no-continue
      const onRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setModule(m, rr, cc, onRing || inCore);
    }
  }
}

function placeAlignment(m, version) {
  const centres = ALIGNMENT[version - 1];
  const size = m.modules.length;
  centres.forEach((row) => centres.forEach((col) => {
    // The three corners already carry a finder pattern.
    const nearFinder = (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8);
    if (nearFinder) return;
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) {
        setModule(m, row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
      }
    }
  }));
}

function placeTiming(m) {
  const size = m.modules.length;
  for (let i = 8; i < size - 8; i += 1) {
    setModule(m, 6, i, i % 2 === 0);
    setModule(m, i, 6, i % 2 === 0);
  }
}

// The format area is written last but reserved now, so the data never
// tries to occupy it.
function reserveFormat(m) {
  const size = m.modules.length;
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      m.reserved[8][i] = true;
      m.reserved[i][8] = true;
    }
  }
  m.reserved[8][6] = true;
  m.reserved[6][8] = true;
  for (let i = 0; i < 8; i += 1) {
    m.reserved[8][size - 1 - i] = true;
    m.reserved[size - 1 - i][8] = true;
  }
  setModule(m, size - 8, 8, true); // the module that is always dark
}

function reserveVersion(m, version) {
  if (version < 7) return;
  const size = m.modules.length;
  for (let i = 0; i < 18; i += 1) {
    const row = Math.floor(i / 3);
    const col = size - 11 + (i % 3);
    m.reserved[row][col] = true;
    m.reserved[col][row] = true;
  }
}

function writeVersion(m, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  const size = m.modules.length;
  for (let i = 0; i < 18; i += 1) {
    const bit = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = size - 11 + (i % 3);
    m.modules[row][col] = bit;
    m.modules[col][row] = bit;
  }
}

// The fifteen bits go in twice: once as a strip beside the top-left
// finder, once split between the other two, so the symbol is still
// readable when one corner is damaged.
function writeFormat(m, mask) {
  const bits = formatBits(mask);
  const size = m.modules.length;
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1;
    if (i < 6) m.modules[i][8] = dark;
    else if (i < 8) m.modules[i + 1][8] = dark;
    else m.modules[size - 15 + i][8] = dark;

    if (i < 8) m.modules[8][size - 1 - i] = dark;
    else if (i === 8) m.modules[8][7] = dark;
    else m.modules[8][14 - i] = dark;
  }
}

// Data walks up and down in two-module-wide columns from the right edge,
// skipping the vertical timing column.
function writeData(m, codewords) {
  const size = m.modules.length;
  let bitIndex = 0;
  const nextBit = () => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex += 1;
    return bit === 1;
  };
  let upward = true;
  let col = size - 1;
  while (col > 0) {
    // Column 6 is the vertical timing pattern: the pairs step over it
    // entirely rather than pairing with it.
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const c = col - offset;
        if (m.reserved[row][c]) continue; // eslint-disable-line no-continue
        m.modules[row][c] = nextBit();
      }
    }
    upward = !upward;
    col -= 2;
  }
}

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function applyMask(m, mask) {
  const fn = MASKS[mask];
  const size = m.modules.length;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!m.reserved[row][col] && fn(row, col)) m.modules[row][col] = !m.modules[row][col];
    }
  }
}

// The four penalty rules: long runs, 2x2 blocks, finder-like patterns, and
// an unbalanced ratio of dark to light. The mask with the lowest total is
// the one a scanner will have the easiest time with.
function penalty(modules) {
  const size = modules.length;
  let score = 0;

  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < size; i += 1) {
      if (line[i] === line[i - 1]) {
        run += 1;
      } else {
        if (run >= 5) total += run - 2;
        run = 1;
      }
    }
    if (run >= 5) total += run - 2;
    return total;
  };
  for (let i = 0; i < size; i += 1) {
    score += runScore(modules[i]);
    score += runScore(modules.map((row) => row[i]));
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
    }
  }

  const FINDER = [true, false, true, true, true, false, true, false, false, false, false];
  const matches = (line, start, pattern) => pattern.every((v, k) => line[start + k] === v);
  const scanLine = (line) => {
    let total = 0;
    for (let i = 0; i + 11 <= size; i += 1) {
      if (matches(line, i, FINDER) || matches(line, i, [...FINDER].reverse())) total += 40;
    }
    return total;
  };
  for (let i = 0; i < size; i += 1) {
    score += scanLine(modules[i]);
    score += scanLine(modules.map((row) => row[i]));
  }

  const dark = modules.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * Encodes `text` and returns the symbol as rows of booleans (true = dark).
 * `forcedMask` pins one of the eight masks instead of scoring all of them;
 * it exists so a test can compare a single symbol against a reference.
 */
export function encode(text, forcedMask = null) {
  const bytes = toBytes(String(text));
  const version = pickVersion(bytes.length);
  const codewords = interleave(buildData(bytes, version), version);
  const size = sizeOf(version);

  const masks = forcedMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask];
  let best = null;
  for (const mask of masks) { // eslint-disable-line no-restricted-syntax
    const m = blankMatrix(size);
    placeFinder(m, 0, 0);
    placeFinder(m, 0, size - 7);
    placeFinder(m, size - 7, 0);
    placeAlignment(m, version);
    placeTiming(m);
    reserveFormat(m);
    reserveVersion(m, version);
    writeData(m, codewords);
    applyMask(m, mask);
    writeFormat(m, mask);
    writeVersion(m, version);
    const score = penalty(m.modules);
    if (!best || score < best.score) best = { score, modules: m.modules };
  }
  return best.modules;
}

/**
 * The dark modules of a symbol as one SVG path, in a viewBox of
 * `size + 2 * quietZone` units. The quiet zone is part of the standard -
 * a symbol drawn hard against something else often will not scan.
 */
export function toSvgPath(modules, quietZone = 4) {
  const parts = [];
  modules.forEach((row, r) => {
    let run = 0;
    row.forEach((dark, c) => {
      if (dark) {
        run += 1;
        return;
      }
      if (run > 0) parts.push(`M${c - run + quietZone} ${r + quietZone}h${run}v1h-${run}z`);
      run = 0;
    });
    if (run > 0) parts.push(`M${row.length - run + quietZone} ${r + quietZone}h${run}v1h-${run}z`);
  });
  return parts.join('');
}

export function viewBoxOf(modules, quietZone = 4) {
  const side = modules.length + quietZone * 2;
  return `0 0 ${side} ${side}`;
}

export default encode;
