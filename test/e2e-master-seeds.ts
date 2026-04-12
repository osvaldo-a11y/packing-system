import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Debe cumplir `FORMAT_CODE_RE` en TraceabilityService: /^(\d+)x(\d+)oz$/i (solo NxMoz).
 * También @MaxLength(20) en CreatePresentationFormatDto.
 */
export function e2eUniqueFormatCode(boxes: number): string {
  const ozPart = (Date.now() % 9000) + 100;
  return `${boxes}x${ozPart}oz`;
}

export async function ensureDocumentStateMercadoRecType(
  supervisorToken: string,
  server: ReturnType<INestApplication['getHttpServer']>,
) {
  const docStates = await request(server).get('/api/masters/document-states').set('Authorization', `Bearer ${supervisorToken}`).expect(200);
  if (!(docStates.body as { codigo: string }[]).some((x) => x.codigo === 'borrador')) {
    await request(server).post('/api/masters/document-states').set('Authorization', `Bearer ${supervisorToken}`).send({ codigo: 'borrador', nombre: 'Borrador' }).expect(201);
  }
  const recTypes = await request(server).get('/api/masters/reception-types').set('Authorization', `Bearer ${supervisorToken}`).expect(200);
  if (!(recTypes.body as { codigo: string }[]).some((x) => x.codigo === 'hand_picking')) {
    await request(server).post('/api/masters/reception-types').set('Authorization', `Bearer ${supervisorToken}`).send({ codigo: 'hand_picking', nombre: 'Mano' }).expect(201);
  }
  const mercados = await request(server).get('/api/masters/mercados').set('Authorization', `Bearer ${supervisorToken}`).expect(200);
  if (!(mercados.body as { codigo: string }[]).some((x) => x.codigo === 'USA')) {
    await request(server).post('/api/masters/mercados').set('Authorization', `Bearer ${supervisorToken}`).send({ codigo: 'USA', nombre: 'USA' }).expect(201);
  }
}

export async function seedMaterialCategories(
  supervisorToken: string,
  server: ReturnType<INestApplication['getHttpServer']>,
) {
  const matCatsRes = await request(server).get('/api/masters/material-categories').set('Authorization', `Bearer ${supervisorToken}`).expect(200);
  const existing = new Set((matCatsRes.body as { codigo: string }[]).map((c) => c.codigo));
  const seeds: Array<[string, string]> = [
    ['clamshell', 'Clamshell'],
    ['tape', 'Tape'],
    ['corner_board', 'Corner board'],
    ['etiqueta', 'Etiqueta'],
  ];
  for (const [codigo, nombre] of seeds) {
    if (!existing.has(codigo)) {
      await request(server).post('/api/masters/material-categories').set('Authorization', `Bearer ${supervisorToken}`).send({ codigo, nombre }).expect(201);
    }
  }
}

export async function matCatId(
  supervisorToken: string,
  server: ReturnType<INestApplication['getHttpServer']>,
  codigo: string,
) {
  const matCatsRes = await request(server).get('/api/masters/material-categories').set('Authorization', `Bearer ${supervisorToken}`).expect(200);
  return (matCatsRes.body as { id: number; codigo: string }[]).find((c) => c.codigo === codigo)!.id;
}
