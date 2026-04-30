import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatCount, formatLb } from '@/lib/number-format';
import { contentCard, filterInputClass, kpiFootnote, kpiLabel } from '@/lib/page-ui';
import { cn } from '@/lib/utils';

type ClientOption = { id: number; nombre: string };

/** Formatos activos del maestro (presentación). */
export type PresentationFormatOption = {
  format_code: string;
  descripcion?: string | null;
  net_weight_lb_per_box?: string | number | null;
  max_boxes_per_pallet?: number | null;
};

type Props = {
  /** Mismo total que «MP p/proceso» (recepción disponible para proceso / reparto). */
  mpTotalLb: number | null | undefined;
  mpPending?: boolean;
  commercialClients?: ClientOption[] | null;
  /** Formatos activos para armar combinaciones sin ensuciar la fila principal. */
  presentationFormats?: PresentationFormatOption[] | null;
  className?: string;
};

/** Acepta coma o punto decimal y miles tipo 12.500 / 1.234,5 en es-AR. */
function parseFlexibleNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const n = Number(t.replace(/\./g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) {
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  let x = t;
  const lastComma = x.lastIndexOf(',');
  const lastDot = x.lastIndexOf('.');
  if (lastComma > lastDot) {
    x = x.replace(/\./g, '').replace(',', '.');
  } else {
    x = x.replace(/,/g, '');
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parsePositive(s: string): number | null {
  const n = parseFlexibleNumber(s);
  if (n == null || n < 0) return null;
  return n;
}

function formatPalletsLabel(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) return formatCount(Math.round(n));
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

const JUSTO_EPS_LB = 0.02;

export function CommercialOfferCalculatorBlock({
  mpTotalLb,
  mpPending = false,
  commercialClients,
  presentationFormats,
  className,
}: Props) {
  const [cliente, setCliente] = useState('');
  const [selectedFormatCodes, setSelectedFormatCodes] = useState<string[]>([]);
  const [formatoManual, setFormatoManual] = useState('');
  const [formatPanelOpen, setFormatPanelOpen] = useState(false);
  const [pallets, setPallets] = useState('');
  const [cajasPorPallet, setCajasPorPallet] = useState('');
  const [lbPorCaja, setLbPorCaja] = useState('');
  const [rendPct, setRendPct] = useState('95');
  const [lbDisponiblesStr, setLbDisponiblesStr] = useState('');
  const [lbDisponiblesTouched, setLbDisponiblesTouched] = useState(false);
  const lastAutoSingleFormatRef = useRef('');

  useEffect(() => {
    if (lbDisponiblesTouched) return;
    if (mpPending) return;
    const v = mpTotalLb;
    if (v != null && Number.isFinite(v) && v > 0) {
      setLbDisponiblesStr(String(v));
    } else {
      setLbDisponiblesStr('');
    }
  }, [mpTotalLb, mpPending, lbDisponiblesTouched]);

  const sortedPresentationFormats = useMemo(() => {
    const list = presentationFormats ?? [];
    return [...list].sort((a, b) => a.format_code.localeCompare(b.format_code, 'es', { sensitivity: 'base' }));
  }, [presentationFormats]);

  const hasMasterFormats = sortedPresentationFormats.length > 0;

  const formatLabelForSummary = useMemo(() => {
    if (hasMasterFormats) {
      if (selectedFormatCodes.length === 0) return '';
      return selectedFormatCodes.join(' · ');
    }
    return formatoManual.trim();
  }, [hasMasterFormats, selectedFormatCodes, formatoManual]);

  /** Mismas fórmulas que antes; permite mostrar lb requeridas aunque falte lb disponibles. */
  const derived = useMemo(() => {
    const p = parsePositive(pallets);
    const cpp = parsePositive(cajasPorPallet);
    const lbc = parsePositive(lbPorCaja);
    const rPct = parsePositive(rendPct);
    const lbDisp = parsePositive(lbDisponiblesStr);

    const rendFactor = rPct != null && rPct > 0 ? rPct / 100 : null;

    const hasCore =
      p != null && cpp != null && lbc != null && rendFactor != null && rendFactor > 0;

    const cajasObjetivo = hasCore ? p * cpp : null;
    const lbFinales = hasCore ? p * cpp * lbc : null;
    const lbRequeridas = hasCore && lbFinales != null && rendFactor != null ? lbFinales / rendFactor : null;
    const balance = lbRequeridas != null && lbDisp != null ? lbDisp - lbRequeridas : null;

    const complete = hasCore && lbDisp != null;

    return {
      complete,
      cajasObjetivo,
      lbFinales,
      lbRequeridas,
      lbDisponibles: lbDisp,
      balance,
      rendPctUsed: rPct,
    };
  }, [pallets, cajasPorPallet, lbPorCaja, rendPct, lbDisponiblesStr]);

  const summaryText = useMemo(() => {
    if (!derived.complete || derived.lbRequeridas == null || derived.balance == null || derived.rendPctUsed == null) {
      return null;
    }
    const pl = parsePositive(pallets);
    const fmt = formatLabelForSummary.trim() || 'el formato indicado';
    const plLabel = pl != null ? formatPalletsLabel(pl) : pallets.trim() || '—';
    const req = formatLb(derived.lbRequeridas, 2);
    const disp = formatLb(derived.lbDisponibles ?? 0, 2);
    const pct = Math.round(derived.rendPctUsed);
    const delta = derived.balance;
    const absLb = formatLb(Math.abs(delta), 2);

    const head = `Para ofrecer ${plLabel} pallets de ${fmt} necesitás aprox. ${req} lb con rendimiento ${pct}%.`;
    if (delta > 0) {
      return `${head} Con ${disp} lb disponibles para reparto, sobran ${absLb} lb.`;
    }
    if (delta < 0) {
      return `${head} Con ${disp} lb disponibles para reparto, faltan ${absLb} lb.`;
    }
    return `${head} Con ${disp} lb disponibles para reparto, cerrás justo el balance.`;
  }, [derived, formatLabelForSummary, pallets]);

  /** Autocompletar cajas/pallet y lb/caja al elegir un solo formato (misma lógica que el botón anterior). */
  useEffect(() => {
    if (selectedFormatCodes.length !== 1) {
      lastAutoSingleFormatRef.current = '';
      return;
    }
    const code = selectedFormatCodes[0]!.trim();
    if (lastAutoSingleFormatRef.current === code) return;
    lastAutoSingleFormatRef.current = code;
    const f = sortedPresentationFormats.find((x) => x.format_code.trim() === code.trim());
    if (!f) return;
    if (f.max_boxes_per_pallet != null && Number.isFinite(Number(f.max_boxes_per_pallet))) {
      setCajasPorPallet(String(f.max_boxes_per_pallet));
    }
    const nw = f.net_weight_lb_per_box;
    if (nw != null && String(nw).trim() !== '') {
      const n = Number(nw);
      if (Number.isFinite(n) && n > 0) setLbPorCaja(String(n));
    }
  }, [selectedFormatCodes, sortedPresentationFormats]);

  const clientDatalistId = 'commercial-offer-client-names';

  function toggleFormatCode(canonical: string) {
    const k = canonical.trim().toLowerCase();
    setSelectedFormatCodes((prev) => {
      const i = prev.findIndex((c) => c.trim().toLowerCase() === k);
      if (i >= 0) return prev.filter((_, j) => j !== i);
      return [...prev, canonical.trim()];
    });
  }

  const parsedLbDisp = derived.lbDisponibles;
  const noRealMp =
    !mpPending && (mpTotalLb == null || !Number.isFinite(Number(mpTotalLb)) || Number(mpTotalLb) <= 0);
  const hasPositiveLb = parsedLbDisp != null && parsedLbDisp > 0;
  const lbIsZero = parsedLbDisp !== null && parsedLbDisp === 0;
  const planBlockedNoFruit =
    !mpPending && (lbIsZero || (noRealMp && !hasPositiveLb && !lbDisponiblesTouched));

  const decision = useMemo(() => {
    if (planBlockedNoFruit) {
      return {
        tone: 'blocked' as const,
        title: 'No hay fruta disponible para planificar oferta',
        detail: 'Usá «Detalle» para ingresar lb manualmente o esperá recepción.',
      };
    }
    if (derived.lbRequeridas == null) {
      return { tone: 'idle' as const, title: 'Elegí formato y pallets', detail: 'El rendimiento actualiza la proyección al instante.' };
    }
    if (derived.balance == null) {
      return {
        tone: 'partial' as const,
        title: `${formatLb(derived.lbRequeridas, 2)} lb requeridas`,
        detail: 'Indicá lb disponibles (o sincronizá con MP) para ver el balance.',
      };
    }
    const b = derived.balance;
    if (Math.abs(b) < JUSTO_EPS_LB) {
      return { tone: 'justo' as const, title: 'Estás justo', detail: 'Balance en cero con los datos actuales.' };
    }
    if (b > 0) {
      const pl = parsePositive(pallets);
      const plLabel = pl != null ? formatPalletsLabel(pl) : pallets.trim() || '—';
      return {
        tone: 'ok' as const,
        title: `Podés ofrecer ${plLabel} pallets`,
        detail: `Sobran ${formatLb(b, 2)} lb respecto de lo requerido.`,
      };
    }
    return {
      tone: 'short' as const,
      title: `Faltan ${formatLb(Math.abs(b), 2)} lb`,
      detail: 'No alcanza la fruta disponible para cubrir la oferta indicada.',
    };
  }, [derived.lbRequeridas, derived.balance, pallets, planBlockedNoFruit]);

  const heroShell = useMemo(() => {
    if (decision.tone === 'blocked') {
      return 'border-slate-200/90 bg-slate-100/80 text-slate-600';
    }
    if (decision.tone === 'idle' || decision.tone === 'partial') {
      return 'border-slate-200/90 bg-white text-slate-800';
    }
    if (decision.tone === 'ok') {
      return 'border-emerald-300/90 bg-emerald-50/90 text-emerald-950 shadow-sm shadow-emerald-900/5';
    }
    if (decision.tone === 'justo') {
      return 'border-amber-300/90 bg-amber-50/90 text-amber-950 shadow-sm';
    }
    return 'border-rose-300/90 bg-rose-50/90 text-rose-950 shadow-sm';
  }, [decision.tone]);

  return (
    <div
      className={cn(
        contentCard,
        'overflow-hidden border-indigo-200/50 px-0 py-0 shadow-md shadow-indigo-950/[0.04] sm:shadow-lg',
        className,
      )}
    >
      <div className="border-b border-indigo-100/80 bg-gradient-to-br from-indigo-50/90 via-white to-white px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-800/90">Oferta comercial</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Planificación rápida</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">Formato, pallets y rendimiento. No modifica Packed, En cámara ni Shipped.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 border-indigo-200/80 bg-white text-xs text-indigo-900 hover:bg-indigo-50/80"
            disabled={mpPending || mpTotalLb == null || !Number.isFinite(Number(mpTotalLb)) || Number(mpTotalLb) <= 0}
            onClick={() => {
              setLbDisponiblesTouched(false);
              const v = mpTotalLb;
              if (v != null && Number.isFinite(v) && v > 0) setLbDisponiblesStr(String(v));
            }}
          >
            Usar MP real
          </Button>
        </div>

        <div
          className={cn(
            'mt-4 rounded-2xl border-2 px-4 py-4 transition-colors sm:px-5 sm:py-5',
            heroShell,
            planBlockedNoFruit && 'pointer-events-none opacity-50',
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-current opacity-80">Resultado</p>
          <p className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{decision.title}</p>
          {decision.detail ? <p className="mt-2 text-sm font-medium opacity-90">{decision.detail}</p> : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div>
              <p className={kpiLabel}>lb requeridas</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {derived.lbRequeridas != null ? `${formatLb(derived.lbRequeridas, 2)} lb` : '—'}
              </p>
              <p className={kpiFootnote}>Finales ÷ rendimiento</p>
            </div>
            <div>
              <p className={kpiLabel}>lb disponibles</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {derived.lbDisponibles != null ? `${formatLb(derived.lbDisponibles, 2)} lb` : '—'}
              </p>
              <p className={kpiFootnote}>Para reparto</p>
            </div>
            <div>
              <p className={kpiLabel}>Balance</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
                {derived.balance == null
                  ? '—'
                  : derived.balance === 0
                    ? '0 lb'
                    : `${derived.balance < 0 ? '−' : '+'}${formatLb(Math.abs(derived.balance), 2)} lb`}
              </p>
              <p className={kpiFootnote}>Disponibles − requeridas</p>
            </div>
          </div>

          {derived.cajasObjetivo != null || derived.lbFinales != null ? (
            <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200/60 pt-4 text-sm text-slate-600">
              {derived.cajasObjetivo != null ? (
                <span>
                  <span className="font-semibold text-slate-800">{formatCount(Math.round(derived.cajasObjetivo))}</span> cajas
                  objetivo
                </span>
              ) : null}
              {derived.lbFinales != null ? (
                <span>
                  <span className="font-semibold text-slate-800">{formatLb(derived.lbFinales, 2)} lb</span> finales objetivo
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid min-w-0 gap-1.5 sm:col-span-1">
            <Label className="text-xs font-medium text-slate-600">Formato</Label>
            {hasMasterFormats ? (
              <div className="min-w-0">
                <button
                  type="button"
                  aria-expanded={formatPanelOpen}
                  onClick={() => setFormatPanelOpen((o) => !o)}
                  className={cn(
                    filterInputClass,
                    'flex h-auto min-h-11 w-full items-center justify-between gap-2 py-2.5 text-left text-sm font-medium shadow-sm',
                  )}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      selectedFormatCodes.length ? 'text-slate-900' : 'text-slate-400',
                    )}
                  >
                    {selectedFormatCodes.length === 0
                      ? 'Elegir del maestro…'
                      : selectedFormatCodes.length === 1
                        ? selectedFormatCodes[0]
                        : `Mix (${selectedFormatCodes.length})`}
                  </span>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', formatPanelOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>
                {formatPanelOpen ? (
                  <div className="mt-2 max-h-[min(14rem,38vh)] space-y-0.5 overflow-y-auto rounded-xl border border-slate-200/90 bg-slate-50/50 p-2">
                    {sortedPresentationFormats.map((f, i) => {
                      const code = f.format_code.trim();
                      const checked = selectedFormatCodes.some((c) => c.trim().toLowerCase() === code.toLowerCase());
                      return (
                        <label
                          key={`co-pf-${i}-${code}`}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-200"
                            checked={checked}
                            onChange={() => toggleFormatCode(f.format_code)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">{f.format_code}</span>
                            {f.descripcion?.trim() ? (
                              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{f.descripcion}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <Input
                id="co-formato"
                className={filterInputClass}
                placeholder="Ej. PINTA LOW PROFILE"
                value={formatoManual}
                onChange={(e) => setFormatoManual(e.target.value)}
              />
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-pallets" className="text-xs font-medium text-slate-600">
              Pallets solicitados
            </Label>
            <Input
              id="co-pallets"
              className={cn(filterInputClass, 'h-11 tabular-nums text-base font-semibold')}
              inputMode="decimal"
              placeholder="9"
              value={pallets}
              onChange={(e) => setPallets(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-rend" className="text-xs font-medium text-slate-600">
              Rendimiento (%)
            </Label>
            <Input
              id="co-rend"
              className={cn(filterInputClass, 'h-11 tabular-nums text-base font-semibold')}
              inputMode="decimal"
              placeholder="95"
              value={rendPct}
              onChange={(e) => setRendPct(e.target.value)}
            />
          </div>
        </div>

        <details className="group rounded-xl border border-slate-200/80 bg-slate-50/40 open:bg-slate-50/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
            <span>Detalle · MP, cliente y cajas/lb</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-4 border-t border-slate-200/60 px-3 pb-3 pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="co-lb-disp" className="text-xs text-slate-600">
                lb disponibles para reparto
              </Label>
              <Input
                id="co-lb-disp"
                className={cn(filterInputClass, 'tabular-nums')}
                inputMode="decimal"
                placeholder={mpPending ? 'Cargando…' : 'Ej. 12.500'}
                value={lbDisponiblesStr}
                onChange={(e) => {
                  setLbDisponiblesTouched(true);
                  setLbDisponiblesStr(e.target.value);
                }}
              />
              <p className="text-[11px] text-slate-500">Editable para simular otro escenario.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-cliente" className="text-xs text-slate-600">
                Cliente (opcional)
              </Label>
              <Input
                id="co-cliente"
                className={filterInputClass}
                placeholder="Referencia rápida"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                list={commercialClients?.length ? clientDatalistId : undefined}
              />
              {commercialClients?.length ? (
                <datalist id={clientDatalistId}>
                  {(commercialClients ?? []).map((c) => (
                    <option key={c.id} value={c.nombre} />
                  ))}
                </datalist>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="co-cpp" className="text-xs text-slate-600">
                  Cajas por pallet
                </Label>
                <Input
                  id="co-cpp"
                  className={cn(filterInputClass, 'tabular-nums')}
                  inputMode="numeric"
                  placeholder="Maestro o manual"
                  value={cajasPorPallet}
                  onChange={(e) => setCajasPorPallet(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="co-lb" className="text-xs text-slate-600">
                  lb por caja
                </Label>
                <Input
                  id="co-lb"
                  className={cn(filterInputClass, 'tabular-nums')}
                  inputMode="decimal"
                  placeholder="Maestro o manual"
                  value={lbPorCaja}
                  onChange={(e) => setLbPorCaja(e.target.value)}
                />
              </div>
            </div>
            {selectedFormatCodes.length > 1 ? (
              <p className="text-[11px] text-slate-500">Varios formatos: ajustá cajas/pallet y lb/caja según el mix.</p>
            ) : null}
          </div>
        </details>

        {summaryText ? (
          <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            {summaryText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
