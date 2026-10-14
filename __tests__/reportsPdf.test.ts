import { PDFDocument, StandardFonts } from 'pdf-lib';
import { buildReports } from '../src/storage/reports';
import { buildReportsPdf, pdfText, Writer, writeSection, sectionHeight } from '../src/reports/reportsPdf';
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

describe('reportsPdf — saltos de página', () => {
  async function newWriter() {
    const doc = await PDFDocument.create();
    const fonts = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    return { doc, w: new Writer(doc, fonts, 'pie') };
  }

  // Muchos jugadores y partidas para que haya listas largas ("y N más").
  const names = Array.from({ length: 20 }, (_, i) => `J${i}`);
  const many: Session[] = Array.from({ length: 25 }, (_, k) => ({
    id: `m${k}`,
    name: `Partida ${k}`,
    createdAt: `2026-0${1 + (k % 9)}-1${k % 9}T21:00:00.000Z`,
    closedAt: `2026-0${1 + (k % 9)}-1${k % 9}T23:30:00.000Z`,
    status: 'closed',
    seasonId: 's1',
    participants: names.map((n, i) => ({
      playerId: n,
      name: n,
      buys: Array.from({ length: 1 + ((i + k) % 3) }, (__, b) => ({
        amount: 1000, timestamp: `2026-0${1 + (k % 9)}-1${k % 9}T2${b}:00:00.000Z`,
      })),
      finalAmount: i === 0 ? 0 : (1 + ((i + k) % 3)) * 1000 + (i % 2 === 0 ? 500 : -500),
    })),
  }));
  const big = buildReports(many, [], seasons);

  test('cada sección ocupa exactamente lo que se mide (así nunca se corta)', async () => {
    for (const tab of tabsFor()) {
      for (const section of buildSections(tab.key, big)) {
        const { doc, w } = await newWriter();
        const before = w.y;
        writeSection(w, section);
        expect(doc.getPageCount()).toBe(1);
        expect(before - w.y).toBe(sectionHeight(w, section));
      }
    }
  });

  test('cada categoría empieza en una página nueva', async () => {
    const base64 = await buildReportsPdf(big);
    const doc = await PDFDocument.load(base64);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(tabsFor().length);
  });
});
