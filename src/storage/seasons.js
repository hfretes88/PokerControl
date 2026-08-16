/**
 * seasons.js — temporadas
 * Clave AsyncStorage: "poker_seasons"
 *
 * Una temporada agrupa partidas y resetea podio/estadísticas; las deudas
 * (poker_debts) y los ajustes manuales de jugador quedan siempre globales,
 * sin relación con la temporada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { genId, safeParse } from './id';

const SEASONS_KEY  = 'poker_seasons';
const SESSIONS_KEY = 'poker_sessions';

async function ensureInitialized() {
  const raw = await AsyncStorage.getItem(SEASONS_KEY);
  if (raw !== null) return safeParse(raw, []);

  // Primera vez con esta versión: migrar sesiones existentes a "Temporada 1".
  const sessionsRaw = await AsyncStorage.getItem(SESSIONS_KEY);
  const sessions = safeParse(sessionsRaw, []);
  const now = new Date().toISOString();
  const firstSeason = {
    id: genId(),
    name: 'Temporada 1',
    createdAt: now,
    closedAt: null,
    status: 'active',
  };

  if (sessions.length > 0) {
    const migrated = sessions.map(s => s.seasonId ? s : { ...s, seasonId: firstSeason.id });
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(migrated));
  }

  const seasons = [firstSeason];
  await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(seasons));
  return seasons;
}

export async function getSeasons() {
  const seasons = await ensureInitialized();
  return [...seasons].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getActiveSeason() {
  const seasons = await ensureInitialized();
  return seasons.find(s => s.status === 'active') || null;
}

/**
 * Crea una nueva temporada activa. Si había una temporada activa, se cierra
 * automáticamente (no hay reapertura ni botón de "cerrar" por separado).
 */
export async function createSeason(name) {
  const seasons = await ensureInitialized();
  const now = new Date().toISOString();
  const updated = seasons.map(s =>
    s.status === 'active' ? { ...s, status: 'closed', closedAt: now } : s
  );
  const newSeason = {
    id: genId(),
    name: name.trim(),
    createdAt: now,
    closedAt: null,
    status: 'active',
  };
  updated.push(newSeason);
  await AsyncStorage.setItem(SEASONS_KEY, JSON.stringify(updated));
  return newSeason;
}
