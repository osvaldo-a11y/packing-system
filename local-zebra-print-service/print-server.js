/**
 * Servicio local de impresión Zebra (Express, Windows PowerShell RAW).
 *
 * Flujo FIFO (robustez operativa):
 * 1) POST /print solo VALIDA el cuerpo, crea el job (`pending`) y lo agrega al final de la cola.
 *    Responde 202 de inmediato con `jobId` — no espera al driver/spool.
 * 2) `drainQueue()` procesa de a un job: estado `printing` → PowerShell RAW → `done` o `error`.
 * 3) Si un job falla, se marca `error`, se loguea en consola y se continúa con el siguiente
 *    (la cola nunca queda bloqueada por un error).
 *
 * Estado de jobs:
 * GET /jobs        → últimos 20 snapshots (orden reciente primero)
 * GET /jobs/:jobId → un job por id (polling desde el navegador)
 */

const cors = require('cors');
const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PRINT_SERVICE_PORT || 3001);
const PRINT_SCRIPT = path.join(__dirname, 'print-zpl-raw.ps1');
const LIST_PRINTERS_SCRIPT = path.join(__dirname, 'list-printers.ps1');

const MAX_JOB_HISTORY = 200;
const JOB_LIST_LIMIT = 20;

/** Historial vivo (orden: más nuevo al inicio de `jobs`); cada ítem coincide con uno encolado. */
const jobs = [];

/** FIFO: solo refs a jobs en espera (`pending`). `drainQueue` hace shift. */
const pendingQueue = [];

let processing = false;

function tsIso(ms) {
  try {
    return new Date(Number(ms)).toISOString();
  } catch {
    return null;
  }
}

/** Sin ZPL gigante ni buffers internos; solo metadatos operativos. */
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

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'local-zebra-print-service',
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

/** Últimos N jobs sin cuerpo ZPL (solo peso por `zplBytes`). */
app.get('/jobs', (_req, res) => {
  const list = jobs.slice(0, JOB_LIST_LIMIT).map(summarizeJob);
  res.json({
    ok: true,
    jobs: list,
    pendingInQueue: pendingQueue.length,
    processing,
  });
});

/** Un job puntual por id — sin incluir el ZPL crudo en la respuesta. */
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

function enqueuePrintJob(req, res) {
  const zpl = typeof req.body?.zpl === 'string' ? req.body.zpl : '';
  const requestedFilename = typeof req.body?.filename === 'string' ? req.body.filename : '';
  const printerName = typeof req.body?.printerName === 'string' ? req.body.printerName.trim() : '';
  const jobName = typeof req.body?.jobName === 'string' ? req.body.jobName.trim() : '';
  const copiesRaw = req.body?.copies;
  const copiesParsed = Number.parseInt(String(copiesRaw ?? '1'), 10);
  const copies = Number.isFinite(copiesParsed) ? Math.min(Math.max(copiesParsed, 1), 99) : 1;

  if (!zpl.trim()) {
    return res.status(400).json({ ok: false, message: 'Body inválido: `zpl` es obligatorio.' });
  }

  const baseFilename = sanitizeFilename(requestedFilename || `tarja-${Date.now()}.zpl`);
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const job = {
    id,
    zpl: zpl.trim(),
    printerName,
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
    `[queue] enqueue job=${id} file=${baseFilename} copies=${copies} pending=${queuePositionAfterEnqueue} processing=${processing}`,
  );

  void drainQueue();

  return res.status(202).json({
    ok: true,
    queued: true,
    jobId: id,
    status: 'pending',
    pendingInQueue: queuePositionAfterEnqueue,
    timestamp: tsIso(createdAt),
  });
}

app.post('/print', enqueuePrintJob);

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[zebra-print-service] http://127.0.0.1:${PORT}`);
  console.log(
    '[zebra-print-service] POST /print · GET /jobs · GET /jobs/:id · GET /printers · GET /health',
  );
});

async function drainQueue() {
  if (processing) return;
  processing = true;
  try {
    while (pendingQueue.length > 0) {
      const job = pendingQueue.shift();
      job.status = 'printing';
      job.startedAt = Date.now();
      console.log(
        `[queue] print-start job=${job.id} pendingLeft=${pendingQueue.length} copies=${job.copies} file=${job.filename}`,
      );

      try {
        const zplToPrint = applyZplCopies(job.zpl, job.copies);
        const tempPath = path.join(os.tmpdir(), `ps-zebra-${crypto.randomUUID()}-${job.filename}`);

        await fs.writeFile(tempPath, zplToPrint, 'utf8');
        const result = await runPrintScript({
          filePath: tempPath,
          printerName: job.printerName || undefined,
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
        job.printer = result.printer || null;
        job.printed_bytes = result.printed_bytes ?? null;
        job.finishedAt = Date.now();
        console.log(
          `[queue] print-done job=${job.id} printer=${job.printer || '(default)'} ms=${job.finishedAt - job.startedAt}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        job.status = 'error';
        job.errorMessage = msg;
        job.finishedAt = Date.now();
        console.error(`[queue] print-error job=${job.id}`, msg);
        /* siguiente job en FIFO — no re-lanzamos */
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

/** Ajusta ^PQ para N copias (1..99). */
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
    ];
    if (printerName) {
      args.push('-PrinterName', printerName);
    }

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
