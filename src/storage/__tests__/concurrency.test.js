import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePlayer, getPlayers, createSessionWithBuys, addBuy, getSession } from '../storage';
import { addManualDebt, getAllDebts } from '../debts';
import { createSeason, getSeasons } from '../seasons';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('operaciones concurrentes sobre la misma clave', () => {
  it('dos savePlayer en paralelo no se pisan entre sí', async () => {
    await Promise.all([savePlayer('Ana'), savePlayer('Beto')]);
    const players = await getPlayers();
    expect(players.map(p => p.name).sort()).toEqual(['Ana', 'Beto']);
  });

  it('dos addBuy en paralelo sobre la misma sesión no se pisan entre sí', async () => {
    const ana = await savePlayer('Ana');
    const session = await createSessionWithBuys('Partida', [{ player: ana, amount: 100 }]);

    await Promise.all([
      addBuy(session.id, ana.id, 50),
      addBuy(session.id, ana.id, 70),
    ]);

    const updated = await getSession(session.id);
    const buys = updated.participants[0].buys;
    expect(buys.map(b => b.amount).sort((a, b) => a - b)).toEqual([50, 70, 100]);
  });

  it('dos addManualDebt en paralelo no se pisan entre sí', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    const caro = await savePlayer('Caro');

    await Promise.all([
      addManualDebt({ fromPlayer: ana, toPlayer: beto, amount: 1000, description: 'Deuda 1' }),
      addManualDebt({ fromPlayer: ana, toPlayer: caro, amount: 2000, description: 'Deuda 2' }),
    ]);

    const debts = await getAllDebts();
    expect(debts).toHaveLength(2);
  });

  it('dos createSeason en paralelo dejan una sola temporada activa', async () => {
    await getSeasons(); // fuerza init -> "Temporada 1"
    await Promise.all([createSeason('A'), createSeason('B')]);

    const seasons = await getSeasons();
    const activeOnes = seasons.filter(s => s.status === 'active');
    expect(activeOnes).toHaveLength(1);
    expect(seasons.map(s => s.name).sort()).toEqual(['A', 'B', 'Temporada 1']);
  });
});
