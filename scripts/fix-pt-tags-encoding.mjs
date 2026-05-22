/**
 * Fix PtTagsPage.tsx strings where UTF-8 was mis-read as Latin-1/Windows-1252 (mojibake).
 * Run: node scripts/fix-pt-tags-encoding.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../frontend/src/pages/PtTagsPage.tsx');

function fixUtf8Mojibake(str) {
  let out = '';
  for (let i = 0; i < str.length; ) {
    const c0 = str.charCodeAt(i);

    if (c0 === 0xe2 && i + 2 < str.length) {
      const triple = str.slice(i, i + 3);
      const tripleMap = new Map([
        ['\u00e2\u20ac\u201d', '\u2014'], // —
        ['\u00e2\u20ac\u00a6', '\u2026'], // …
        ['\u00e2\u2020\u2019', '\u2192'], // →
        ['\u00e2\u2030\u00a5', '\u2265'], // ≥
      ]);
      const rep = tripleMap.get(triple);
      if (rep) {
        out += rep;
        i += 3;
        continue;
      }
    }

    if ((c0 === 0xc2 || c0 === 0xc3) && i + 1 < str.length) {
      const c1 = str.charCodeAt(i + 1);
      if (c1 <= 0xff) {
        const dec = Buffer.from([c0, c1]).toString('utf8');
        if (dec.length === 1 && dec.charCodeAt(0) !== 0xfffd) {
          out += dec;
          i += 2;
          continue;
        }
      }
    }

    out += str[i];
    i += 1;
  }
  return out;
}

const raw = fs.readFileSync(file, 'utf8');
const fixed = fixUtf8Mojibake(raw);
if (fixed !== raw) {
  fs.writeFileSync(file, fixed, 'utf8');
  console.log('Fixed mojibake in', path.relative(process.cwd(), file));
} else {
  console.log('No mojibake changes needed');
}
