/**
 * reportSections.ts — arma el contenido de cada pestaña de reportes a partir
 * de Reports, sin depender de React ni de colores. Lo consumen ReportsScreen
 * (para dibujar) y reportsPdf (para exportar), así ambos muestran lo mismo.
 */

import { formatMoney } from '../components/UI';
import { TILT_BUYS, LATE_REBUY_HOUR, PRESENCE_MIN_WITH } from '../storage/reports';
import type { Reports, PlayerReport, CountBucket, SeasonSummary, RaceData } from '../storage/reports';

export type ReportTab =
  | 'graficos' | 'locos' | 'compras' | 'remontadas' | 'rendimiento' | 'partidas' | 'deudas' | 'temporadas';

export const REPORT_TABS: Array<{ key: ReportTab; icon: string; label: string }> = [
  { key: 'graficos', icon: '📊', label: 'Gráficos' },
  { key: 'locos', icon: '🤪', label: 'Locos' },
  { key: 'compras', icon: '🪙', label: 'Compras' },
  { key: 'remontadas', icon: '📈', label: 'Remontadas' },
  { key: 'rendimiento', icon: '🎯', label: 'Rendimiento' },
  { key: 'partidas', icon: '🃏', label: 'Partidas' },
  { key: 'deudas', icon: '💳', label: 'Deudas' },
  { key: 'temporadas', icon: '🗓️', label: 'Temporadas' },
];

/** Partidas mínimas para entrar en rankings de promedios (evita que 1 noche distorsione). */
export const MIN_GAMES = 3;

export type Tone = 'positive' | 'negative';

export interface ReportRow {
  key: string;
  name: string;
  value: string;
  tone?: Tone;
  detail?: string;
  /** Partida a la que lleva la fila, si corresponde. */
  sessionId?: string;
}

export interface ReportStat {
  label: string;
  value: string;
  tone?: Tone;
}

export interface ShareItem {
  playerId: string;
  name: string;
  /** Color del jugador (ver RacePlayer.slot). */
  slot: number;
  amount: number;
  percent: number;
}

export interface Award {
  key: string;
  icon: string;
  title: string;
  name: string;
  value: string;
  detail: string;
}

export type ReportSection =
  | { kind: 'ranked'; title: string; subtitle?: string; rows: ReportRow[]; empty?: string }
  | { kind: 'stats'; stats: ReportStat[]; note?: string }
  | { kind: 'bars'; title: string; subtitle?: string; buckets: CountBucket[] }
  | { kind: 'seasons'; seasons: SeasonSummary[] }
  | { kind: 'note'; text: string }
  | { kind: 'race'; title: string; subtitle: string; race: RaceData }
  | { kind: 'heatmap'; title: string; subtitle: string; race: RaceData }
  | { kind: 'share'; title: string; subtitle: string; items: ShareItem[] }
  | { kind: 'awards'; title: string; awards: Award[] };

/** Partidas extra que se suponen para la proyección. */
export const PROJECTION_GAMES = 10;

// ─── Formato ──────────────────────────────────────────────────────────────────

export function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n)}`;
}

export function decimal(n: number): string {
  return n.toLocaleString('es-AR');
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} min`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const toneOf = (n: number): Tone => (n >= 0 ? 'positive' : 'negative');

const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** El mejor según `score` (mayor gana); null si nadie califica. */
function best(players: PlayerReport[], score: (p: PlayerReport) => number, qualifies: (p: PlayerReport) => boolean = () => true) {
  return players.filter(qualifies).reduce<PlayerReport | null>((b, p) => (!b || score(p) > score(b) ? p : b), null);
}

export function buildAwards(reports: Reports): Award[] {
  const players = reports.players;
  const regulars = (p: PlayerReport) => p.games >= MIN_GAMES;
  const awards: Award[] = [];
  const add = (key: string, icon: string, title: string, p: PlayerReport | null, value: (p: PlayerReport) => string, detail: string) => {
    if (p) awards.push({ key, icon, title, name: p.name, value: value(p), detail });
  };

  add('tiburon', '🦈', 'El Tiburón', best(players, p => p.balance, p => p.balance > 0),
    p => signed(p.balance), 'El que más ganó');
  add('banco', '🏦', 'El Banco', best(players, p => p.totalBought),
    p => formatMoney(p.totalBought), 'El que más plata puso en fichas');
  add('tilt', '🔥', 'Rey del Tilt', best(players, p => p.avgBuysPerGame, p => regulars(p) && p.avgBuysPerGame > 1),
    p => `${decimal(p.avgBuysPerGame)} compras`, 'Más compras promedio por noche');
  add('sangre-fria', '🧊', 'Sangre Fría', best(players, p => -p.volatility, regulars),
    p => `±${formatMoney(p.volatility)}`, 'El resultado más parejo noche a noche');
  add('remontada', '🪃', 'Rey de la Remontada', best(players, p => p.comebackAmount, p => p.comebackAmount > 0),
    p => signed(p.comebackAmount), 'Lo que recuperó desde su peor momento');
  add('mufa', '🥶', 'La Mufa', best(players, p => p.longestLossStreak, p => p.longestLossStreak >= 2),
    p => `${p.longestLossStreak} seguidas`, 'La racha perdedora más larga');
  add('fiel', '🫡', 'El Fiel', best(players, p => p.attendanceRate * 1000 + p.longestAttendanceStreak),
    p => `${p.attendanceRate}%`, 'El que menos faltó');
  add('fantasma', '👻', 'El Fantasma', best(players, p => -p.attendanceRate, p => p.attendanceRate < 100),
    p => `${p.attendanceRate}%`, 'El que más faltó');

  const moroso = reports.payers.filter(p => p.pendingAmount > 0).sort((a, b) => b.pendingAmount - a.pendingAmount)[0];
  if (moroso) {
    awards.push({
      key: 'moroso', icon: '🐢', title: 'El Moroso', name: moroso.name,
      value: formatMoney(moroso.pendingAmount), detail: 'El que más debe hoy',
    });
  }
  return awards;
}

/** Texto de los premios para compartir por WhatsApp. */
export function awardsMessage(awards: Award[], scopeName?: string): string {
  const lines = awards.map(a => `${a.icon} *${a.title}*: ${a.name} (${a.value})`);
  return [`🏆 *Premios ${scopeName ? `de ${scopeName}` : 'históricos'}* — PokerControl`, '', ...lines].join('\n');
}

function buildShare(reports: Reports): ShareItem[] {
  const total = reports.players.reduce((s, p) => s + p.totalBought, 0);
  const slots = new Map(reports.race.players.map(p => [p.playerId, p.slot]));
  return [...reports.players]
    .sort((a, b) => b.totalBought - a.totalBought)
    .map(p => ({
      playerId: p.playerId, name: p.name, slot: slots.get(p.playerId) ?? 0,
      amount: p.totalBought, percent: percent(p.totalBought, total),
    }));
}

function tiltLabel(buys: number, orMore: boolean): string {
  return orMore ? `${buys} o más compras` : plural(buys, 'compra', 'compras');
}

// ─── Secciones ────────────────────────────────────────────────────────────────

export function tabsFor(seasonId?: string) {
  return seasonId ? REPORT_TABS.filter(t => t.key !== 'temporadas') : REPORT_TABS;
}

export function buildSections(tab: ReportTab, reports: Reports, seasonId?: string): ReportSection[] {
  const players = reports.players;
  const row = (p: PlayerReport, value: string, detail?: string, tone?: Tone): ReportRow => ({
    key: p.playerId, name: p.name, value, detail, tone,
  });
  const ranked = (filter: (p: PlayerReport) => boolean, sort: (a: PlayerReport, b: PlayerReport) => number) =>
    players.filter(filter).sort(sort);

  switch (tab) {
    case 'graficos': {
      const late = reports.lateRebuys;
      return [
        {
          kind: 'race',
          title: 'La carrera',
          subtitle: 'Balance acumulado de cada jugador, partida a partida · tocá el gráfico',
          race: reports.race,
        },
        {
          kind: 'heatmap',
          title: 'Mapa de calor',
          subtitle: 'Cuánto ganó (azul) o perdió (rojo) cada uno por noche · vacío = no jugó',
          race: reports.race,
        },
        {
          kind: 'share',
          title: '¿Quién financia la mesa?',
          subtitle: 'Parte de todo lo comprado en fichas que puso cada uno',
          items: buildShare(reports),
        },
        {
          kind: 'bars',
          title: 'Ritmo de la noche',
          subtitle: 'Recompras según la hora de partida (sin contar la primera compra)',
          buckets: reports.rebuysByGameHour,
        },
        {
          kind: 'stats',
          stats: [
            { label: 'Noches', value: String(late.games) },
            {
              label: 'Ganaron',
              value: late.games > 0 ? `${percent(late.wins, late.games)}%` : '—',
              tone: late.games > 0 ? toneOf(percent(late.wins, late.games) - late.overallWinRate) : undefined,
            },
            { label: 'Promedio', value: late.games > 0 ? signed(late.avgBalance) : '—', tone: late.games > 0 ? toneOf(late.avgBalance) : undefined },
          ],
          note: `Noches con alguna recompra desde la ${LATE_REBUY_HOUR + 1}ª hora. En general se gana el ${late.overallWinRate}% de las noches.`,
        },
      ];
    }

    case 'locos': {
      const regulars = players.filter(p => p.games >= MIN_GAMES);
      const luckyDay = (p: PlayerReport) =>
        p.weekdays.filter(d => d.games >= 2).reduce<PlayerReport['weekdays'][number] | null>(
          (b, d) => (!b || d.avgBalance > b.avgBalance ? d : b), null);
      const unluckyDay = (p: PlayerReport) =>
        p.weekdays.filter(d => d.games >= 2).reduce<PlayerReport['weekdays'][number] | null>(
          (b, d) => (!b || d.avgBalance < b.avgBalance ? d : b), null);
      const dayRows = (pick: typeof luckyDay, sign: 1 | -1) => players
        .map(p => ({ p, d: pick(p) }))
        .filter((x): x is { p: PlayerReport; d: NonNullable<ReturnType<typeof luckyDay>> } =>
          x.d !== null && x.p.weekdays.filter(d => d.games >= 2).length >= 2)
        .sort((a, b) => sign * (b.d.avgBalance - a.d.avgBalance))
        .map(({ p, d }) => row(p, `${d.label}`, `Promedio ${signed(d.avgBalance)} en ${plural(d.games, 'partida', 'partidas')}`, toneOf(d.avgBalance)));
      const presenceRow = (e: Reports['presence'][number]) => ({
        key: `${e.withId}-${e.playerId}`,
        name: `${e.withName} → ${e.name}`,
        value: signed(e.diff),
        tone: toneOf(e.diff),
        detail: `Con ${e.withName}: ${signed(e.avgWith)} (${e.gamesWith}) · sin: ${signed(e.avgWithout)} (${e.gamesWithout})`,
      });

      return [
        { kind: 'awards', title: 'Premios', awards: buildAwards(reports) },
        {
          kind: 'ranked',
          title: 'Proyección',
          subtitle: `Si se juegan ${PROJECTION_GAMES} partidas más a este ritmo (mín. ${MIN_GAMES} partidas)`,
          empty: `Nadie tiene ${MIN_GAMES} partidas todavía`,
          rows: regulars
            .map(p => ({ p, projected: Math.round(p.balance + p.avgBalance * (p.attendanceRate / 100) * PROJECTION_GAMES) }))
            .sort((a, b) => b.projected - a.projected)
            .map(({ p, projected }) => row(p, signed(projected), `Hoy ${signed(p.balance)} · ${signed(p.avgBalance)} por partida`, toneOf(projected))),
        },
        {
          kind: 'ranked',
          title: 'Amuletos 🍀',
          subtitle: `A quién le va mejor cuando está el otro en la mesa (mín. ${PRESENCE_MIN_WITH} partidas juntos)`,
          empty: 'Todavía no hay suficientes partidas para medirlo',
          rows: reports.presence.filter(e => e.diff > 0).map(presenceRow),
        },
        {
          kind: 'ranked',
          title: 'Mufas 🐈‍⬛',
          subtitle: 'A quién le va peor cuando está el otro en la mesa',
          empty: 'Todavía no hay suficientes partidas para medirlo',
          rows: reports.presence.filter(e => e.diff < 0).map(presenceRow),
        },
        {
          kind: 'ranked',
          title: 'Medidor de tilt',
          subtitle: 'Cómo terminan las noches según cuántas veces se compró',
          rows: reports.tilt.map(t => ({
            key: String(t.buys),
            name: tiltLabel(t.buys, t.orMore),
            value: `${percent(t.wins, t.games)}% ganadas`,
            tone: toneOf(t.avgBalance),
            detail: `Promedio ${signed(t.avgBalance)} · ${plural(t.games, 'noche', 'noches')}`,
          })),
        },
        {
          kind: 'ranked',
          title: 'En tilt',
          subtitle: `Cómo le va a cada uno las noches que compra ${TILT_BUYS} o más veces`,
          empty: `Nadie compró ${TILT_BUYS} o más veces en una noche`,
          rows: ranked(p => p.tiltGames > 0, (a, b) => a.tiltWins / a.tiltGames - b.tiltWins / b.tiltGames || a.tiltBalance - b.tiltBalance)
            .map(p => row(
              p,
              `${p.tiltWins} de ${p.tiltGames}`,
              `Ganó ${percent(p.tiltWins, p.tiltGames)}% · total ${signed(p.tiltBalance)}`,
              toneOf(p.tiltBalance),
            )),
        },
        {
          kind: 'ranked',
          title: 'Día de suerte',
          subtitle: 'El día de la semana en que mejor le va (mín. 2 partidas ese día)',
          empty: 'Nadie jugó 2 o más veces en dos días distintos',
          rows: dayRows(luckyDay, 1),
        },
        {
          kind: 'ranked',
          title: 'Día de mufa',
          subtitle: 'El día de la semana en que peor le va',
          empty: 'Nadie jugó 2 o más veces en dos días distintos',
          rows: dayRows(unluckyDay, -1),
        },
        {
          kind: 'ranked',
          title: 'Las noches más locas',
          subtitle: 'Mayor diferencia entre el que más ganó y el que más perdió',
          rows: reports.crazyNights.map(n => ({
            key: n.sessionId, name: n.sessionName, value: formatMoney(n.spread), sessionId: n.sessionId,
            detail: `${n.winner.name} ${signed(n.winner.balance)} · ${n.loser.name} ${signed(n.loser.balance)}`,
          })),
        },
        {
          kind: 'ranked',
          title: 'La noche de las recompras',
          subtitle: 'Partidas con más compras de fichas',
          rows: [...reports.crazyNights].sort((a, b) => b.buyCount - a.buyCount).map(n => ({
            key: n.sessionId, name: n.sessionName, value: String(n.buyCount), sessionId: n.sessionId,
            detail: new Date(n.date).toLocaleDateString('es-AR'),
          })),
        },
      ];
    }

    case 'compras':
      return [
        {
          kind: 'ranked',
          title: 'Más compras',
          subtitle: 'Cantidad total de compras de fichas',
          rows: ranked(() => true, (a, b) => b.buyCount - a.buyCount).map(p =>
            row(p, String(p.buyCount), `${plural(p.games, 'partida', 'partidas')} · ${decimal(p.avgBuysPerGame)} por partida`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Más plata puesta',
          subtitle: 'Total comprado en fichas',
          rows: ranked(() => true, (a, b) => b.totalBought - a.totalBought).map(p =>
            row(p, formatMoney(p.totalBought), `Promedio ${formatMoney(p.avgBoughtPerGame)} por partida`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Los que más recompran',
          subtitle: 'Partidas en las que compró más de una vez',
          rows: ranked(p => p.rebuyGames > 0, (a, b) => b.rebuyRate - a.rebuyRate || b.rebuyGames - a.rebuyGames).map(p =>
            row(p, `${p.rebuyRate}%`, `${p.rebuyGames} de ${plural(p.games, 'partida', 'partidas')}`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Récord de compras en una noche',
          rows: ranked(p => p.maxBuysInGame > 1, (a, b) => b.maxBuysInGame - a.maxBuysInGame).map(p =>
            row(p, String(p.maxBuysInGame), p.maxBuysGame?.sessionName)
          ),
        },
        {
          kind: 'ranked',
          title: 'Recompra más rápida',
          subtitle: 'Tiempo promedio entre la primera y la segunda compra',
          rows: ranked(p => p.avgMinutesToRebuy !== null, (a, b) => (a.avgMinutesToRebuy ?? 0) - (b.avgMinutesToRebuy ?? 0)).map(p =>
            row(p, formatMinutes(p.avgMinutesToRebuy ?? 0), plural(p.rebuyGames, 'recompra', 'recompras'))
          ),
        },
        { kind: 'bars', title: 'Horario de las compras', buckets: reports.buysByHour },
      ];

    case 'remontadas': {
      const deepestLow = (p: PlayerReport) => Math.min(...p.recoveries.map(r => r.lowestBalance));
      return [
        {
          kind: 'ranked',
          title: 'Salieron de negativo',
          subtitle: 'Su acumulado estuvo abajo y volvió a quedar positivo',
          empty: 'Nadie salió de negativo todavía',
          rows: ranked(p => p.recoveries.length > 0, (a, b) => deepestLow(a) - deepestLow(b)).map(p => {
            const deepest = p.recoveries.reduce((d, r) => (r.lowestBalance < d.lowestBalance ? r : d));
            const times = p.recoveries.length > 1 ? ` · ${p.recoveries.length} veces` : '';
            return row(
              p,
              formatMoney(deepest.lowestBalance),
              `Recuperó en ${deepest.recoveredAt.sessionName} (${plural(deepest.gamesToRecover, 'partida', 'partidas')})${times}`,
              'negative',
            );
          }),
        },
        {
          kind: 'ranked',
          title: 'Mayor remontada',
          subtitle: 'Desde su peor momento hasta hoy',
          rows: ranked(p => p.comebackAmount > 0, (a, b) => b.comebackAmount - a.comebackAmount).map(p =>
            row(p, signed(p.comebackAmount), `De ${formatMoney(p.lowestCumulative)} a ${signed(p.balance)}`, 'positive')
          ),
        },
        {
          kind: 'ranked',
          title: 'Remontadas en la noche',
          subtitle: 'Compró 2 o más veces y terminó ganando',
          rows: ranked(p => p.nightComebacks > 0, (a, b) => b.nightComebacks - a.nightComebacks).map(p =>
            row(p, String(p.nightComebacks), `de ${p.rebuyGames} con recompra`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Racha actual',
          empty: 'Nadie tiene una racha de 2 o más',
          rows: ranked(p => p.currentStreak.count >= 2, (a, b) => b.currentStreak.count - a.currentStreak.count).map(p => {
            const win = p.currentStreak.type === 'win';
            return row(p, `${win ? '🔥' : '🥶'} ${p.currentStreak.count}`, win ? 'ganadas seguidas' : 'perdidas seguidas', win ? 'positive' : 'negative');
          }),
        },
        {
          kind: 'ranked',
          title: 'Racha ganadora más larga',
          rows: ranked(p => p.longestWinStreak > 0, (a, b) => b.longestWinStreak - a.longestWinStreak).map(p =>
            row(p, String(p.longestWinStreak), 'partidas ganadas seguidas', 'positive')
          ),
        },
        {
          kind: 'ranked',
          title: 'Racha perdedora más larga',
          rows: ranked(p => p.longestLossStreak > 0, (a, b) => b.longestLossStreak - a.longestLossStreak).map(p =>
            row(p, String(p.longestLossStreak), 'partidas perdidas seguidas', 'negative')
          ),
        },
        {
          kind: 'ranked',
          title: 'Mayor caída',
          subtitle: 'Lo que perdió desde su mejor momento',
          rows: ranked(p => p.maxDrawdown > 0, (a, b) => b.maxDrawdown - a.maxDrawdown).map(p =>
            row(p, formatMoney(-p.maxDrawdown), `Mejor momento ${signed(p.highestCumulative)}`, 'negative')
          ),
        },
      ];
    }

    case 'rendimiento':
      return [
        {
          kind: 'ranked',
          title: 'Retorno sobre lo comprado',
          subtitle: 'Ganancia o pérdida en relación a lo que compró',
          rows: ranked(() => true, (a, b) => b.roi - a.roi).map(p =>
            row(p, `${p.roi > 0 ? '+' : ''}${p.roi}%`, `${signed(p.balance)} sobre ${formatMoney(p.totalBought)}`, toneOf(p.roi))
          ),
        },
        {
          kind: 'ranked',
          title: 'Promedio por partida',
          rows: ranked(() => true, (a, b) => b.avgBalance - a.avgBalance).map(p =>
            row(p, signed(p.avgBalance), `${p.wins}G / ${p.losses}P en ${plural(p.games, 'partida', 'partidas')}`, toneOf(p.avgBalance))
          ),
        },
        {
          kind: 'ranked',
          title: 'Los más regulares',
          subtitle: `Cuánto varía su resultado de una noche a otra (mín. ${MIN_GAMES} partidas)`,
          empty: `Nadie tiene ${MIN_GAMES} partidas todavía`,
          rows: ranked(p => p.games >= MIN_GAMES, (a, b) => a.volatility - b.volatility).map(p =>
            row(p, `±${formatMoney(p.volatility)}`, `Promedio ${signed(p.avgBalance)}`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Mejores noches',
          rows: reports.biggestWins.map(r => ({
            key: `${r.sessionId}-${r.playerId}`, name: r.name, value: signed(r.balance), tone: 'positive' as const,
            detail: r.sessionName, sessionId: r.sessionId,
          })),
        },
        {
          kind: 'ranked',
          title: 'Peores noches',
          rows: reports.biggestLosses.map(r => ({
            key: `${r.sessionId}-${r.playerId}`, name: r.name, value: signed(r.balance), tone: 'negative' as const,
            detail: `${r.sessionName} · ${plural(r.buyCount, 'compra', 'compras')}`, sessionId: r.sessionId,
          })),
        },
      ];

    case 'partidas':
      return [
        {
          kind: 'stats',
          stats: [
            { label: 'Partidas', value: String(reports.totalSessions) },
            { label: 'Pozo promedio', value: formatMoney(reports.avgPot) },
            {
              label: 'Duración prom.',
              value: reports.avgDurationMinutes !== null ? formatMinutes(reports.avgDurationMinutes) : '—',
            },
          ],
        },
        {
          kind: 'ranked',
          title: 'Pozos más grandes',
          rows: [...reports.sessions].sort((a, b) => b.pot - a.pot).map(s => ({
            key: s.sessionId, name: s.sessionName, value: formatMoney(s.pot),
            detail: `${plural(s.players, 'jugador', 'jugadores')} · ${plural(s.buyCount, 'compra', 'compras')}`,
            sessionId: s.sessionId,
          })),
        },
        {
          kind: 'ranked',
          title: 'Partidas más largas',
          subtitle: 'Desde que se creó hasta que se cerró',
          rows: reports.sessions.filter(s => (s.durationMinutes ?? 0) > 0)
            .sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))
            .map(s => ({
              key: s.sessionId, name: s.sessionName, value: formatMinutes(s.durationMinutes ?? 0),
              detail: new Date(s.date).toLocaleDateString('es-AR'), sessionId: s.sessionId,
            })),
        },
        {
          kind: 'ranked',
          title: 'Asistencia',
          rows: ranked(() => true, (a, b) => b.games - a.games).map(p =>
            row(p, String(p.games), `${p.attendanceRate}% de las partidas`)
          ),
        },
        {
          kind: 'ranked',
          title: 'Más partidas seguidas',
          rows: ranked(p => p.longestAttendanceStreak > 1, (a, b) => b.longestAttendanceStreak - a.longestAttendanceStreak).map(p =>
            row(p, String(p.longestAttendanceStreak), p.currentAttendanceStreak > 1 ? `Racha actual: ${p.currentAttendanceStreak}` : undefined)
          ),
        },
        {
          kind: 'ranked',
          title: 'Jugador del mes',
          rows: reports.monthlyWinners.map(m => ({
            key: m.month, name: `${m.label} · ${m.name}`, value: signed(m.balance), tone: toneOf(m.balance),
            detail: plural(m.sessions, 'partida', 'partidas'),
          })),
        },
        { kind: 'bars', title: 'Partidas por mes', buckets: reports.sessionsByMonth },
        { kind: 'bars', title: 'Día de la semana', buckets: reports.sessionsByWeekday },
      ];

    case 'deudas':
      return [
        {
          kind: 'stats',
          stats: [
            { label: 'Generado', value: formatMoney(reports.debtSummary.totalOriginal) },
            { label: 'Pagado', value: formatMoney(reports.debtSummary.totalPaid), tone: 'positive' },
            { label: 'Pendiente', value: formatMoney(reports.debtSummary.totalPending), tone: 'negative' },
          ],
          note: `${reports.debtSummary.paidPercent}% de lo adeudado ya está pagado`,
        },
        {
          kind: 'ranked',
          title: 'Quién le paga a quién',
          subtitle: 'Según el cierre de cada partida, antes de compensar deudas',
          rows: reports.pairFlows.map(f => ({
            key: `${f.fromId}-${f.toId}`, name: `${f.fromName} → ${f.toName}`, value: formatMoney(f.amount),
            detail: plural(f.times, 'vez', 'veces'),
          })),
        },
        {
          kind: 'ranked',
          title: 'Pagan más rápido',
          subtitle: 'Días promedio hasta saldar una deuda',
          empty: 'Todavía no hay deudas saldadas',
          rows: reports.payers.filter(p => p.paidDebts > 0).sort((a, b) => a.avgDaysToPay - b.avgDaysToPay).map(p => ({
            key: p.playerId, name: p.name, value: `${decimal(p.avgDaysToPay)} d`,
            detail: plural(p.paidDebts, 'deuda saldada', 'deudas saldadas'),
          })),
        },
        {
          kind: 'ranked',
          title: 'Más deben hoy',
          empty: 'No hay deudas pendientes 🎉',
          rows: reports.payers.filter(p => p.pendingAmount > 0).sort((a, b) => b.pendingAmount - a.pendingAmount).map(p => ({
            key: p.playerId, name: p.name, value: formatMoney(p.pendingAmount), tone: 'negative' as const,
          })),
        },
        {
          kind: 'note',
          text: seasonId
            ? 'Solo deudas generadas por partidas de esta temporada. Las compensadas entre varias partidas y las deudas previas no tienen temporada y no se incluyen.'
            : 'Las deudas compensadas toman como fecha el momento de la compensación, así que los días hasta pagar son aproximados. No incluye deudas previas.',
        },
      ];

    case 'temporadas':
      return [{ kind: 'seasons', seasons: reports.seasons }];
  }
}
