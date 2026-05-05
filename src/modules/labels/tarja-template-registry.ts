import type { TarjaLabelTemplate } from './tarja-zpl.types';

/** Metadatos de plantilla para el catálogo API / UI — ver `TARJA_TEMPLATE_REGISTRY`. */
export type TarjaTemplateMeta = {
  id: TarjaLabelTemplate;
  title: string;
  description: string;
};

/**
 * Catálogo de plantillas disponibles (`GET api/labels/templates`).
 * Para agregar una nueva plantilla: 1) añadir valor en `TARJA_LABEL_TEMPLATES` (`tarja-zpl.types.ts`),
 * 2) implementar builder en `zpl-tarja-*.ts` y rutear en `zpl-tarja.factory.ts`, 3) agregar entrada aquí.
 */
export const TARJA_TEMPLATE_REGISTRY: TarjaTemplateMeta[] = [
  {
    id: 'compact',
    title: 'Resumida',
    description: 'ID grande y código de barras dominante.',
  },
  {
    id: 'standard',
    title: 'Estándar',
    description: 'Cliente, formato, fecha, tipo y código.',
  },
  {
    id: 'detailed',
    title: 'Detallada',
    description: 'Más datos operativos con layout ordenado.',
  },
];
