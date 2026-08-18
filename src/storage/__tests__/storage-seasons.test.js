import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  savePlayer,
  createSessionWithBuys,
  getSessionsBySeason,
  setFinalAmount,
  closeSession,
  getPlayerHistory,
  getPlayerStats,
  getGlobalRanking,
  addPlayerAdjustment,
  updatePlayerAdjustment,
} from '../storage';

const SEASON_A = 'season-a';
const SEASON_B = 'season-b';

beforeEach(async () => {
  await AsyncStorage.clear();
});

async function playCompleteSession(seasonId, playerRows) {
  // playerRows: [{ player, buy, final }]
  const entries = playerRows.map(r => ({ player: r.player, amount: r.buy }));
  const session = await createSessionWithBuys('Partida', entries, seasonId);
  for (const r of playerRows) {
    await setFinalAmount(session.id, r.player.id, r.final);
  }
  return closeSession(session.id);
}

describe('getSessionsBySeason', () => {
  it('filtra sesiones por temporada', async () => {
    const ana = await savePlayer('Ana');
    await playCompleteSession(SEASON_A, [{ player: ana, buy: 100, final: 150 }]);
    await playCompleteSession(SEASON_B, [{ player: ana, buy: 100, final: 50 }]);

    const seasonASessions = await getSessionsBySeason(SEASON_A);
    const seasonBSessions = await getSessionsBySeason(SEASON_B);
    expect(seasonASessions).toHaveLength(1);
    expect(seasonBSessions).toHaveLength(1);
    expect(seasonASessions[0].seasonId).toBe(SEASON_A);
  });
});

describe('getPlayerHistory con seasonId', () => {
  it('limita el historial a las partidas de esa temporada', async () => {
    const ana = await savePlayer('Ana');
    await playCompleteSession(SEASON_A, [{ player: ana, buy: 100, final: 150 }]);
    await playCompleteSession(SEASON_B, [{ player: ana, buy: 100, final: 50 }]);

    const historyA = await getPlayerHistory(ana.id, SEASON_A);
    const historyAll = await getPlayerHistory(ana.id);
    expect(historyA).toHaveLength(1);
    expect(historyA[0].balance).toBe(50);
    expect(historyAll).toHaveLength(2);
  });
});

describe('getPlayerStats con seasonId', () => {
  it('las partidas quedan acotadas a la temporada, los ajustes siguen globales', async () => {
    const ana = await savePlayer('Ana');
    await playCompleteSession(SEASON_A, [{ player: ana, buy: 100, final: 150 }]); // +50
    await playCompleteSession(SEASON_B, [{ player: ana, buy: 100, final: 50 }]);  // -50
    await addPlayerAdjustment(ana.id, { description: 'Deuda vieja', amount: -20 });

    const statsA = await getPlayerStats(ana.id, SEASON_A);
    expect(statsA.totalGames).toBe(1);
    expect(statsA.sessionBalance).toBe(50);
    expect(statsA.adjustmentsTotal).toBe(-20); // ajuste global, no se filtra
    expect(statsA.totalBalance).toBe(30); // 50 - 20

    const statsAll = await getPlayerStats(ana.id);
    expect(statsAll.totalGames).toBe(2);
    expect(statsAll.sessionBalance).toBe(0); // +50 y -50
    expect(statsAll.totalBalance).toBe(-20);
  });

  it('devuelve stats con 0 partidas si el jugador solo tiene ajustes en esa temporada', async () => {
    const ana = await savePlayer('Ana');
    await addPlayerAdjustment(ana.id, { description: 'Cobro viejo', amount: 40 });

    const statsA = await getPlayerStats(ana.id, SEASON_A);
    expect(statsA).not.toBeNull();
    expect(statsA.totalGames).toBe(0);
    expect(statsA.totalBalance).toBe(40);
  });
});

describe('updatePlayerAdjustment', () => {
  it('actualiza descripción y monto de un ajuste existente', async () => {
    const ana = await savePlayer('Ana');
    const updated = await addPlayerAdjustment(ana.id, { description: 'Deuda vieja', amount: -20 });
    const adjId = updated.adjustments[0].id;

    await updatePlayerAdjustment(ana.id, adjId, { description: 'Deuda corregida', amount: 30 });

    const stats = await getPlayerStats(ana.id);
    expect(stats.adjustments).toHaveLength(1);
    expect(stats.adjustments[0].description).toBe('Deuda corregida');
    expect(stats.adjustments[0].amount).toBe(30);
    expect(stats.adjustmentsTotal).toBe(30);
  });

  it('no rompe nada si el ajuste no existe', async () => {
    const ana = await savePlayer('Ana');
    const result = await updatePlayerAdjustment(ana.id, 'inexistente', { description: 'x', amount: 1 });
    expect(result).toBeNull();
  });
});

describe('getGlobalRanking con seasonId', () => {
  it('solo incluye jugadores con partidas en esa temporada y ordena por sessionBalance', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');

    // Temporada A: Ana gana, Beto pierde
    await playCompleteSession(SEASON_A, [
      { player: ana, buy: 100, final: 150 },
      { player: beto, buy: 100, final: 50 },
    ]);
    // Temporada B: solo juega Beto
    await playCompleteSession(SEASON_B, [{ player: beto, buy: 100, final: 200 }]);
    // Ajuste global grande para Beto, no debería alterar el podio de temporada A
    await addPlayerAdjustment(beto.id, { description: 'Cobro viejo', amount: 10000 });

    const rankingA = await getGlobalRanking(SEASON_A);
    expect(rankingA.map(r => r.name)).toEqual(['Ana', 'Beto']);
    expect(rankingA.find(r => r.name === 'Beto').sessionBalance).toBe(-50);

    const rankingB = await getGlobalRanking(SEASON_B);
    expect(rankingB.map(r => r.name)).toEqual(['Beto']); // Ana no jugó en B

    const rankingAll = await getGlobalRanking();
    expect(rankingAll[0].name).toBe('Beto'); // el ajuste global lo pone primero en histórico
  });
});
