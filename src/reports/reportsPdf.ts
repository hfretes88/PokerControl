/**
 * reportsPdf.ts — exporta los reportes a PDF con pdf-lib (JS puro, sin
 * módulo nativo). Recorre las mismas secciones que muestra ReportsScreen.
 *
 * Las fuentes estándar de PDF solo cubren WinAnsi (latín + acentos), así que
 * los emojis se descartan y las flechas se reemplazan antes de escribir.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { formatMoney } from '../components/UI';
import type { Reports } from '../storage/reports';
import { buildSections, tabsFor, decimal, signed, plural } from './reportSections';
import type { ReportSection, ReportRow, Tone } from './reportSections';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Filas por sección en el PDF; el resto se resume en "y N más". */
const MAX_ROWS = 15;

const INK = rgb(0.1, 0.13, 0.2);
const GRAY = rgb(0.42, 0.47, 0.56);
const LINE = rgb(0.86, 0.89, 0.93);
const ACCENT = rgb(0.12, 0.44, 0.77);
const GREEN = rgb(0.12, 0.56, 0.31);
const RED = rgb(0.8, 0.22, 0.17);
const BAR_BG = rgb(0.92, 0.95, 0.98);

function toneColor(tone?: Tone): RGB {
  return tone === 'positive' ? GREEN : tone === 'negative' ? RED : ACCENT;
}

/** Deja solo lo que se puede escribir con las fuentes estándar (WinAnsi). */
export function pdfText(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Cursor de escritura: maneja el salto de página automáticamente. */
class Writer {
  page: PDFPage;
  y = PAGE_H - MARGIN;

  constructor(private doc: PDFDocument, private fonts: Fonts, private footer: string) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(this.footer, { x: MARGIN, y: MARGIN / 2, size: 8, font: this.fonts.regular, color: GRAY });
    return page;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.addPage();
      this.y = PAGE_H - MARGIN;
    }
  }

  fit(text: string, size: number, maxWidth: number, bold = false): string {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    let t = pdfText(text);
    if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
    return `${t}...`;
  }

  text(text: string, opts: { x?: number; size: number; bold?: boolean; color?: RGB; maxWidth?: number; alignRight?: boolean }) {
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const maxWidth = opts.maxWidth ?? CONTENT_W;
    const t = this.fit(text, opts.size, maxWidth, opts.bold);
    const x = opts.alignRight
      ? (opts.x ?? PAGE_W - MARGIN) - font.widthOfTextAtSize(t, opts.size)
      : (opts.x ?? MARGIN);
    this.page.drawText(t, { x, y: this.y, size: opts.size, font, color: opts.color ?? INK });
  }

  /** Párrafo con salto de línea por palabras. */
  paragraph(text: string, size: number, color: RGB) {
    const words = pdfText(text).split(' ');
    let line = '';
    const flush = () => {
      this.ensure(size + 4);
      this.y -= size + 3;
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.fonts.regular, color });
      line = '';
    };
    words.forEach(w => {
      const next = line ? `${line} ${w}` : w;
      if (this.fonts.regular.widthOfTextAtSize(next, size) > CONTENT_W && line) flush();
      line = line ? `${line} ${w}` : w;
    });
    if (line) flush();
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.5, color: LINE,
    });
  }
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function writeRanked(w: Writer, section: Extract<ReportSection, { kind: 'ranked' }>) {
  w.ensure(60);
  w.y -= 16;
  w.text(section.title, { size: 12, bold: true });
  if (section.subtitle) {
    w.y -= 13;
    w.text(section.subtitle, { size: 8.5, color: GRAY });
  }
  w.y -= 6;

  if (section.rows.length === 0) {
    w.y -= 13;
    w.text(section.empty ?? 'Sin datos todavía', { size: 9, color: GRAY });
    return;
  }

  section.rows.slice(0, MAX_ROWS).forEach((row: ReportRow, idx: number) => {
    w.ensure(20);
    w.y -= 15;
    w.text(String(idx + 1), { size: 9, color: GRAY });
    const valueWidth = 110;
    w.text(row.value, { size: 10, bold: true, color: toneColor(row.tone), alignRight: true, maxWidth: valueWidth });
    const nameWidth = row.detail ? 150 : CONTENT_W - valueWidth - 30;
    w.text(row.name, { x: MARGIN + 18, size: 10, bold: true, maxWidth: nameWidth });
    if (row.detail) {
      w.text(row.detail, { x: MARGIN + 18 + 158, size: 8.5, color: GRAY, maxWidth: CONTENT_W - 18 - 158 - valueWidth - 8 });
    }
    w.y -= 5;
    w.rule();
  });

  if (section.rows.length > MAX_ROWS) {
    w.y -= 12;
    w.text(`y ${section.rows.length - MAX_ROWS} más`, { x: MARGIN + 18, size: 8.5, color: GRAY });
  }
}

function writeStats(w: Writer, section: Extract<ReportSection, { kind: 'stats' }>) {
  w.ensure(44);
  w.y -= 22;
  const colW = CONTENT_W / section.stats.length;
  section.stats.forEach((s, i) => {
    w.text(s.value, { x: MARGIN + colW * i, size: 15, bold: true, color: s.tone ? toneColor(s.tone) : INK, maxWidth: colW - 8 });
  });
  w.y -= 13;
  section.stats.forEach((s, i) => {
    w.text(s.label, { x: MARGIN + colW * i, size: 8.5, color: GRAY, maxWidth: colW - 8 });
  });
  if (section.note) {
    w.y -= 14;
    w.text(section.note, { size: 9, color: GRAY });
  }
}

function writeBars(w: Writer, section: Extract<ReportSection, { kind: 'bars' }>) {
  if (section.buckets.length === 0) return;
  // Título + al menos 3 barras juntos, para no dejar el título solo al pie.
  w.ensure(30 + 13 * Math.min(3, section.buckets.length));
  w.y -= 16;
  w.text(section.title, { size: 12, bold: true });
  w.y -= 4;
  const max = Math.max(...section.buckets.map(b => b.count));
  const labelW = 80;
  const trackW = CONTENT_W - labelW - 40;
  section.buckets.forEach(b => {
    w.ensure(16);
    w.y -= 13;
    w.text(b.label, { size: 8.5, color: GRAY, maxWidth: labelW - 6 });
    w.page.drawRectangle({ x: MARGIN + labelW, y: w.y, width: trackW, height: 7, color: BAR_BG });
    w.page.drawRectangle({ x: MARGIN + labelW, y: w.y, width: Math.max(2, (b.count / max) * trackW), height: 7, color: ACCENT });
    w.text(String(b.count), { size: 8.5, bold: true, alignRight: true, maxWidth: 30 });
  });
}

function writeSeasons(w: Writer, section: Extract<ReportSection, { kind: 'seasons' }>) {
  section.seasons.forEach(s => {
    w.ensure(52);
    w.y -= 16;
    w.text(`${s.name}${s.status === 'active' ? ' (activa)' : ''}`, { size: 12, bold: true });
    w.y -= 14;
    if (s.champion) {
      w.text(`Campeón: ${s.champion.name}`, { size: 10, bold: true, maxWidth: CONTENT_W - 120 });
      w.text(signed(s.champion.balance), {
        size: 10, bold: true, alignRight: true, maxWidth: 110,
        color: s.champion.balance >= 0 ? GREEN : RED,
      });
    } else {
      w.text('Sin partidas cerradas', { size: 9, color: GRAY });
    }
    w.y -= 13;
    w.text(
      `${plural(s.sessions, 'partida', 'partidas')} · pozo total ${formatMoney(s.totalPot)} · ${decimal(s.avgPlayers)} jugadores por partida`,
      { size: 8.5, color: GRAY },
    );
    w.y -= 6;
    w.rule();
  });
}

// ─── Documento ────────────────────────────────────────────────────────────────

export async function buildReportsPdf(reports: Reports, seasonId?: string, seasonName?: string): Promise<string> {
  const doc = await PDFDocument.create();
  const title = seasonName ? `Reportes · ${seasonName}` : 'Reportes históricos';
  const generated = new Date().toLocaleDateString('es-AR');
  doc.setTitle(`PokerControl — ${title}`);
  doc.setCreator('PokerControl');

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const w = new Writer(doc, fonts, pdfText(`PokerControl · ${title} · generado el ${generated}`));

  w.y -= 18;
  w.text('PokerControl', { size: 22, bold: true, color: ACCENT });
  w.y -= 20;
  w.text(title, { size: 14, bold: true });
  w.y -= 14;
  w.text(`${plural(reports.totalSessions, 'partida cerrada', 'partidas cerradas')} · generado el ${generated}`, { size: 9, color: GRAY });

  tabsFor(seasonId).forEach(tab => {
    w.ensure(80);
    w.y -= 30;
    w.text(tab.label.toUpperCase(), { size: 13, bold: true, color: ACCENT });
    w.y -= 6;
    w.page.drawLine({
      start: { x: MARGIN, y: w.y }, end: { x: PAGE_W - MARGIN, y: w.y },
      thickness: 1.2, color: ACCENT,
    });

    buildSections(tab.key, reports, seasonId).forEach(section => {
      switch (section.kind) {
        case 'ranked': writeRanked(w, section); break;
        case 'stats': writeStats(w, section); break;
        case 'bars': writeBars(w, section); break;
        case 'seasons': writeSeasons(w, section); break;
        case 'note': w.y -= 4; w.paragraph(section.text, 8.5, GRAY); break;
      }
    });
  });

  return doc.saveAsBase64();
}
