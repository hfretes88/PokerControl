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

  // Tilt: partidas en las que compró TILT_BUYS o más veces
  tiltGames: number;
  tiltWins: number;
  tiltBalance: number;

  /** Resultado según el día de la semana (solo días en que jugó). */
  weekdays: WeekdayResult[];

  history: PlayerGameEntry[];
}

export interface WeekdayResult {
  day: number;
  label: string;
  games: number;
  avgBalance: number;
}

/** Compras desde las que una noche cuenta como "tilt". */
export const TILT_BUYS = 3;
/** A partir de qué hora de partida una recompra es "tardía" (0 = primera hora). */
export const LATE_REBUY_HOUR = 3;

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

export interface RacePlayer {
  playerId: string;
  name: string;
  /**
   * Color del jugador en los gráficos: posición según la primera vez que jugó
   * (en todas las partidas, no solo las del alcance), así no cambia de color
   * al filtrar por temporada. El orden de color lo decide la pantalla.
   */
  slot: number;
  /** Acumulado al final del alcance. */
  final: number;
}

export interface RaceData {
  sessions: SessionRef[];
  /** Ordenados por acumulado final, de mayor a menor. */
  players: RacePlayer[];
  /** Acumulado por jugador después de cada partida (uno por partida). */
  cumulative: Record<string, number[]>;
  /** Balance de cada noche; null si ese jugador no jugó. */
  nights: Record<string, Array<number | null>>;
}

export interface TiltBucket {
  /** Cantidad de compras; el último cubo es "N o más". */
  buys: number;
  orMore: boolean;
  games: number;
  wins: number;
  avgBalance: number;
}

/** Cómo le va a `name` cuando `withName` está en la mesa y cuando no. */
export interface PresenceEffect {
  playerId: string;
  name: string;
  withId: string;
  withName: string;
  gamesWith: number;
  gamesWithout: number;
  avgWith: number;
  avgWithout: number;
  diff: number;
}

export interface CrazyNight extends SessionRef {
  /** Diferencia entre el que más ganó y el que más perdió. */
  spread: number;
  winner: { name: string; balance: number };
  loser: { name: string; balance: number };
  buyCount: number;
}

export interface LateRebuyStat {
  /** Noches (jugador × partida) con alguna recompra desde LATE_REBUY_HOUR. */
  games: number;
  wins: number;
  avgBalance: number;
  /** Para comparar: % de noches ganadas en general. */
  overallWinRate: number;
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

  race: RaceData;
  tilt: TiltBucket[];
  presence: PresenceEffect[];
  crazyNights: CrazyNight[];
  /** Recompras (sin contar la primera compra) según la hora de partida. */
  rebuysByGameHour: CountBucket[];
  lateRebuys: LateRebuyStat;
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

  const tiltNights = history.filter(h => h.buyCount >= TILT_BUYS);

  const byDay: Record<number, number[]> = {};
  history.forEach(h => {
    const day = new Date(h.date).getDay();
    (byDay[day] = byDay[day] || []).push(h.balance);
  });
  const weekdays: WeekdayResult[] = Object.entries(byDay).map(([day, balances]) => ({
    day: Number(day),
    label: WEEKDAYS[Number(day)],
    games: balances.length,
    avgBalance: Math.round(balances.reduce((s, b) => s + b, 0) / balances.length),
  }));

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

    tiltGames: tiltNights.length,
    tiltWins: tiltNights.filter(h => h.balance > 0).length,
    tiltBalance: tiltNights.reduce((s, h) => s + h.balance, 0),

    weekdays,

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

// ─── Gráficos y reportes locos ────────────────────────────────────────────────

/** Mínimo de partidas juntos y separados para medir el efecto presencia. */
export const PRESENCE_MIN_WITH = 3;
export const PRESENCE_MIN_WITHOUT = 2;
const GAME_HOURS_CAP = 6;

/**
 * Posición de cada jugador según la primera partida cerrada en la que jugó,
 * mirando todas las partidas (no solo el alcance) para que el color sea fijo.
 */
function colorSlots(sessions: Session[]): Record<string, number> {
  const slots: Record<string, number> = {};
  let next = 0;
  closedSessionsInScope(sessions).forEach(s => playedParticipants(s).forEach(p => {
    if (slots[p.playerId] === undefined) slots[p.playerId] = next++;
  }));
  return slots;
}

function buildRace(closed: Session[], names: Record<string, string>, slots: Record<string, number>): RaceData {
  const ids = Object.keys(names);
  const cumulative: Record<string, number[]> = {};
  const nights: Record<string, Array<number | null>> = {};
  const running: Record<string, number> = {};
  ids.forEach(id => { cumulative[id] = []; nights[id] = []; running[id] = 0; });

  closed.forEach(s => {
    const played = new Map(playedParticipants(s).map(p => [p.playerId, calcParticipant(p).balance]));
    ids.forEach(id => {
      const balance = played.get(id);
      running[id] += balance ?? 0;
      cumulative[id].push(running[id]);
      nights[id].push(balance ?? null);
    });
  });

  return {
    sessions: closed.map(toRef),
    players: ids
      .map(id => ({ playerId: id, name: names[id], slot: slots[id] ?? 0, final: running[id] }))
      .sort((a, b) => b.final - a.final),
    cumulative,
    nights,
  };
}

function buildTilt(results: GameResult[]): TiltBucket[] {
  const buckets: TiltBucket[] = [];
  for (let buys = 1; buys <= TILT_BUYS + 1; buys++) {
    const orMore = buys === TILT_BUYS + 1;
    const inBucket = results.filter(r => (orMore ? r.buyCount >= buys : r.buyCount === buys));
    if (inBucket.length === 0) continue;
    buckets.push({
      buys,
      orMore,
      games: inBucket.length,
      wins: inBucket.filter(r => r.balance > 0).length,
      avgBalance: Math.round(inBucket.reduce((s, r) => s + r.balance, 0) / inBucket.length),
    });
  }
  return buckets;
}

function buildPresence(closed: Session[], names: Record<string, string>): PresenceEffect[] {
  const nights = closed.map(s => new Map(playedParticipants(s).map(p => [p.playerId, calcParticipant(p).balance])));
  const ids = Object.keys(names);
  const effects: PresenceEffect[] = [];
  const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);

  ids.forEach(playerId => ids.forEach(withId => {
    if (playerId === withId) return;
    const withBal: number[] = [];
    const withoutBal: number[] = [];
    nights.forEach(n => {
      const balance = n.get(playerId);
      if (balance === undefined) return;
      (n.has(withId) ? withBal : withoutBal).push(balance);
    });
    if (withBal.length < PRESENCE_MIN_WITH || withoutBal.length < PRESENCE_MIN_WITHOUT) return;
    const avgWith = avg(withBal);
    const avgWithout = avg(withoutBal);
    effects.push({
      playerId, name: names[playerId], withId, withName: names[withId],
      gamesWith: withBal.length, gamesWithout: withoutBal.length,
      avgWith, avgWithout, diff: avgWith - avgWithout,
    });
  }));
  return effects.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

function buildCrazyNights(closed: Session[]): CrazyNight[] {
  return closed
    .map((s): CrazyNight | null => {
      const played = playedParticipants(s).map(p => ({ name: p.name, balance: calcParticipant(p).balance }));
      if (played.length < 2) return null;
      const sorted = [...played].sort((a, b) => b.balance - a.balance);
      const winner = sorted[0];
      const loser = sorted[sorted.length - 1];
      return {
        ...toRef(s),
        spread: winner.balance - loser.balance,
        winner,
        loser,
        buyCount: s.participants.reduce((n, p) => n + p.buys.length, 0),
      };
    })
    .filter((n): n is CrazyNight => n !== null)
    .sort((a, b) => b.spread - a.spread);
}

/** Hora de partida (0 = primera) en la que se hizo una compra. */
function gameHour(s: Session, timestamp: string): number {
  return Math.floor(Math.max(0, minutesBetween(s.createdAt, timestamp)) / 60);
}

function buildRebuyRhythm(closed: Session[]): { buckets: CountBucket[]; late: LateRebuyStat } {
  const counts: number[] = Array(GAME_HOURS_CAP).fill(0);
  let lateGames = 0;
  let lateWins = 0;
  let lateBalance = 0;
  let allGames = 0;
  let allWins = 0;

  closed.forEach(s => playedParticipants(s).forEach(p => {
    const { balance } = calcParticipant(p);
    allGames += 1;
    if (balance > 0) allWins += 1;
    const rebuys = [...p.buys]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(1);
    rebuys.forEach(b => { counts[Math.min(gameHour(s, b.timestamp), GAME_HOURS_CAP - 1)] += 1; });
    if (rebuys.some(b => gameHour(s, b.timestamp) >= LATE_REBUY_HOUR)) {
      lateGames += 1;
      lateBalance += balance;
      if (balance > 0) lateWins += 1;
    }
  }));

  const buckets = counts.map((count, h) => ({
    key: String(h),
    label: h === GAME_HOURS_CAP - 1 ? `${h + 1}ª hora +` : `${h + 1}ª hora`,
    count,
  }));
  // Se recortan las horas vacías del final (partidas que nunca llegaron tan lejos).
  while (buckets.length > 0 && buckets[buckets.length - 1].count === 0) buckets.pop();

  return {
    buckets,
    late: {
      games: lateGames,
      wins: lateWins,
      avgBalance: lateGames > 0 ? Math.round(lateBalance / lateGames) : 0,
      overallWinRate: allGames > 0 ? Math.round((allWins / allGames) * 100) : 0,
    },
  };
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
  const rhythm = buildRebuyRhythm(closed);

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

    race: buildRace(closed, names, colorSlots(sessions)),
    tilt: buildTilt(results),
    presence: buildPresence(closed, names),
    crazyNights: buildCrazyNights(closed),
    rebuysByGameHour: rhythm.buckets,
    lateRebuys: rhythm.late,
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
