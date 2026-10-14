import { buildReports } from '../src/storage/reports';
import type { Session, Debt, Season, Participant } from '../src/storage/types';

function participant(playerId: string, buys: Array<[number, string]>, finalAmount: number | null): Participant {
  return {
    playerId,
    name: playerId.toUpperCase(),
    buys: buys.map(([amount, timestamp]) => ({ amount, timestamp })),
    finalAmount,
  };
}

let seq = 0;
function session(day: number, participants: Participant[], extra: Partial<Session> = {}): Session {
  seq += 1;
  const date = `2026-0${extra.seasonId === 's2' ? 2 : 1}-${String(day).padStart(2, '0')}`;
  return {
    id: `ses${seq}`,
    name: `Partida ${seq}`,
    createdAt: `${date}T21:00:00.000Z`,
    closedAt: `${date}T23:30:00.000Z`,
    status: 'closed',
    seasonId: 's1',
    participants,
    ...extra,
  };
}

const t = (day: number, hh: string) => `2026-01-${String(day).padStart(2, '0')}T${hh}:00.000Z`;

// a: -1000, -500, +2000  → baja a -1500 y se recupera a +500
// b: +1000, +500, -2000  → racha de 2 ganadas, termina -500
const sessions: Session[] = [
  session(1, [
    participant('a', [[1000, t(1, '21:00')], [1000, t(1, '22:00')]], 1000),
    participant('b', [[1000, t(1, '21:00')]], 2000),
  ]),
  session(2, [
    participant('a', [[1000, t(2, '21:00')]], 500),
    participant('b', [[1000, t(2, '21:00')]], 1500),
  ]),
  session(3, [
    participant('a', [[1000, t(3, '21:00')], [1000, t(3, '21:30')], [1000, t(3, '22:00')]], 5000),
    participant('b', [[1000, t(3, '21:00')], [1000, t(3, '21:45')]], 0),
  ]),
  // Partida abierta: no debe contar
  session(4, [participant('a', [[9999, t(4, '21:00')]], null)], { status: 'active', closedAt: null }),
];

const seasons: Season[] = [
  { id: 's1', name: 'Temporada 1', createdAt: '2026-01-01T00:00:00.000Z', closedAt: null, status: 'active' },
];

const debts: Debt[] = [
  {
    id: 'd1',
    fromPlayer: { id: 'a', name: 'A' },
    toPlayer: { id: 'b', name: 'B' },
    sessionId: 'ses1',
    sessionName: 'Partida 1',
    originalAmount: 1000,
    pendingAmount: 0,
    status: 'paid',
    payments: [{ amount: 1000, date: '2026-01-03T12:00:00.000Z', note: '' }],
    createdAt: '2026-01-01T23:30:00.000Z',
    isConsolidated: false,
  },
];

const reports = buildReports(sessions, debts, seasons);
const a = reports.players.find(p => p.playerId === 'a')!;
const b = reports.players.find(p => p.playerId === 'b')!;

describe('buildReports', () => {
  test('solo cuenta partidas cerradas', () => {
    expect(reports.totalSessions).toBe(3);
    expect(a.games).toBe(3);
    expect(a.buyCount).toBe(6);
    expect(a.totalBought).toBe(6000);
  });

  test('compras', () => {
    expect(a.avgBuysPerGame).toBe(2);
    expect(a.rebuyGames).toBe(2);
    expect(a.rebuyRate).toBe(67);
    expect(a.maxBuysInGame).toBe(3);
    expect(a.maxBuysGame?.sessionName).toBe('Partida 3');
    // 60 min en la partida 1, 30 min en la 3
    expect(a.avgMinutesToRebuy).toBe(45);
    expect(b.avgMinutesToRebuy).toBe(45);
  });

  test('remontada desde negativo', () => {
    expect(a.balance).toBe(500);
    expect(a.lowestCumulative).toBe(-1500);
    expect(a.comebackAmount).toBe(2000);
    expect(a.recoveries).toHaveLength(1);
    expect(a.recoveries[0]).toMatchObject({
      lowestBalance: -1500,
      gamesToRecover: 1,
      lowestAt: { sessionName: 'Partida 2' },
      recoveredAt: { sessionName: 'Partida 3' },
    });
    expect(a.nightComebacks).toBe(1);
    expect(b.recoveries).toHaveLength(0);
  });

  test('rachas y caída máxima', () => {
    expect(b.longestWinStreak).toBe(2);
    expect(b.currentStreak).toEqual({ type: 'loss', count: 1 });
    expect(b.maxDrawdown).toBe(2000);
    expect(a.longestLossStreak).toBe(2);
    expect(a.currentStreak).toEqual({ type: 'win', count: 1 });
  });

  test('rendimiento', () => {
    expect(a.roi).toBe(8);
    expect(reports.biggestWins[0]).toMatchObject({ playerId: 'a', balance: 2000 });
    expect(reports.biggestLosses[0]).toMatchObject({ playerId: 'b', balance: -2000 });
  });

  test('partidas', () => {
    expect(reports.sessions[0].durationMinutes).toBe(150);
    expect(reports.avgDurationMinutes).toBe(150);
    expect(reports.avgPot).toBe(Math.round((3000 + 2000 + 5000) / 3));
    expect(a.longestAttendanceStreak).toBe(3);
    expect(a.attendanceRate).toBe(100);
  });

  test('flujos entre pares salen del cierre de cada partida', () => {
    const aToB = reports.pairFlows.find(f => f.fromId === 'a' && f.toId === 'b');
    const bToA = reports.pairFlows.find(f => f.fromId === 'b' && f.toId === 'a');
    expect(aToB).toMatchObject({ amount: 1500, times: 2 });
    expect(bToA).toMatchObject({ amount: 2000, times: 1 });
  });

  test('deudas y pagadores', () => {
    expect(reports.debtSummary).toEqual({ totalOriginal: 1000, totalPaid: 1000, totalPending: 0, paidPercent: 100 });
    expect(reports.payers[0]).toMatchObject({ playerId: 'a', paidDebts: 1 });
    expect(reports.payers[0].avgDaysToPay).toBeCloseTo(1.5, 1);
  });

  test('temporadas y jugador del mes', () => {
    expect(reports.seasons[0]).toMatchObject({ sessions: 3, champion: { playerId: 'a', balance: 500 } });
    expect(reports.monthlyWinners[0]).toMatchObject({ month: '2026-01', playerId: 'a' });
  });

  test('con temporada filtra partidas y no arma resumen de temporadas', () => {
    const other = buildReports(sessions, debts, seasons, 's2');
    expect(other.totalSessions).toBe(0);
    expect(other.players).toHaveLength(0);
    expect(other.seasons).toHaveLength(0);
    expect(other.debtSummary.totalOriginal).toBe(0);
  });
});
