import AsyncStorage from '@react-native-async-storage/async-storage';
import { savePlayer, getPlayerStats, getGlobalRanking } from '../storage';
import { addManualDebt, registerPayment } from '../debts';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getPlayerStats con deudas previas (manualDebtsNet)', () => {
  it('suma al que le deben y resta al que debe', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 100, description: 'Deuda vieja' });

    const anaStats = await getPlayerStats(ana.id);
    const betoStats = await getPlayerStats(beto.id);
    expect(anaStats.manualDebtsNet).toBe(100);
    expect(anaStats.totalBalance).toBe(100);
    expect(betoStats.manualDebtsNet).toBe(-100);
    expect(betoStats.totalBalance).toBe(-100);
  });

  it('baja a medida que se registra un pago parcial', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 100 });

    await registerPayment(debt.id, 40);

    const anaStats = await getPlayerStats(ana.id);
    expect(anaStats.manualDebtsNet).toBe(60);
    expect(anaStats.totalBalance).toBe(60);
  });

  it('llega a 0 y deja de contar una vez saldada', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    const maxi = await savePlayer('Maxi');
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 100 });
    // Otra deuda pendiente distinta para que Ana no quede sin nada que mostrar
    await addManualDebt({ fromPlayer: maxi, toPlayer: ana, amount: 20 });

    await registerPayment(debt.id, 100);

    const anaStats = await getPlayerStats(ana.id);
    expect(anaStats.manualDebtsNet).toBe(20);
  });

  it('un jugador con la única deuda ya saldada y sin nada más vuelve a no aparecer', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 100 });

    await registerPayment(debt.id, 100);

    expect(await getPlayerStats(ana.id)).toBeNull();
  });

  it('un jugador sin partidas ni ajustes pero con deuda previa aparece igual en stats y ranking', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 50 });

    const anaStats = await getPlayerStats(ana.id);
    expect(anaStats).not.toBeNull();
    expect(anaStats.totalGames).toBe(0);
    expect(anaStats.totalBalance).toBe(50);

    const ranking = await getGlobalRanking();
    expect(ranking.find(r => r.name === 'Ana').totalBalance).toBe(50);
  });

  it('es independiente de la temporada: no cambia al pasar seasonId', async () => {
    const ana = await savePlayer('Ana');
    const beto = await savePlayer('Beto');
    await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 100 });

    const scoped = await getPlayerStats(ana.id, 'alguna-temporada');
    expect(scoped.manualDebtsNet).toBe(100);
  });
});
