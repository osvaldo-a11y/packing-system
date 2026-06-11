export type ExportLang = 'es' | 'en';

export function resolveExportLang(lang?: string, acceptLanguage?: string): ExportLang {
  const q = lang?.trim().toLowerCase();
  if (q === 'en' || q === 'es') return q;
  const al = acceptLanguage?.toLowerCase() ?? '';
  if (al.includes('en') && !al.startsWith('es')) return 'en';
  return 'es';
}

type SeasonExportText = {
  sheets: Record<string, string>;
  cols: Record<string, string>;
  info: {
    disclaimer: string;
    season: string;
    generated: string;
    sourceLive: string;
    sourceSnapshot: string;
    sourceLegacy: string;
    packFeeSnapshotNote: string;
  };
  notes: {
    noReceptionLines: string;
    noProcessLines: string;
    noSalesLines: string;
    noDispatchLines: string;
  };
  quality: Record<string, string>;
  fruitType: Record<string, string>;
  pdf: {
    title: string;
    subtitle: string;
    summarySection: string;
    footer: string;
    pageFooter: string;
    historicalNote: string;
    seasonLabel: string;
    sourceLabel: string;
    generatedLabel: string;
    totalReturn: string;
    total: string;
  };
  filenames: { fullXlsx: string; summaryPdf: string; settlementXlsx: string; massXlsx: string };
};

const TEXT: Record<ExportLang, SeasonExportText> = {
  es: {
    sheets: {
      info: 'Info',
      summary: 'Resumen',
      reception: 'Recepción',
      processes: 'Procesos',
      sales: 'Ventas',
      dispatches: 'Despachos',
    },
    cols: {
      producer: 'Productor',
      sales: 'Ventas',
      material: 'Material',
      packFee: 'Pack fee / servicio',
      growerReturn: 'Retorno a productor',
      boxes: 'Cajas',
      pounds: 'Libras',
      lbReceived: 'Lb recibido',
      lbProcessed: 'Lb procesado',
      packout: 'Packout',
      waste: 'Merma',
      pctPackout: '% Packout',
      rejected: 'Rechazo',
      forFrozen: 'For frozen',
      date: 'Fecha',
      variety: 'Variedad',
      quality: 'Calidad',
      incoming: 'Incoming',
      trays: 'Bandejas',
      quantity: 'Cantidad',
      netLb: 'Net lb',
      grossLb: 'Gross lb',
      fruitType: 'Tipo fruta',
      op: 'OP',
      format: 'Formato',
      lbTotal: 'Lb total',
      lbPackout: 'Lb packout',
      lbWaste: 'Lb merma',
      brand: 'Marca',
      unitPrice: 'Precio unit.',
      revenue: 'Revenue',
      bol: 'BOL',
      producers: 'Productor(es)',
    },
    info: {
      disclaimer: 'Registro histórico — NO es una re-liquidación',
      season: 'Temporada',
      generated: 'Emitido',
      sourceLive: 'Fuente: operación en vivo (misma lógica que Cierre)',
      sourceSnapshot: 'Fuente: snapshot firmado',
      sourceLegacy: 'Fuente: capa legacy importada (Final Charge / balance físico)',
      packFeeSnapshotNote:
        'Pack fee / servicio = packing base + recargo formato + procesamiento máquina (total_packing del snapshot).',
    },
    notes: {
      noReceptionLines:
        'Sin líneas de recepción en esta temporada. Al cerrar 2026 se volcarán las líneas físicas al histórico.',
      noProcessLines:
        'Sin líneas de procesos en esta temporada. Al cerrar 2026 se volcarán las líneas físicas al histórico.',
      noSalesLines: 'Sin líneas comerciales en la capa legacy; el resumen proviene del snapshot firmado.',
      noDispatchLines: 'Sin líneas para agrupar despachos.',
    },
    quality: { FRESH: 'Fresh berries', WASTE: 'Waste', FOR_FROZEN: 'For frozen' },
    fruitType: { hand: 'Mano', machine: 'Máquina' },
    pdf: {
      title: 'REGISTRO HISTÓRICO DE TEMPORADA',
      subtitle: 'Resumen comercial y físico — no es re-liquidación',
      summarySection: 'Resumen por productor',
      footer:
        'Documento histórico de referencia. No sustituye la liquidación operativa ni incluye desglose de costos en vivo.',
      pageFooter: 'Registro histórico temporada',
      historicalNote:
        'Registro histórico de lo cerrado o importado. NO es una re-liquidación ni recalcula costos operativos.',
      seasonLabel: 'Temporada',
      sourceLabel: 'Fuente',
      generatedLabel: 'Fecha de generación',
      totalReturn: 'Retorno total a productor',
      total: 'TOTAL',
    },
    filenames: {
      fullXlsx: 'temporada-completa',
      summaryPdf: 'resumen-temporada',
      settlementXlsx: 'liquidacion-historica',
      massXlsx: 'balance-masas-historico',
    },
  },
  en: {
    sheets: {
      info: 'Info',
      summary: 'Summary',
      reception: 'Reception',
      processes: 'Processes',
      sales: 'Sales',
      dispatches: 'Dispatches',
    },
    cols: {
      producer: 'Producer',
      sales: 'Sales',
      material: 'Material',
      packFee: 'Pack fee / service fee',
      growerReturn: 'Grower return',
      boxes: 'Boxes',
      pounds: 'Pounds',
      lbReceived: 'Lb received',
      lbProcessed: 'Lb processed',
      packout: 'Packout',
      waste: 'Waste',
      pctPackout: '% Packout',
      rejected: 'Rejected',
      forFrozen: 'For frozen',
      date: 'Date',
      variety: 'Variety',
      quality: 'Quality',
      incoming: 'Incoming',
      trays: 'Trays',
      quantity: 'Quantity',
      netLb: 'Net lb',
      grossLb: 'Gross lb',
      fruitType: 'Fruit type',
      op: 'OP',
      format: 'Format',
      lbTotal: 'Total lb',
      lbPackout: 'Packout lb',
      lbWaste: 'Waste lb',
      brand: 'Brand',
      unitPrice: 'Unit price',
      revenue: 'Revenue',
      bol: 'BOL',
      producers: 'Producer(s)',
    },
    info: {
      disclaimer: 'Historical record — NOT a re-settlement',
      season: 'Season',
      generated: 'Generated',
      sourceLive: 'Source: live operations (same logic as Close)',
      sourceSnapshot: 'Source: signed snapshot',
      sourceLegacy: 'Source: imported legacy layer (Final Charge / physical balance)',
      packFeeSnapshotNote:
        'Pack fee / service fee = packing base + format surcharge + machine processing (snapshot total_packing).',
    },
    notes: {
      noReceptionLines:
        'No reception lines for this season. Physical lines will be archived when 2026 is closed.',
      noProcessLines:
        'No process lines for this season. Physical lines will be archived when 2026 is closed.',
      noSalesLines: 'No commercial lines in legacy layer; summary comes from signed snapshot.',
      noDispatchLines: 'No lines to group dispatches.',
    },
    quality: { FRESH: 'Fresh berries', WASTE: 'Waste', FOR_FROZEN: 'For frozen' },
    fruitType: { hand: 'Hand', machine: 'Machine' },
    pdf: {
      title: 'SEASON HISTORICAL RECORD',
      subtitle: 'Commercial and physical summary — not a re-settlement',
      summarySection: 'Producer summary',
      footer:
        'Historical reference document. Does not replace live settlement or include live cost breakdown.',
      pageFooter: 'Season historical record',
      historicalNote:
        'Historical record of closed or imported data. NOT a re-settlement and does not recalculate live costs.',
      seasonLabel: 'Season',
      sourceLabel: 'Source',
      generatedLabel: 'Generated',
      totalReturn: 'Total grower return',
      total: 'TOTAL',
    },
    filenames: {
      fullXlsx: 'season-full',
      summaryPdf: 'season-summary',
      settlementXlsx: 'historical-settlement',
      massXlsx: 'historical-mass-balance',
    },
  },
};

export function seasonExportText(lang: ExportLang): SeasonExportText {
  return TEXT[lang];
}
