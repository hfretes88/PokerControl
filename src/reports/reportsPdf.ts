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
import { chartColors, divergingColor, hexToRgb, seriesColor } from '../theme/chartColors';
import { niceTicks, shortMoney } from '../components/charts/scale';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Filas por sección en el PDF; el resto se resume en "y N más". */
const MAX_ROWS = 15;

// Alturas de cada bloque. Se usan tanto para dibujar como para medir una
// sección antes de escribirla, así nunca queda cortada entre dos páginas.
const SECTION_GAP = 22;
const TITLE_H = 16;
const SUBTITLE_H = 13;
const HEAD_PAD = 6;
const ROW_H = 20;
const EMPTY_H = 15;
const MORE_H = 14;
const BAR_H = 15;
const STATS_H = 35;
const STATS_NOTE_H = 14;
const SEASON_H = 49;
const NOTE_SIZE = 8.5;
const NOTE_LINE_H = NOTE_SIZE + 3;
const RACE_PLOT_H = 170;
const RACE_AXIS_H = 14;
const LEGEND_ROW_H = 14;
const HEAT_CELL = 11;
const HEAT_GAP = 1.5;
const HEAT_LEGEND_H = 18;
const SHARE_BAR_H = 26;
const AWARD_H = 44;

/** Los gráficos del PDF usan la paleta clara (se imprime sobre blanco). */
const CHART = chartColors(false);

function hexColor(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
}

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

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Cursor de escritura: maneja el salto de página automáticamente. */
export class Writer {
  page: PDFPage;
  y = PAGE_H - MARGIN;

  constructor(private doc: PDFDocument, readonly fonts: Fonts, private footer: string) {
    this.page = this.addPage();
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(this.footer, { x: MARGIN, y: MARGIN / 2, size: 8, font: this.fonts.regular, color: GRAY });
    return page;
  }

  newPage() {
    this.page = this.addPage();
    this.y = PAGE_H - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  /**
   * Reserva lugar para un bloque que no se debe partir: si no entra junto con
   * el espacio de separación, empieza en una página nueva (sin separación arriba).
   */
  startBlock(height: number, gap = SECTION_GAP) {
    if (this.y - gap - height < MARGIN) this.newPage();
    else this.y -= gap;
  }

  /** Corta un texto en líneas que entren en el ancho del contenido. */
  wrap(text: string, size: number): string[] {
    const lines: string[] = [];
    let line = '';
    pdfText(text).split(' ').forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && this.fonts.regular.widthOfTextAtSize(next, size) > CONTENT_W) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
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
    this.wrap(text, size).forEach(line => {
      this.ensure(size + 4);
      this.y -= size + 3;
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.fonts.regular, color });
    });
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
  w.y -= TITLE_H;
  w.text(section.title, { size: 12, bold: true });
  if (section.subtitle) {
    w.y -= SUBTITLE_H;
    w.text(section.subtitle, { size: 8.5, color: GRAY });
  }
  w.y -= HEAD_PAD;

  if (section.rows.length === 0) {
    w.y -= EMPTY_H;
    w.text(section.empty ?? 'Sin datos todavía', { size: 9, color: GRAY });
    return;
  }

  section.rows.slice(0, MAX_ROWS).forEach((row: ReportRow, idx: number) => {
    w.ensure(ROW_H);
    w.y -= ROW_H - 5;
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
    w.y -= MORE_H;
    w.text(`y ${section.rows.length - MAX_ROWS} más`, { x: MARGIN + 18, size: 8.5, color: GRAY });
  }
}

function writeStats(w: Writer, section: Extract<ReportSection, { kind: 'stats' }>) {
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
    w.y -= STATS_NOTE_H;
    w.text(section.note, { size: 9, color: GRAY });
  }
}

function writeHeading(w: Writer, title: string, subtitle?: string) {
  w.y -= TITLE_H;
  w.text(title, { size: 12, bold: true });
  if (subtitle) {
    w.y -= SUBTITLE_H;
    w.text(subtitle, { size: 8.5, color: GRAY });
  }
  w.y -= HEAD_PAD;
}

const headingHeight = (subtitle?: string) => TITLE_H + (subtitle ? SUBTITLE_H : 0) + HEAD_PAD;

/** Saca la indicación de tocar el gráfico, que en papel no aplica. */
const printable = (subtitle: string) => subtitle.replace(/\s*·\s*tocá.*$/, '');

function writeRace(w: Writer, section: Extract<ReportSection, { kind: 'race' }>) {
  const { race } = section;
  writeHeading(w, section.title, printable(section.subtitle));
  const n = race.sessions.length;
  const all = race.players.flatMap(p => race.cumulative[p.playerId]);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const left = MARGIN + 34;
  const plotW = CONTENT_W - 34;
  const top = w.y;
  const points = n === 1 ? 2 : n;
  const toX = (i: number) => left + (i / Math.max(1, points - 1)) * plotW;
  const toY = (v: number) => top - (1 - (v - yMin) / (yMax - yMin || 1)) * RACE_PLOT_H;

  ticks.forEach(t => {
    w.page.drawLine({
      start: { x: left, y: toY(t) }, end: { x: left + plotW, y: toY(t) },
      thickness: t === 0 ? 0.9 : 0.4, color: t === 0 ? GRAY : LINE,
    });
    const label = shortMoney(t);
    w.page.drawText(label, {
      x: left - 4 - w.fonts.regular.widthOfTextAtSize(label, 7.5), y: toY(t) - 2.5,
      size: 7.5, font: w.fonts.regular, color: GRAY,
    });
  });
  race.players.forEach(p => {
    const values = n === 1 ? [0, ...race.cumulative[p.playerId]] : race.cumulative[p.playerId];
    const color = hexColor(seriesColor(CHART, p.slot));
    for (let i = 1; i < values.length; i++) {
      w.page.drawLine({
        start: { x: toX(i - 1), y: toY(values[i - 1]) }, end: { x: toX(i), y: toY(values[i]) },
        thickness: 1.6, color,
      });
    }
  });

  w.y = top - RACE_PLOT_H - RACE_AXIS_H + 3;
  w.text(race.sessions[0].sessionName, { x: left, size: 7.5, color: GRAY, maxWidth: plotW / 2 - 4 });
  if (n > 1) w.text(race.sessions[n - 1].sessionName, { size: 7.5, color: GRAY, alignRight: true, maxWidth: plotW / 2 - 4 });
  w.y -= 3;

  race.players.forEach(p => {
    w.y -= LEGEND_ROW_H;
    w.page.drawRectangle({ x: MARGIN, y: w.y + 1, width: 12, height: 4, color: hexColor(seriesColor(CHART, p.slot)) });
    w.text(p.name, { x: MARGIN + 18, size: 9, bold: true, maxWidth: 200 });
    w.text(signed(p.final), { size: 9, bold: true, alignRight: true, maxWidth: 110, color: p.final >= 0 ? GREEN : RED });
  });
}

function raceHeight(section: Extract<ReportSection, { kind: 'race' }>) {
  return headingHeight(section.subtitle) + RACE_PLOT_H + RACE_AXIS_H + section.race.players.length * LEGEND_ROW_H;
}

function writeHeatmap(w: Writer, section: Extract<ReportSection, { kind: 'heatmap' }>) {
  const { race } = section;
  writeHeading(w, section.title, printable(section.subtitle));
  const nameW = 70;
  // Si hay muchas partidas se achican las celdas para que entren en el ancho.
  const cols = race.sessions.length;
  const cell = Math.min(HEAT_CELL, (CONTENT_W - nameW) / Math.max(1, cols) - HEAT_GAP);
  const maxAbs = Math.max(0, ...race.players.flatMap(p => race.nights[p.playerId].map(v => Math.abs(v ?? 0))));

  race.players.forEach(p => {
    w.y -= HEAT_CELL + HEAT_GAP;
    w.text(p.name, { size: 8.5, bold: true, color: GRAY, maxWidth: nameW - 6 });
    race.nights[p.playerId].forEach((v, i) => {
      const x = MARGIN + nameW + i * (cell + HEAT_GAP);
      if (v === null) {
        w.page.drawRectangle({ x, y: w.y - 2, width: cell, height: HEAT_CELL, borderColor: LINE, borderWidth: 0.6 });
      } else {
        w.page.drawRectangle({ x, y: w.y - 2, width: cell, height: HEAT_CELL, color: hexColor(divergingColor(CHART, v, maxAbs)) });
      }
    });
  });

  w.y -= HEAT_LEGEND_H;
  w.text('Perdió', { x: MARGIN + nameW, size: 7.5, color: GRAY });
  [-4, -3, -2, -1, 0, 1, 2, 3, 4].forEach((step, i) => {
    w.page.drawRectangle({
      x: MARGIN + nameW + 28 + i * 13, y: w.y - 1, width: 11, height: 7,
      color: hexColor(divergingColor(CHART, step, 4)),
    });
  });
  w.text('Ganó', { x: MARGIN + nameW + 28 + 9 * 13 + 4, size: 7.5, color: GRAY });
}

function heatmapHeight(section: Extract<ReportSection, { kind: 'heatmap' }>) {
  return headingHeight(section.subtitle) + section.race.players.length * (HEAT_CELL + HEAT_GAP) + HEAT_LEGEND_H;
}

function writeShare(w: Writer, section: Extract<ReportSection, { kind: 'share' }>) {
  writeHeading(w, section.title, section.subtitle);
  const total = section.items.reduce((s, i) => s + i.amount, 0);
  if (total === 0) return;
  w.y -= SHARE_BAR_H - 8;
  let x = MARGIN;
  const items = section.items.filter(i => i.amount > 0);
  const usable = CONTENT_W - (items.length - 1) * 2;
  items.forEach(i => {
    const width = (i.amount / total) * usable;
    w.page.drawRectangle({ x, y: w.y, width, height: 12, color: hexColor(seriesColor(CHART, i.slot)) });
    x += width + 2;
  });
  w.y -= 8;
  section.items.forEach(i => {
    w.y -= LEGEND_ROW_H;
    w.page.drawRectangle({ x: MARGIN, y: w.y, width: 8, height: 8, color: hexColor(seriesColor(CHART, i.slot)) });
    w.text(i.name, { x: MARGIN + 14, size: 9, bold: true, maxWidth: 200 });
    w.text(formatMoney(i.amount), { x: PAGE_W - MARGIN - 160, size: 9, color: GRAY, maxWidth: 110 });
    w.text(`${i.percent}%`, { size: 9, bold: true, alignRight: true, maxWidth: 40 });
  });
}

function shareHeight(section: Extract<ReportSection, { kind: 'share' }>) {
  return headingHeight(section.subtitle) + SHARE_BAR_H + section.items.length * LEGEND_ROW_H;
}

function writeAwards(w: Writer, section: Extract<ReportSection, { kind: 'awards' }>) {
  writeHeading(w, section.title);
  const colW = CONTENT_W / 2;
  section.awards.forEach((a, i) => {
    const col = i % 2;
    if (col === 0) w.y -= AWARD_H;
    const x = MARGIN + col * colW;
    const baseY = w.y;
    w.page.drawRectangle({
      x, y: baseY, width: colW - 6, height: AWARD_H - 6, color: BAR_BG, borderColor: LINE, borderWidth: 0.5,
    });
    w.y = baseY + AWARD_H - 20;
    w.text(a.title, { x: x + 8, size: 8.5, color: GRAY, maxWidth: colW - 100 });
    w.text(a.value, { x: x + colW - 14, size: 9, bold: true, color: ACCENT, alignRight: true, maxWidth: 90 });
    w.y -= 13;
    w.text(a.name, { x: x + 8, size: 11, bold: true, maxWidth: colW - 24 });
    w.y = baseY;
  });
}

function awardsHeight(section: Extract<ReportSection, { kind: 'awards' }>) {
  return section.awards.length > 0 ? headingHeight() + Math.ceil(section.awards.length / 2) * AWARD_H : 0;
}

function writeBars(w: Writer, section: Extract<ReportSection, { kind: 'bars' }>) {
  if (section.buckets.length === 0) return;
  writeHeading(w, section.title, section.subtitle);
  const max = Math.max(...section.buckets.map(b => b.count));
  const labelW = 80;
  const trackW = CONTENT_W - labelW - 40;
  section.buckets.forEach(b => {
    w.ensure(BAR_H);
    w.y -= BAR_H;
    w.text(b.label, { size: 8.5, color: GRAY, maxWidth: labelW - 6 });
    w.page.drawRectangle({ x: MARGIN + labelW, y: w.y, width: trackW, height: 7, color: BAR_BG });
    w.page.drawRectangle({ x: MARGIN + labelW, y: w.y, width: Math.max(2, (b.count / max) * trackW), height: 7, color: ACCENT });
    w.text(String(b.count), { size: 8.5, bold: true, alignRight: true, maxWidth: 30 });
  });
}

function writeSeasons(w: Writer, section: Extract<ReportSection, { kind: 'seasons' }>) {
  section.seasons.forEach((s, i) => {
    if (i > 0) w.startBlock(SEASON_H, 4);
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

export function writeSection(w: Writer, section: ReportSection) {
  switch (section.kind) {
    case 'ranked': writeRanked(w, section); break;
    case 'stats': writeStats(w, section); break;
    case 'bars': writeBars(w, section); break;
    case 'seasons': writeSeasons(w, section); break;
    case 'note': w.paragraph(section.text, NOTE_SIZE, GRAY); break;
    case 'race': writeRace(w, section); break;
    case 'heatmap': writeHeatmap(w, section); break;
    case 'share': writeShare(w, section); break;
    case 'awards': writeAwards(w, section); break;
  }
}

/**
 * Alto que ocupa una sección, para decidir si entra en lo que queda de la
 * página. En temporadas cuenta solo la primera: cada una es su propio bloque.
 */
export function sectionHeight(w: Writer, section: ReportSection): number {
  switch (section.kind) {
    case 'ranked': {
      const rows = Math.min(section.rows.length, MAX_ROWS);
      return TITLE_H
        + (section.subtitle ? SUBTITLE_H : 0)
        + HEAD_PAD
        + (rows > 0 ? rows * ROW_H : EMPTY_H)
        + (section.rows.length > MAX_ROWS ? MORE_H : 0);
    }
    case 'stats':
      return STATS_H + (section.note ? STATS_NOTE_H : 0);
    case 'bars':
      return section.buckets.length > 0 ? headingHeight(section.subtitle) + section.buckets.length * BAR_H : 0;
    case 'seasons':
      return section.seasons.length > 0 ? SEASON_H : 0;
    case 'note':
      return w.wrap(section.text, NOTE_SIZE).length * NOTE_LINE_H;
    case 'race':
      return section.race.sessions.length > 0 ? raceHeight(section) : 0;
    case 'heatmap':
      return section.race.sessions.length > 0 ? heatmapHeight(section) : 0;
    case 'share':
      return section.items.length > 0 ? shareHeight(section) : 0;
    case 'awards':
      return awardsHeight(section);
  }
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

  tabsFor(seasonId).forEach((tab, tabIdx) => {
    // Cada categoría empieza en una hoja nueva; la primera va debajo del encabezado.
    if (tabIdx > 0) {
      w.newPage();
      w.y -= 13;
    } else {
      w.y -= 34;
    }
    w.text(tab.label.toUpperCase(), { size: 13, bold: true, color: ACCENT });
    w.y -= 6;
    w.page.drawLine({
      start: { x: MARGIN, y: w.y }, end: { x: PAGE_W - MARGIN, y: w.y },
      thickness: 1.2, color: ACCENT,
    });

    buildSections(tab.key, reports, seasonId).forEach((section, sectionIdx) => {
      const height = sectionHeight(w, section);
      if (height === 0) return;
      w.startBlock(height, sectionIdx === 0 ? 4 : SECTION_GAP);
      writeSection(w, section);
    });
  });

  return doc.saveAsBase64();
}
