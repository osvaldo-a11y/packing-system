/**
 * Servicio local de impresión Zebra (Express, Windows PowerShell RAW).
 *
 * Impresora: autodetectada al arrancar (wmic) o override con ZEBRA_PRINTER_NAME.
 * Sin nombres de impresora hardcodeados en código.
 *
 * Flujo FIFO:
 * POST /print → cola → drainQueue → PowerShell RAW
 */

const cors = require('cors');
const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PRINT_SERVICE_PORT || 3001);
const PRINT_SCRIPT = path.join(__dirname, 'print-zpl-raw.ps1');
const LIST_PRINTERS_SCRIPT = path.join(__dirname, 'list-printers.ps1');

const MAX_JOB_HISTORY = 200;
const JOB_LIST_LIMIT = 20;

/** Palabras clave en el nombre de cola Windows (case-insensitive). */
const ZEBRA_NAME_HINTS = ['zebra', 'zt', 'zd', 'gk', 'zpl'];

const jobs = [];
const pendingQueue = [];
let processing = false;

/** Impresora resuelta al arrancar (env ZEBRA_PRINTER_NAME o primera Zebra vía wmic). */
let detectedPrinterName = null;
let detectedPrinterSource = null;
let cachedWmicPrinterNames = [];

function tsIso(ms) {
  try {
    return new Date(Number(ms)).toISOString();
  } catch {
    return null;
  }
}

/** Lista nombres de impresoras con WMIC (Windows). */
function listWindowsPrintersWmic() {
  try {
    const output = execSync('wmic printer get name', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    }).toString();
    const lines = output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^name$/i.test(l));
    return lines;
  } catch (err) {
    console.warn('[zebra-print-service] wmic printer get name falló:', err instanceof Error ? err.message : err);
    return [];
  }
}

function isZebraCandidateName(name) {
  const lower = String(name).toLowerCase();
  return ZEBRA_NAME_HINTS.some((hint) => lower.includes(hint));
}

function pickFirstZebraPrinter(allNames) {
  return allNames.find(isZebraCandidateName) ?? null;
}

/**
 * Resuelve impresora al arrancar.
 * 1) ZEBRA_PRINTER_NAME (override manual)
 * 2) Primera cola cuyo nombre coincida con ZEBRA_NAME_HINTS
 */
function resolvePrinterAtStartup() {
  cachedWmicPrinterNames = listWindowsPrintersWmic();
  const envOverride = process.env.ZEBRA_PRINTER_NAME?.trim();
  if (envOverride) {
    detectedPrinterName = envOverride;
    detectedPrinterSource = 'env';
    console.log(`[zebra-print-service] Impresora (ZEBRA_PRINTER_NAME): ${detectedPrinterName}`);
    return;
  }
  const auto = pickFirstZebraPrinter(cachedWmicPrinterNames);
  if (auto) {
    detectedPrinterName = auto;
    detectedPrinterSource = 'auto';
    console.log(`[zebra-print-service] Impresora autodetectada: ${detectedPrinterName}`);
    return;
  }
  detectedPrinterName = null;
  detectedPrinterSource = null;
  console.warn(
    '[zebra-print-service] No se detectó impresora Zebra. Instaladas:',
    cachedWmicPrinterNames.length ? cachedWmicPrinterNames.join(' | ') : '(ninguna vía wmic)',
  );
}

function serviceStatus() {
  return detectedPrinterName ? 'ready' : 'no_printer';
}

function noPrinterErrorPayload() {
  const available = listWindowsPrintersWmic();
  cachedWmicPrinterNames = available;
  return {
    error: 'No Zebra printer found',
    available_printers: available,
  };
}

/** Impresora efectiva para un job: selección del cliente o autodetectada. */
function effectivePrinterForJob(jobPrinterName) {
  const fromJob = typeof jobPrinterName === 'string' ? jobPrinterName.trim() : '';
  if (fromJob) return fromJob;
  return detectedPrinterName;
}

function summarizeJob(job) {
  return {
    id: job.id,
    zplBytes: typeof job.zpl === 'string' ? job.zpl.length : 0,
    printerName: job.printerName ? job.printerName : null,
    copies: job.copies,
    filename: job.filename,
    status: job.status,
    timestamp: tsIso(job.createdAt),
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    finishedAt: job.finishedAt ?? null,
    errorMessage: job.errorMessage ?? null,
    printer: job.printer ?? null,
    printed_bytes: job.printed_bytes ?? null,
  };
}

app.use(cors());
app.use(express.json({ limit: '512kb' }));

app.get('/status', (_req, res) => {
  const st = serviceStatus();
  const body = {
    printer: detectedPrinterName,
    status: st,
    source: detectedPrinterSource,
  };
  if (st === 'no_printer') {
    body.available_printers = listWindowsPrintersWmic();
  }
  res.json(body);
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'local-zebra-print-service',
    printer: detectedPrinterName,
    status: serviceStatus(),
    queuePending: pendingQueue.length,
    processing,
  });
});

app.get('/printers', async (_req, res) => {
  const result = await runListPrintersScript();
  if (!result.ok) {
    return res.status(500).json({
      ok: false,
      message: result.message || 'No se pudo listar impresoras.',
      defaultPrinter: '',
      printers: [],
    });
  }
  return res.json(result);
});

app.get('/jobs', (_req, res) => {
  const list = jobs.slice(0, JOB_LIST_LIMIT).map(summarizeJob);
  res.json({
    ok: true,
    jobs: list,
    pendingInQueue: pendingQueue.length,
    processing,
  });
});

app.get('/jobs/:jobId', (req, res) => {
  const id = String(req.params.jobId || '').trim();
  if (!id) {
    return res.status(400).json({ ok: false, message: 'jobId requerido.' });
  }
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return res.status(404).json({ ok: false, message: 'Job no encontrado.' });
  }
  return res.json({
    ok: true,
    job: summarizeJob(job),
  });
});

function normalizeAndAssertZplOrThrow(raw) {
  const zpl = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!zpl) {
    throw new Error('Body inválido: `zpl` es obligatorio.');
  }
  const head = zpl.slice(0, 800);
  if (/<!DOCTYPE\s+html/i.test(head) || /<\s*html[\s>/]/i.test(head)) {
    throw new Error(
      'El cuerpo parece HTML (p. ej. página del sistema o login), no ZPL. Revisá sesión/API o que el GET /api/labels/tarja/… devuelva texto ^XA…^XZ.',
    );
  }
  if (/^\s*\{/.test(zpl) && /"message"\s*:/.test(head)) {
    throw new Error('El cuerpo parece JSON de error, no ZPL. Revisá autenticación y el endpoint del backend.');
  }
  const start = zpl.replace(/^\s+/, '').slice(0, 4);
  if (!start.toUpperCase().startsWith('^XA')) {
    const prev = zpl.slice(0, 160).replace(/\r?\n/g, ' ');
    throw new Error(`ZPL inválido: debe empezar con ^XA. Inicio recibido: ${prev}`);
  }
  return zpl;
}

function enqueuePrintJob(req, res) {
  const zplRaw = typeof req.body?.zpl === 'string' ? req.body.zpl : '';
  const requestedFilename = typeof req.body?.filename === 'string' ? req.body.filename : '';
  const printerName = typeof req.body?.printerName === 'string' ? req.body.printerName.trim() : '';
  const jobName = typeof req.body?.jobName === 'string' ? req.body.jobName.trim() : '';
  const copiesRaw = req.body?.copies;
  const copiesParsed = Number.parseInt(String(copiesRaw ?? '1'), 10);
  const copies = Number.isFinite(copiesParsed) ? Math.min(Math.max(copiesParsed, 1), 99) : 1;

  const targetPrinter = effectivePrinterForJob(printerName);
  if (!targetPrinter) {
    return res.status(503).json(noPrinterErrorPayload());
  }

  let zpl;
  try {
    zpl = normalizeAndAssertZplOrThrow(zplRaw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ ok: false, message });
  }

  const baseFilename = sanitizeFilename(requestedFilename || `tarja-${Date.now()}.zpl`);
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const job = {
    id,
    zpl,
    printerName: targetPrinter,
    copies,
    filename: baseFilename,
    jobName: jobName || baseFilename,
    status: 'pending',
    createdAt,
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    printer: null,
    printed_bytes: null,
  };

  jobs.unshift(job);
  while (jobs.length > MAX_JOB_HISTORY) {
    jobs.pop();
  }
  pendingQueue.push(job);

  const queuePositionAfterEnqueue = pendingQueue.length;

  console.log(
    `[queue] enqueue job=${id} file=${baseFilename} printer=${targetPrinter} copies=${copies} pending=${queuePositionAfterEnqueue}`,
  );

  void drainQueue();

  return res.status(202).json({
    ok: true,
    queued: true,
    jobId: id,
    status: 'pending',
    pendingInQueue: queuePositionAfterEnqueue,
    timestamp: tsIso(createdAt),
    printer: targetPrinter,
  });
}

app.post('/print', enqueuePrintJob);

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (pendingQueue.length > 0) {
      const job = pendingQueue.shift();
      const printerForJob = effectivePrinterForJob(job.printerName);
      if (!printerForJob) {
        job.status = 'error';
        job.errorMessage = 'No Zebra printer found';
        job.finishedAt = Date.now();
        console.error(`[queue] print-skip job=${job.id} sin impresora`);
        continue;
      }

      job.status = 'printing';
      job.startedAt = Date.now();
      console.log(
        `[queue] print-start job=${job.id} printer=${printerForJob} pendingLeft=${pendingQueue.length}`,
      );

      try {
        const zplToPrint = applyZplCopies(job.zpl, job.copies);
        const tempPath = path.join(os.tmpdir(), `ps-zebra-${crypto.randomUUID()}-${job.filename}`);

        await fs.writeFile(tempPath, zplToPrint, 'utf8');
        const result = await runPrintScript({
          filePath: tempPath,
          printerName: printerForJob,
          jobName: job.jobName,
        });

        try {
          await fs.unlink(tempPath);
        } catch {
          /* ignore */
        }

        if (!result.ok) {
          throw new Error(result.message || 'Falló la impresión local.');
        }

        job.status = 'done';
        job.printer = result.printer || printerForJob;
        job.printed_bytes = result.printed_bytes ?? null;
        job.finishedAt = Date.now();
        console.log(
          `[queue] print-done job=${job.id} printer=${job.printer} ms=${job.finishedAt - job.startedAt}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        job.status = 'error';
        job.errorMessage = msg;
        job.finishedAt = Date.now();
        console.error(`[queue] print-error job=${job.id}`, msg);
      }
    }
  } finally {
    processing = false;
    if (pendingQueue.length > 0) {
      setImmediate(() => {
        void drainQueue();
      });
    }
  }
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').slice(0, 120);
}

function applyZplCopies(zpl, copies) {
  const n = Math.min(Math.max(Number(copies) || 1, 1), 99);
  if (n === 1) return zpl;
  if (/\^PQ\s*\d+\s*,\s*0\s*,\s*1\s*,\s*Y/i.test(zpl)) {
    return zpl.replace(/\^PQ\s*\d+\s*,\s*0\s*,\s*1\s*,\s*Y/gi, `^PQ${n},0,1,Y`);
  }
  return zpl.replace(/\^XZ\s*$/m, `^PQ${n},0,1,Y\n^XZ`);
}

function runPrintScript({ filePath, printerName, jobName }) {
  return new Promise((resolve) => {
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      PRINT_SCRIPT,
      '-FilePath',
      filePath,
      '-JobName',
      jobName,
      '-PrinterName',
      printerName,
    ];

    const proc = spawn('powershell.exe', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      const parsed = safeParseJson(stdout);
      if (code === 0) {
        if (parsed && parsed.ok) {
          resolve(parsed);
          return;
        }
        resolve({
          ok: true,
          message: 'Impresión enviada.',
          printer: printerName,
        });
        return;
      }

      if (parsed && parsed.ok === false) {
        resolve(parsed);
        return;
      }

      resolve({
        ok: false,
        message: parsed?.message || stderr.trim() || stdout.trim() || `PowerShell finalizó con código ${code}`,
      });
    });
  });
}

function runListPrintersScript() {
  return new Promise((resolve) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LIST_PRINTERS_SCRIPT];
    const proc = spawn('powershell.exe', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      const parsed = safeParseJson(stdout);
      if (parsed) {
        resolve(parsed);
        return;
      }
      resolve({
        ok: false,
        message: stderr.trim() || stdout.trim() || `PowerShell finalizó con código ${code}`,
        defaultPrinter: '',
        printers: [],
      });
    });
  });
}

function safeParseJson(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1];
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

function startServer() {
  resolvePrinterAtStartup();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[zebra-print-service] http://127.0.0.1:${PORT}`);
    console.log(
      '[zebra-print-service] GET /status · POST /print · GET /jobs · GET /printers · GET /health',
    );
    console.log(`[zebra-print-service] Estado: ${serviceStatus()} · impresora: ${detectedPrinterName ?? '—'}`);
  });
}

startServer();
