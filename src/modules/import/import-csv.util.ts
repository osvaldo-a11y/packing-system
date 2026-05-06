/** Strip UTF-8 BOM if present. */
export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

export function detectDelimiter(firstLine: string): ',' | ';' {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

/** Split CSV line respecting double-quoted fields. */
export function splitCsvLine(line: string, delim: ',' | ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && c === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function escapeCsvCell(value: string, delim: ',' | ';'): string {
  const needsQuote = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delim);
  let v = value.replace(/"/g, '""');
  return needsQuote ? `"${v}"` : v;
}

export function parseCsv(text: string, delim: ',' | ';'): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((l) => splitCsvLine(l, delim));
}

/** Skip template metadata rows (comment rows starting with #). */
export function isCommentOrBlankRow(cells: string[]): boolean {
  if (cells.length === 0 || cells.every((c) => c === '')) return true;
  const first = cells[0]?.trim() ?? '';
  return first.startsWith('#');
}

/** Footer catálogos en plantilla generada: dejar de tomar filas de datos. */
export function isCatalogSectionStart(cells: string[]): boolean {
  const first = cells[0]?.trim() ?? '';
  return first.includes('Catálogos') && first.startsWith('#');
}

export interface ExtractedCsv {
  delim: ',' | ';';
  headers: string[];
  rows: Array<{ lineNumber: number; record: Record<string, string> }>;
}

/** Primera fila no comentario = cabeceras; filas siguientes hasta bloque catálogo # --- Catálogos. */
export function extractCsvRecords(text: string): ExtractedCsv {
  const cleaned = stripBom(text);
  const rawLines = cleaned.split(/\r?\n/);
  const firstNonEmpty = rawLines.find((l) => l.trim().length > 0) ?? '';
  const delim = detectDelimiter(firstNonEmpty);

  let headerArr: string[] | null = null;
  const rows: ExtractedCsv['rows'] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx];
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delim);
    if (cells.length && isCatalogSectionStart(cells)) break;
    if (isCommentOrBlankRow(cells)) continue;

    if (!headerArr) {
      headerArr = cells.map((h) => h.trim());
      continue;
    }

    const record: Record<string, string> = {};
    for (let i = 0; i < headerArr.length; i++) {
      record[headerArr[i]] = cells[i]?.trim() ?? '';
    }
    rows.push({ lineNumber: idx + 1, record });
  }

  if (!headerArr) {
    throw new Error('CSV sin fila de cabeceras');
  }

  return { delim, headers: headerArr, rows };
}
