/**
 * Inserta columna line_variety_id después de species_id en CSV de recepciones multi-fila.
 * En filas de detalle (received_at vacío + reception_reference), asigna códigos en round-robin.
 */
import fs from 'fs';

function splitLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (!q && ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function joinLine(cells) {
  return cells.map((c) => (/,|"/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',');
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? inputPath;
if (!inputPath) {
  console.error('Uso: node scripts/patch-reception-csv-line-variety.mjs <entrada.csv> [salida.csv]');
  process.exit(1);
}

const codes = ['POP', 'GD', 'SEN', 'PATR', 'MWL', 'KC', 'FAR'];
let rr = 0;

const text = fs.readFileSync(inputPath, 'utf8');
const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
const origHeaders = splitLine(lines[0]);
const si = origHeaders.indexOf('species_id');
if (si < 0) throw new Error('Cabecera sin species_id');
if (origHeaders.includes('line_variety_id')) {
  console.log('Ya existe line_variety_id; no se modifica.');
  process.exit(0);
}
const ri = origHeaders.indexOf('reception_reference');
const headers = [...origHeaders];
headers.splice(si + 1, 0, 'line_variety_id');
const outLines = [joinLine(headers)];

for (let i = 1; i < lines.length; i++) {
  const cells = splitLine(lines[i]);
  while (cells.length < origHeaders.length) cells.push('');
  const isDetail =
    (!cells[0] || cells[0].trim() === '') &&
    ri >= 0 &&
    (cells[ri] ?? '').trim() !== '' &&
    (cells[si] ?? '').trim() !== '';
  const code = isDetail ? codes[rr++ % codes.length] : '';
  cells.splice(si + 1, 0, code);
  outLines.push(joinLine(cells));
}

fs.writeFileSync(outputPath, outLines.join('\n') + '\n', 'utf8');
console.log('OK', outputPath, 'filas', outLines.length);
