import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSeasons, getActiveSeason, createSeason, deleteSeason, reopenSeason } from '../seasons';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('inicialización', () => {
  it('crea "Temporada 1" activa cuando no hay temporadas ni sesiones', async () => {
    const seasons = await getSeasons();
    expect(seasons).toHaveLength(1);
    expect(seasons[0]).toMatchObject({ name: 'Temporada 1', status: 'active' });
  });

  it('migra sesiones existentes sin seasonId a "Temporada 1"', async () => {
    const oldSessions = [
      { id: 's1', name: 'Vieja 1', createdAt: '2025-01-01T00:00:00.000Z', status: 'closed', participants: [] },
      { id: 's2', name: 'Vieja 2', createdAt: '2025-01-02T00:00:00.000Z', status: 'closed', participants: [] },
    ];
    await AsyncStorage.setItem('poker_sessions', JSON.stringify(oldSessions));

    const seasons = await getSeasons();
    expect(seasons).toHaveLength(1);

    const migrated = JSON.parse(await AsyncStorage.getItem('poker_sessions'));
    expect(migrated.every(s => s.seasonId === seasons[0].id)).toBe(true);
  });

  it('no vuelve a migrar ni duplica temporadas en llamadas siguientes', async () => {
    await getSeasons();
    const again = await getSeasons();
    expect(again).toHaveLength(1);
  });

  it('getActiveSeason siempre devuelve una temporada después de inicializar', async () => {
    const active = await getActiveSeason();
    expect(active).not.toBeNull();
    expect(active.status).toBe('active');
  });
});

describe('createSeason', () => {
  it('crea la nueva temporada como activa', async () => {
    const created = await createSeason('Temporada de verano');
    expect(created.status).toBe('active');
    expect(created.name).toBe('Temporada de verano');
  });

  it('cierra automáticamente la temporada activa anterior', async () => {
    const first = await getActiveSeason(); // fuerza init -> "Temporada 1"
    const second = await createSeason('Temporada 2');

    const seasons = await getSeasons();
    const closedFirst = seasons.find(s => s.id === first.id);
    const activeSecond = seasons.find(s => s.id === second.id);

    expect(closedFirst.status).toBe('closed');
    expect(closedFirst.closedAt).not.toBeNull();
    expect(activeSecond.status).toBe('active');
  });

  it('nunca deja más de una temporada activa', async () => {
    await createSeason('A');
    await createSeason('B');
    await createSeason('C');

    const seasons = await getSeasons();
    const activeOnes = seasons.filter(s => s.status === 'active');
    expect(activeOnes).toHaveLength(1);
    expect(activeOnes[0].name).toBe('C');
  });

  it('recorta espacios en el nombre', async () => {
    const created = await createSeason('  Con espacios  ');
    expect(created.name).toBe('Con espacios');
  });
});

describe('deleteSeason', () => {
  it('borra una temporada sin partidas', async () => {
    const created = await createSeason('Para borrar');
    await deleteSeason(created.id);

    const seasons = await getSeasons();
    expect(seasons.find(s => s.id === created.id)).toBeUndefined();
  });

  it('lanza error si la temporada tiene partidas', async () => {
    const created = await createSeason('Con partidas');
    const sessions = [
      { id: 's1', name: 'Partida', createdAt: '2025-01-01T00:00:00.000Z', status: 'closed', participants: [], seasonId: created.id },
    ];
    await AsyncStorage.setItem('poker_sessions', JSON.stringify(sessions));

    await expect(deleteSeason(created.id)).rejects.toThrow(/partidas/i);

    const seasons = await getSeasons();
    expect(seasons.find(s => s.id === created.id)).toBeDefined();
  });

  it('lanza error si la temporada no existe', async () => {
    await getSeasons();
    await expect(deleteSeason('inexistente')).rejects.toThrow(/no encontrada/i);
  });

  it('borrar la temporada activa deja sin ninguna activa', async () => {
    const active = await getActiveSeason();
    await deleteSeason(active.id);

    const seasons = await getSeasons();
    expect(seasons.filter(s => s.status === 'active')).toHaveLength(0);
  });
});

describe('reopenSeason', () => {
  it('reactiva una temporada cerrada y cierra la que estaba activa', async () => {
    const first = await getActiveSeason(); // "Temporada 1"
    const second = await createSeason('Temporada 2'); // cierra la primera, queda activa

    await reopenSeason(first.id);

    const seasons = await getSeasons();
    const reopened = seasons.find(s => s.id === first.id);
    const closedSecond = seasons.find(s => s.id === second.id);

    expect(reopened.status).toBe('active');
    expect(reopened.closedAt).toBeNull();
    expect(closedSecond.status).toBe('closed');
  });

  it('no hace nada si la temporada ya está activa', async () => {
    const active = await getActiveSeason();
    await reopenSeason(active.id);

    const seasons = await getSeasons();
    expect(seasons.filter(s => s.status === 'active')).toHaveLength(1);
    expect(seasons.find(s => s.id === active.id).status).toBe('active');
  });

  it('lanza error si la temporada no existe', async () => {
    await getSeasons();
    await expect(reopenSeason('inexistente')).rejects.toThrow(/no encontrada/i);
  });
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('getSeasons orden', () => {
  it('devuelve las temporadas más nuevas primero', async () => {
    await getSeasons(); // fuerza init -> "Temporada 1"
    await wait(5); // asegura createdAt distinto entre temporadas
    await createSeason('Segunda');
    await wait(5);
    await createSeason('Tercera');
    const seasons = await getSeasons();
    expect(seasons.map(s => s.name)).toEqual(['Tercera', 'Segunda', 'Temporada 1']);
  });
});
