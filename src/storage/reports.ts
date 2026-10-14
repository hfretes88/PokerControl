/**
 * reports.ts — informes derivados de lo que ya está guardado.
 *
 * Todo se calcula al vuelo a partir de poker_sessions, poker_debts y
 * poker_seasons: no se persiste nada nuevo ni hace falta migrar datos.
 * buildReports es pura (recibe los datos) para poder testearla sin
 * AsyncStorage; getReports es el wrapper que los lee del storage.
 *
 * Solo cuentan las partidas cerradas y, dentro de ellas, los participantes
 * con resultado cargado (mismo criterio que getPlayerHistory).
 */

import { getSessions, calcParticipant, calcSession, calcDebts } from './storage';
import { getAllDebts, MANUAL_DEBT_SESSION_ID } from './debts';
import { getSeasons } from './seasons';
import type { Session, Debt, Season } from './types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SessionRef {
  sessionId: string;
  sessionName: string;
  date: string;
}

export interface PlayerGameEntry extends SessionRef {
  buyCount: number;
  totalBought: number;
  balance: number;
  /** Minutos entre la primera y la segunda compra; null si compró una sola vez. */
  minutesToRebuy: number | null;
}

export interface Streak {
  type: 'win' | 'loss' | 'none';
  count: number;
}

export interface Recovery {
  /** Punto más bajo del balance acumulado antes de volver a positivo. */
  lowestBalance: number;
  lowestAt: SessionRef;
  /** Partida en la que el acumulado volvió a quedar positivo. */
  recoveredAt: SessionRef;
  /** Cuántas partidas tardó desde el punto más bajo hasta volver a positivo. */
  gamesToRecover: number;
}

export interface PlayerReport {
  playerId: string;
  name: string;
  games: number;

  // Compras
  buyCount: number;
  totalBought: number;
  avgBuysPerGame: number;
  avgBoughtPerGame: number;
  rebuyGames: number;
  rebuyRate: number;
  maxBuysInGame: number;
  maxBuysGame: SessionRef | null;
  avgMinutesToRebuy: number | null;

  // Rendimiento
  balance: number;
  avgBalance: number;
  roi: number;
  /** Desvío estándar del balance por partida: cuánto varía de una noche a otra. */
  volatility: number;
  wins: number;
  losses: number;

  // Remontadas y rachas
  lowestCumulative: number;
  highestCumulative: number;
  /** Mayor caída desde un máximo del acumulado hasta un mínimo posterior. */
  maxDrawdown: number;
  /** Diferencia entre el peor momento del acumulado y el acumulado actual. */
  comebackAmount: number;
  recoveries: Recovery[];
  /** Partidas en las que compró 2 o más veces y terminó ganando. */
  nightComebacks: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: Streak;

  // Asistencia
  longestAttendanceStreak: number;
  currentAttendanceStreak: number;
  attendanceRate: number;

  history: PlayerGameEntry[];
}

export interface GameResult extends SessionRef {
  playerId: string;
  name: string;
  balance: number;
  buyCount: number;
}

export interface SessionSummary extends SessionRef {
  pot: number;
  players: number;
  buyCount: number;
  /** Minutos entre la creación y el cierre; null si no hay cierre. */
  durationMinutes: number | null;
}

export interface CountBucket {
  key: string;
  label: string;
  count: number;
}

export interface MonthlyWinner {
  month: string;
  label: string;
  sessions: number;
  playerId: string;
  name: string;
  balance: number;
}

export interface PairFlow {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** Total transferido de from a to según el cierre de cada partida. */
  amount: number;
  times: number;
}

export interface PayerStat {
  playerId: string;
  name: string;
  paidDebts: number;
  avgDaysToPay: number;
  pendingAmount: number;
}

export interface DebtSummary {
  totalOriginal: number;
  totalPaid: number;
  totalPending: number;
  paidPercent: number;
}

export interface SeasonSummary {
  seasonId: string;
  name: string;
  status: Season['status'];
  sessions: number;
  totalPot: number;
  avgPlayers: number;
  champion: { playerId: string; name: string; balance: number } | null;
}

export interface Reports {
  totalSessions: number;
  players: PlayerReport[];
  biggestWins: GameResult[];
  biggestLosses: GameResult[];
  sessions: SessionSummary[];
  avgPot: number;
  avgDurationMinutes: number | null;
  sessionsByMonth: CountBucket[];
  sessionsByWeekday: CountBucket[];
  buysByHour: CountBucket[];
  monthlyWinners: MonthlyWinner[];
  pairFlows: PairFlow[];
  payers: PayerStat[];
  debtSummary: DebtSummary;
  seasons: SeasonSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAY_MS = 24 * 60 * 60 * 1000;

function sessionDate(s: Session): string {
  return s.closedAt || s.createdAt;
}

function toRef(s: Session): SessionRef {
  return { sessionId: s.id, sessionName: s.name, date: sessionDate(s) };
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

/** Partidas cerradas del alcance, ordenadas de la más vieja a la más nueva. */
function closedSessionsInScope(sessions: Session[], seasonId?: string): Session[] {
  return sessions
    .filter(s => s.status === 'closed' && (!seasonId || s.seasonId === seasonId))
    .sort((a, b) => new Date(sessionDate(a)).getTime() - new Date(sessionDate(b)).getTime());
}

function playedParticipants(s: Session) {
  return s.participants.filter(p => p.finalAmount !== null);
}

// ─── Por jugador ──────────────────────────────────────────────────────────────

function buildPlayerReport(
  playerId: string,
  name: string,
  closed: Session[],
): PlayerReport {
  const history: PlayerGameEntry[] = [];
  let attendanceRun = 0;
  let longestAttendanceStreak = 0;

  closed.forEach(s => {
    const p = playedParticipants(s).find(x => x.playerId === playerId);
    if (!p) {
      attendanceRun = 0;
      return;
    }
    attendanceRun += 1;
    longestAttendanceStreak = Math.max(longestAttendanceStreak, attendanceRun);

    const { totalBought, balance } = calcParticipant(p);
    const buys = [...p.buys].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    history.push({
      ...toRef(s),
      buyCount: buys.length,
      totalBought,
      balance,
      minutesToRebuy: buys.length >= 2 ? minutesBetween(buys[0].timestamp, buys[1].timestamp) : null,
    });
  });

  const games = history.length;
  const buyCount = history.reduce((s, h) => s + h.buyCount, 0);
  const totalBought = history.reduce((s, h) => s + h.totalBought, 0);
  const balance = history.reduce((s, h) => s + h.balance, 0);
  const rebuyGames = history.filter(h => h.buyCount > 1).length;
  const rebuyTimes = history
    .map(h => h.minutesToRebuy)
    .filter((m): m is number => m !== null && m >= 0);

  const maxBuysEntry = history.reduce<PlayerGameEntry | null>(
    (best, h) => (!best || h.buyCount > best.buyCount ? h : best), null
  );

  // Acumulado, caídas y remontadas
  let cumulative = 0;
  let lowest = 0;
  let highest = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let wentNegative = false;
  let holeLow = 0;
  let holeLowIdx = -1;
  const recoveries: Recovery[] = [];

  history.forEach((h, idx) => {
    cumulative += h.balance;
    lowest = Math.min(lowest, cumulative);
    highest = Math.max(highest, cumulative);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);

    if (cumulative < 0) {
      if (!wentNegative || cumulative < holeLow) {
        holeLow = cumulative;
        holeLowIdx = idx;
      }
      wentNegative = true;
    } else if (cumulative > 0 && wentNegative) {
      const low = history[holeLowIdx];
      recoveries.push({
        lowestBalance: holeLow,
        lowestAt: { sessionId: low.sessionId, sessionName: low.sessionName, date: low.date },
        recoveredAt: { sessionId: h.sessionId, sessionName: h.sessionName, date: h.date },
        gamesToRecover: idx - holeLowIdx,
      });
      wentNegative = false;
      holeLow = 0;
      holeLowIdx = -1;
    }
  });

  // Rachas (un empate corta cualquier racha)
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let run: Streak = { type: 'none', count: 0 };
  history.forEach(h => {
    const type: Streak['type'] = h.balance > 0 ? 'win' : h.balance < 0 ? 'loss' : 'none';
    run = type !== 'none' && type === run.type
      ? { type, count: run.count + 1 }
      : { type, count: type === 'none' ? 0 : 1 };
    if (run.type === 'win') longestWinStreak = Math.max(longestWinStreak, run.count);
    if (run.type === 'loss') longestLossStreak = Math.max(longestLossStreak, run.count);
  });

  return {
    playerId,
    name,
    games,

    buyCount,
    totalBought,
    avgBuysPerGame: games > 0 ? round1(buyCount / games) : 0,
    avgBoughtPerGame: games > 0 ? Math.round(totalBought / games) : 0,
    rebuyGames,
    rebuyRate: games > 0 ? Math.round((rebuyGames / games) * 100) : 0,
    maxBuysInGame: maxBuysEntry?.buyCount ?? 0,
    maxBuysGame: maxBuysEntry
      ? { sessionId: maxBuysEntry.sessionId, sessionName: maxBuysEntry.sessionName, date: maxBuysEntry.date }
      : null,
    avgMinutesToRebuy: rebuyTimes.length > 0
      ? Math.round(rebuyTimes.reduce((s, m) => s + m, 0) / rebuyTimes.length)
      : null,

    balance,
    avgBalance: games > 0 ? Math.round(balance / games) : 0,
    roi: totalBought > 0 ? Math.round((balance / totalBought) * 100) : 0,
    volatility: stdDev(history.map(h => h.balance)),
    wins: history.filter(h => h.balance > 0).length,
    losses: history.filter(h => h.balance < 0).length,

    lowestCumulative: lowest,
    highestCumulative: highest,
    maxDrawdown,
    comebackAmount: lowest < 0 ? cumulative - lowest : 0,
    recoveries,
    nightComebacks: history.filter(h => h.buyCount >= 2 && h.balance > 0).length,
    longestWinStreak,
    longestLossStreak,
    currentStreak: run,

    longestAttendanceStreak,
    currentAttendanceStreak: attendanceRun,
    attendanceRate: closed.length > 0 ? Math.round((games / closed.length) * 100) : 0,

    history,
  };
}

// ─── Deudas ───────────────────────────────────────────────────────────────────

/**
 * Flujos entre pares recalculados desde el cierre de cada partida (calcDebts),
 * no desde poker_debts: el neteo reemplaza las deudas originales por
 * consolidadas y se perdería quién le debía a quién en cada partida.
 */
function buildPairFlows(closed: Session[]): PairFlow[] {
  const map: Record<string, PairFlow> = {};
  closed.forEach(s => {
    calcDebts(s).forEach(t => {
      const key = `${t.fromId}|${t.toId}`;
      if (!map[key]) {
        map[key] = { fromId: t.fromId, fromName: t.from, toId: t.toId, toName: t.to, amount: 0, times: 0 };
      }
      map[key].amount += t.amount;
      map[key].times += 1;
    });
  });
  return Object.values(map).sort((a, b) => b.amount - a.amount || b.times - a.times);
}

/**
 * Velocidad de pago: días entre que se generó la deuda y su último pago,
 * solo para deudas saldadas. En las consolidadas createdAt es la fecha del
 * neteo, así que el número puede quedar corto: es una aproximación.
 */
function buildPayers(debts: Debt[]): PayerStat[] {
  const map: Record<string, { name: string; days: number[]; pending: number }> = {};
  const entry = (id: string, name: string) => {
    if (!map[id]) map[id] = { name, days: [], pending: 0 };
    return map[id];
  };

  debts.forEach(d => {
    const e = entry(d.fromPlayer.id, d.fromPlayer.name);
    if (d.status !== 'paid') {
      e.pending += d.pendingAmount;
      return;
    }
    const lastPayment = d.payments.reduce<string | null>(
      (last, p) => (!last || p.date > last ? p.date : last), null
    );
    if (!lastPayment) return;
    const days = (new Date(lastPayment).getTime() - new Date(d.createdAt).getTime()) / DAY_MS;
    e.days.push(Math.max(0, days));
  });

  return Object.entries(map)
    .map(([playerId, e]) => ({
      playerId,
      name: e.name,
      paidDebts: e.days.length,
      avgDaysToPay: e.days.length > 0 ? round1(e.days.reduce((s, d) => s + d, 0) / e.days.length) : 0,
      pendingAmount: e.pending,
    }))
    .sort((a, b) => b.paidDebts - a.paidDebts || a.avgDaysToPay - b.avgDaysToPay);
}

function buildDebtSummary(debts: Debt[]): DebtSummary {
  const totalOriginal = debts.reduce((s, d) => s + d.originalAmount, 0);
  const totalPending = debts.reduce((s, d) => s + (d.status === 'paid' ? 0 : d.pendingAmount), 0);
  const totalPaid = totalOriginal - totalPending;
  return {
    totalOriginal,
    totalPaid,
    totalPending,
    paidPercent: totalOriginal > 0 ? Math.round((totalPaid / totalOriginal) * 100) : 0,
  };
}

// ─── Partidas ─────────────────────────────────────────────────────────────────

function buildSessionSummaries(closed: Session[]): SessionSummary[] {
  return closed.map(s => ({
    ...toRef(s),
    pot: calcSession(s).totalPot,
    players: playedParticipants(s).length,
    buyCount: s.participants.reduce((n, p) => n + p.buys.length, 0),
    durationMinutes: s.closedAt ? minutesBetween(s.createdAt, s.closedAt) : null,
  }));
}

function countBy<T>(items: T[], keyOf: (t: T) => string, labelOf: (k: string) => string): CountBucket[] {
  const counts: Record<string, number> = {};
  items.forEach(i => {
    const k = keyOf(i);
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts).map(([key, count]) => ({ key, label: labelOf(key), count }));
}

function buildMonthlyWinners(closed: Session[]): MonthlyWinner[] {
  const byMonth: Record<string, Session[]> = {};
  closed.forEach(s => {
    const k = monthKey(sessionDate(s));
    (byMonth[k] = byMonth[k] || []).push(s);
  });

  return Object.entries(byMonth)
    .map(([month, list]): MonthlyWinner | null => {
      const totals: Record<string, { name: string; balance: number }> = {};
      list.forEach(s => playedParticipants(s).forEach(p => {
        const t = (totals[p.playerId] = totals[p.playerId] || { name: p.name, balance: 0 });
        t.name = p.name;
        t.balance += calcParticipant(p).balance;
      }));
      const best = Object.entries(totals).sort((a, b) => b[1].balance - a[1].balance)[0];
      if (!best) return null;
      return {
        month,
        label: monthLabel(month),
        sessions: list.length,
        playerId: best[0],
        name: best[1].name,
        balance: best[1].balance,
      };
    })
    .filter((m): m is MonthlyWinner => m !== null)
    .sort((a, b) => b.month.localeCompare(a.month));
}

// ─── Temporadas ───────────────────────────────────────────────────────────────

function buildSeasonSummaries(seasons: Season[], sessions: Session[]): SeasonSummary[] {
  return seasons.map(season => {
    const closed = closedSessionsInScope(sessions, season.id);
    const totals: Record<string, { name: string; balance: number }> = {};
    let totalPot = 0;
    let playerSlots = 0;
    closed.forEach(s => {
      totalPot += calcSession(s).totalPot;
      const played = playedParticipants(s);
      playerSlots += played.length;
      played.forEach(p => {
        const t = (totals[p.playerId] = totals[p.playerId] || { name: p.name, balance: 0 });
        t.name = p.name;
        t.balance += calcParticipant(p).balance;
      });
    });
    const best = Object.entries(totals).sort((a, b) => b[1].balance - a[1].balance)[0];
    return {
      seasonId: season.id,
      name: season.name,
      status: season.status,
      sessions: closed.length,
      totalPot,
      avgPlayers: closed.length > 0 ? round1(playerSlots / closed.length) : 0,
      champion: best ? { playerId: best[0], name: best[1].name, balance: best[1].balance } : null,
    };
  });
}

// ─── Armado ───────────────────────────────────────────────────────────────────

export function buildReports(
  sessions: Session[],
  debts: Debt[],
  seasons: Season[],
  seasonId?: string,
): Reports {
  const closed = closedSessionsInScope(sessions, seasonId);

  // Último nombre usado por cada jugador (el participante guarda una copia).
  const names: Record<string, string> = {};
  closed.forEach(s => playedParticipants(s).forEach(p => { names[p.playerId] = p.name; }));

  const players = Object.entries(names)
    .map(([id, name]) => buildPlayerReport(id, name, closed))
    .filter(p => p.games > 0);

  const results: GameResult[] = closed.flatMap(s =>
    playedParticipants(s).map(p => ({
      ...toRef(s),
      playerId: p.playerId,
      name: p.name,
      balance: calcParticipant(p).balance,
      buyCount: p.buys.length,
    }))
  );

  const sessionSummaries = buildSessionSummaries(closed);
  const durations = sessionSummaries
    .map(s => s.durationMinutes)
    .filter((m): m is number => m !== null && m > 0);

  const allBuys = closed.flatMap(s => s.participants.flatMap(p => p.buys));

  // Las deudas son globales (no tienen temporada). Con temporada se limitan a
  // las generadas por sus partidas; las consolidadas y las previas quedan fuera.
  const closedIds = new Set(closed.map(s => s.id));
  const scopedDebts = seasonId
    ? debts.filter(d => closedIds.has(d.sessionId))
    : debts.filter(d => d.sessionId !== MANUAL_DEBT_SESSION_ID);

  return {
    totalSessions: closed.length,
    players,
    biggestWins: results.filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance),
    biggestLosses: results.filter(r => r.balance < 0).sort((a, b) => a.balance - b.balance),
    sessions: sessionSummaries,
    avgPot: closed.length > 0
      ? Math.round(sessionSummaries.reduce((s, x) => s + x.pot, 0) / closed.length)
      : 0,
    avgDurationMinutes: durations.length > 0
      ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
      : null,
    sessionsByMonth: countBy(closed, s => monthKey(sessionDate(s)), monthLabel)
      .sort((a, b) => b.key.localeCompare(a.key)),
    sessionsByWeekday: countBy(closed, s => String(new Date(sessionDate(s)).getDay()), k => WEEKDAYS[Number(k)])
      .sort((a, b) => b.count - a.count),
    buysByHour: countBy(allBuys, b => String(new Date(b.timestamp).getHours()).padStart(2, '0'), k => `${k}:00`)
      .sort((a, b) => a.key.localeCompare(b.key)),
    monthlyWinners: buildMonthlyWinners(closed),
    pairFlows: buildPairFlows(closed),
    payers: buildPayers(scopedDebts),
    debtSummary: buildDebtSummary(scopedDebts),
    seasons: seasonId ? [] : buildSeasonSummaries(seasons, sessions),
  };
}

export async function getReports(seasonId?: string): Promise<Reports> {
  const [sessions, debts, seasons] = await Promise.all([getSessions(), getAllDebts(), getSeasons()]);
  return buildReports(sessions, debts, seasons, seasonId);
}

/** Informe de un solo jugador (para StatsScreen). null si no jugó en el alcance. */
export async function getPlayerReport(playerId: string, seasonId?: string): Promise<PlayerReport | null> {
  const sessions = await getSessions();
  const closed = closedSessionsInScope(sessions, seasonId);
  const report = buildPlayerReport(playerId, '', closed);
  return report.games > 0 ? report : null;
}
