/**
 * seasons.ts — temporadas
 * Clave AsyncStorage: "poker_seasons"
 *
 * Una temporada agrupa partidas y resetea podio/estadísticas; las deudas
 * (poker_debts) y los ajustes manuales de jugador quedan siempre globales,
 * sin relación con la temporada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { genId, safeParse } from './id';
import { withLock } from './lock';
import type { Season, Session } from './types';

const SEASONS_KEY  = 'poker_seasons';
const SESSIONS_KEY = 'poker_sessions';

async function ensureInitialized(): Promise<Season[]> {
  return withLock(SEASONS_KEY, async () => {
    const raw = await AsyncStorage.getItem(SEASONS_KEY);
    if (raw !== null) return safeParse<Season[]>(raw, []);

    // Primera vez con esta versión: migrar sesiones existentes a "Temporada 1".
    const firstSeason: Season = {
      id: genId(),
      name: 'Temporada 1',
      createdAt: new Date().toISOString(),
      closedAt: null,
      status: 'active',
    };

    await withLock(SESSIONS_KEY, async () => {
      const sessionsRaw = await AsyncStorage.getItem(SESSIONS_KEY);
      const sessions = safeParse<Session[]>(sessionsRaw, []);
      if (sessions.length > 0) {
        const migrated = sessions.map(s => s.seasonId ? s : { ...s, seasonId: firstSeason.id });
        await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(migrated));
      }
    });

    const seasons = [firstSeason];
    await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(seasons));
    return seasons;
  });
}

export async function getSeasons(): Promise<Season[]> {
  const seasons = await ensureInitialized();
  return [...seasons].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getActiveSeason(): Promise<Season | null> {
  const seasons = await ensureInitialized();
  return seasons.find(s => s.status === 'active') || null;
}

/**
 * Crea una nueva temporada activa. Si había una temporada activa, se cierra
 * automáticamente (no hay botón de "cerrar" por separado — ver reopenSeason
 * para volver a activar una ya cerrada).
 */
export async function createSeason(name: string): Promise<Season> {
  await ensureInitialized();
  return withLock(SEASONS_KEY, async () => {
    const seasons = safeParse<Season[]>(await AsyncStorage.getItem(SEASONS_KEY), []);
    const now = new Date().toISOString();
    const updated = seasons.map(s =>
      s.status === 'active' ? { ...s, status: 'closed' as const, closedAt: now } : s
    );
    const newSeason: Season = {
      id: genId(),
      name: name.trim(),
      createdAt: now,
      closedAt: null,
      status: 'active',
    };
    updated.push(newSeason);
    await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(updated));
    return newSeason;
  });
}

/**
 * Vuelve a marcar como activa una temporada cerrada, cerrando automáticamente
 * la que estuviera activa (mismo comportamiento que createSeason). No hace
 * falta para poder seguir agregando partidas a una temporada cerrada — eso
 * ya funciona igual, esto solo cambia cuál se muestra como "Activa".
 */
export async function reopenSeason(seasonId: string): Promise<Season[]> {
  await ensureInitialized();
  return withLock(SEASONS_KEY, async () => {
    const seasons = safeParse<Season[]>(await AsyncStorage.getItem(SEASONS_KEY), []);
    const target = seasons.find(s => s.id === seasonId);
    if (!target) throw new Error('Temporada no encontrada.');
    if (target.status === 'active') return seasons;

    const now = new Date().toISOString();
    const updated = seasons.map(s => {
      if (s.id === seasonId) return { ...s, status: 'active' as const, closedAt: null };
      if (s.status === 'active') return { ...s, status: 'closed' as const, closedAt: now };
      return s;
    });
    await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(updated));
    return updated;
  });
}

/**
 * Borra una temporada vacía (sin partidas). Si era la activa, no queda
 * ninguna activa hasta que se cree o reabra otra — la pantalla de
 * Temporadas maneja bien ese estado.
 */
export async function deleteSeason(seasonId: string): Promise<Season[]> {
  await ensureInitialized();
  return withLock(SEASONS_KEY, async () => {
    const seasons = safeParse<Season[]>(await AsyncStorage.getItem(SEASONS_KEY), []);
    const target = seasons.find(s => s.id === seasonId);
    if (!target) throw new Error('Temporada no encontrada.');

    const sessionsRaw = await AsyncStorage.getItem(SESSIONS_KEY);
    const sessions = safeParse<Session[]>(sessionsRaw, []);
    const hasSessions = sessions.some(s => s.seasonId === seasonId);
    if (hasSessions) {
      throw new Error('No se puede borrar: esta temporada tiene partidas.');
    }

    const updated = seasons.filter(s => s.id !== seasonId);
    await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(updated));
    return updated;
  });
}
