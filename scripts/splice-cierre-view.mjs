import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = path.join(root, 'frontend/src/pages/ReportingPage.tsx');
const blockPath = path.join(root, 'frontend/src/pages/_cierre-view-block.txt');

const lines = fs.readFileSync(pagePath, 'utf8').split(/\r?\n/);
const block = fs.readFileSync(blockPath, 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);

const start = lines.findIndex((l) => l.includes("reportTab === 'cierre' && reportData"));
if (start < 0) throw new Error('start not found');

let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i] === '          ) : null}' && lines[i - 1]?.trim() === '</div>') {
    end = i;
    break;
  }
}
if (end < 0) throw new Error('end not found');

const out = [...lines.slice(0, start), ...block, ...lines.slice(end + 1)];
fs.writeFileSync(pagePath, out.join('\n'));
console.log(`replaced lines ${start + 1}-${end + 1}`);
