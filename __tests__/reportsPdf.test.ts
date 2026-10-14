import { PDFDocument } from 'pdf-lib';
import { buildReports } from '../src/storage/reports';
import { buildReportsPdf, pdfText } from '../src/reports/reportsPdf';
import { buildSections, tabsFor } from '../src/reports/reportSections';
import type { Session, Season } from '../src/storage/types';

const session = (id: string, day: number, a: number, b: number): Session => ({
  id,
  name: `Partida ${id}`,
  createdAt: `2026-01-0${day}T21:00:00.000Z`,
  closedAt: `2026-01-0${day}T23:00:00.000Z`,
  status: 'closed',
  seasonId: 's1',
  participants: [
    { playerId: 'a', name: 'Ana', buys: [{ amount: 1000, timestamp: `2026-01-0${day}T21:00:00.000Z` }], finalAmount: a },
    { playerId: 'b', name: 'Beto', buys: [{ amount: 1000, timestamp: `2026-01-0${day}T21:00:00.000Z` }], finalAmount: b },
  ],
});

const seasons: Season[] = [
  { id: 's1', name: 'Temporada 1', createdAt: '2026-01-01T00:00:00.000Z', closedAt: null, status: 'active' },
];
const reports = buildReports([session('1', 1, 0, 2000), session('2', 2, 1500, 500)], [], seasons);

describe('reportsPdf', () => {
  test('pdfText saca emojis y reemplaza flechas', () => {
    expect(pdfText('🔥 3')).toBe('3');
    expect(pdfText('Ana → Beto')).toBe('Ana -> Beto');
    expect(pdfText('Récord · ±$1.000')).toBe('Récord · ±$1.000');
  });

  test('genera un PDF válido con todas las secciones', async () => {
    const base64 = await buildReportsPdf(reports);
    const doc = await PDFDocument.load(base64);
    expect(doc.getPageCount()).toBeGreaterThan(0);
    expect(doc.getTitle()).toBe('PokerControl — Reportes históricos');
  });

  test('con temporada no incluye la pestaña de temporadas', async () => {
    expect(tabsFor('s1').map(t => t.key)).not.toContain('temporadas');
    const base64 = await buildReportsPdf(reports, 's1', 'Temporada 1');
    const doc = await PDFDocument.load(base64);
    expect(doc.getTitle()).toBe('PokerControl — Reportes · Temporada 1');
  });

  test('las filas de jugadores no navegan; solo las de partidas', () => {
    const compras = buildSections('compras', reports);
    const rows = compras.flatMap(s => (s.kind === 'ranked' ? s.rows : []));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.sessionId === undefined)).toBe(true);

    const partidas = buildSections('partidas', reports);
    const pots = partidas.find(s => s.kind === 'ranked' && s.title === 'Pozos más grandes');
    expect(pots?.kind === 'ranked' && pots.rows[0].sessionId).toBeTruthy();
  });
});
