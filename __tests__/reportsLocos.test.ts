import { buildReports } from '../src/storage/reports';
import { buildAwards, awardsMessage, buildSections } from '../src/reports/reportSections';
import type { Session, Season, Participant } from '../src/storage/types';

const seasons: Season[] = [
  { id: 's1', name: 'Temporada 1', createdAt: '2026-01-01T00:00:00.000Z', closedAt: null, status: 'closed' },
  { id: 's2', name: 'Temporada 2', createdAt: '2026-02-01T00:00:00.000Z', closedAt: null, status: 'active' },
];

/** Jugador con compras a los minutos indicados desde las 21:00 y su resultado final. */
const p = (playerId: string, buyMinutes: number[], finalAmount: number, day: string): Participant => ({
  playerId,
  name: playerId.toUpperCase(),
  buys: buyMinutes.map(m => ({
    amount: 1000,
    timestamp: new Date(new Date(`${day}T21:00:00.000Z`).getTime() + m * 60000).toISOString(),
  })),
  finalAmount,
});

const session = (id: string, day: string, seasonId: string, participants: Participant[]): Session => ({
  id,
  name: `Partida ${id}`,
  createdAt: `${day}T21:00:00.000Z`,
  closedAt: `${day}T23:59:00.000Z`,
  status: 'closed',
  seasonId,
  participants,
});

// a gana siempre; b pierde salvo cuando falta c; c recompra tarde.
const sessions: Session[] = [
  session('1', '2026-01-02', 's1', [p('c', [0], 500, '2026-01-02'), p('a', [0], 1500, '2026-01-02'), p('b', [0], 1000, '2026-01-02')]),
  session('2', '2026-01-09', 's1', [p('a', [0], 2000, '2026-01-09'), p('b', [0, 30], 1000, '2026-01-09'), p('c', [0], 1000, '2026-01-09')]),
  session('3', '2026-01-16', 's1', [p('a', [0], 1500, '2026-01-16'), p('b', [0], 500, '2026-01-16'), p('c', [0, 200], 3000, '2026-01-16')]),
  session('4', '2026-01-23', 's1', [p('a', [0], 1200, '2026-01-23'), p('b', [0], 1800, '2026-01-23')]),
  session('5', '2026-01-30', 's1', [p('a', [0], 900, '2026-01-30'), p('b', [0], 1100, '2026-01-30')]),
  session('6', '2026-02-06', 's2', [p('b', [0, 10, 20], 5000, '2026-02-06'), p('c', [0], 0, '2026-02-06')]),
];

describe('carrera y mapa de calor', () => {
  const r = buildReports(sessions, [], seasons);

  test('acumula el balance por partida y deja null cuando no jugó', () => {
    expect(r.race.sessions.map(s => s.sessionId)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(r.race.cumulative.a).toEqual([500, 1500, 2000, 2200, 2100, 2100]);
    expect(r.race.nights.c).toEqual([-500, 0, 1000, null, null, -1000]);
  });

  test('ordena por acumulado final', () => {
    expect(r.race.players.map(x => x.playerId)).toEqual(['a', 'b', 'c']);
  });

  test('el color sigue al jugador según su primera partida, también filtrando por temporada', () => {
    const slots = Object.fromEntries(r.race.players.map(x => [x.playerId, x.slot]));
    expect(slots).toEqual({ c: 0, a: 1, b: 2 });
    const s2 = buildReports(sessions, [], seasons, 's2');
    expect(Object.fromEntries(s2.race.players.map(x => [x.playerId, x.slot]))).toEqual({ c: 0, b: 2 });
  });
});

describe('reportes locos', () => {
  const r = buildReports(sessions, [], seasons);

  test('medidor de tilt agrupa por cantidad de compras', () => {
    expect(r.tilt.map(t => [t.buys, t.orMore, t.games, t.wins])).toEqual([
      [1, false, 12, 6],
      [2, false, 2, 1],
      [3, false, 1, 1],
    ]);
  });

  test('tilt por jugador cuenta las noches con 3 o más compras', () => {
    const b = r.players.find(x => x.playerId === 'b')!;
    expect([b.tiltGames, b.tiltWins, b.tiltBalance]).toEqual([1, 1, 2000]);
  });

  test('efecto presencia compara con y sin el otro en la mesa', () => {
    const effect = r.presence.find(e => e.playerId === 'b' && e.withId === 'c')!;
    // b con c: 0, -1000, -500, +2000 → +125; sin c: +800, +100 → +450.
    expect(effect).toMatchObject({ gamesWith: 4, gamesWithout: 2, avgWith: 125, avgWithout: 450, diff: -325 });
  });

  test('las noches más locas ordenan por diferencia entre ganador y perdedor', () => {
    expect(r.crazyNights[0]).toMatchObject({ sessionId: '6', spread: 3000 });
    expect(r.crazyNights[0].winner.name).toBe('B');
  });

  test('ritmo de la noche cuenta solo recompras, por hora de partida', () => {
    expect(r.rebuysByGameHour.map(b => [b.label, b.count])).toEqual([
      ['1ª hora', 3], ['2ª hora', 0], ['3ª hora', 0], ['4ª hora', 1],
    ]);
    expect(r.lateRebuys).toMatchObject({ games: 1, wins: 1, avgBalance: 1000 });
  });

  test('día de la semana por jugador', () => {
    const a = r.players.find(x => x.playerId === 'a')!;
    expect(a.weekdays).toHaveLength(1);
    expect(a.weekdays[0]).toMatchObject({ label: 'Viernes', games: 5 });
  });

  test('premios y mensaje para compartir', () => {
    const awards = buildAwards(r);
    expect(awards.find(x => x.key === 'tiburon')?.name).toBe('A');
    expect(awards.find(x => x.key === 'fantasma')?.name).toBe('C');
    const msg = awardsMessage(awards, 'Temporada 1');
    expect(msg).toContain('Premios de Temporada 1');
    expect(msg).toContain('*El Tiburón*: A');
  });

  test('las pestañas nuevas arman sus secciones sin datos de deudas', () => {
    const kinds = buildSections('graficos', r).map(s => s.kind);
    expect(kinds).toEqual(['race', 'heatmap', 'share', 'bars', 'stats']);
    expect(buildSections('locos', r)[0].kind).toBe('awards');
  });
});
