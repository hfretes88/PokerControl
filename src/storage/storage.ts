import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateDebtsFromSession, deleteDebtsForSession, getAllDebts, MANUAL_DEBT_SESSION_ID } from './debts';
import { genId, safeParse } from './id';
import { withLock } from './lock';
import type {
  Player, PlayerAdjustment, Session, Participant, DebtPlayerRef, DebtTransaction,
  ParticipantCalc, SessionCalc, PlayerHistoryEntry, PlayerStats, RankingEntry,
} from './types';

const KEYS = {
  SESSIONS: 'poker_sessions',
  PLAYERS: 'poker_players',
};

// ─── Jugadores ────────────────────────────────────────────────────────────────

export async function getPlayers(): Promise<Player[]> {
  const raw = await AsyncStorage.getItem(KEYS.PLAYERS);
  return safeParse<Player[]>(raw, []);
}

export async function savePlayer(name: string): Promise<Player> {
  return withLock(KEYS.PLAYERS, async () => {
    const players = await getPlayers();
    const newPlayer: Player = {
      id: genId(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    players.push(newPlayer);
    await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
    return newPlayer;
  });
}

export async function deletePlayer(playerId: string): Promise<void> {
  return withLock(KEYS.PLAYERS, async () => {
    const players = await getPlayers();
    const updated = players.filter(p => p.id !== playerId);
    await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(updated));
  });
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
  return safeParse<Session[]>(raw, []);
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const sessions = await getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

export async function createSession(name: string, seasonId?: string): Promise<Session> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const newSession: Session = {
      id: genId(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      status: 'active',
      seasonId,
      participants: [],
    };
    sessions.unshift(newSession);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return newSession;
  });
}

export interface SessionBuyEntry {
  player: DebtPlayerRef;
  amount: number;
}

/**
 * Crea una sesión con jugadores y sus compras iniciales en un solo paso.
 */
export async function createSessionWithBuys(name: string, entries: SessionBuyEntry[], seasonId?: string): Promise<Session> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const now = new Date().toISOString();
    const participants: Participant[] = entries
      .filter(e => e.player && e.amount > 0)
      .map(e => ({
        playerId: e.player.id,
        name: e.player.name,
        buys: [{ amount: Number(e.amount), timestamp: now }],
        finalAmount: null,
      }));

    const newSession: Session = {
      id: genId(),
      name: name.trim(),
      createdAt: now,
      status: 'active',
      seasonId,
      participants,
    };
    sessions.unshift(newSession);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return newSession;
  });
}

export async function getSessionsBySeason(seasonId: string): Promise<Session[]> {
  const sessions = await getSessions();
  return sessions.filter(s => s.seasonId === seasonId);
}

export async function closeSession(sessionId: string): Promise<Session | null> {
  const closedSession = await withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return null;
    sessions[idx].status = 'closed';
    sessions[idx].closedAt = new Date().toISOString();
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[idx];
  });
  if (!closedSession) return null;
  const debts = calcDebts(closedSession);
  await generateDebtsFromSession(closedSession, debts);
  return closedSession;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const updated = sessions.filter(s => s.id !== sessionId);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(updated));
  });
  await deleteDebtsForSession(sessionId);
}

// ─── Participantes ────────────────────────────────────────────────────────────

export async function addParticipant(sessionId: string, player: DebtPlayerRef): Promise<Session | null> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return null;
    const alreadyIn = sessions[idx].participants.some(p => p.playerId === player.id);
    if (alreadyIn) return sessions[idx];
    sessions[idx].participants.push({
      playerId: player.id,
      name: player.name,
      buys: [],
      finalAmount: null,
    });
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[idx];
  });
}

export async function removeParticipant(sessionId: string, playerId: string): Promise<Session | null> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx === -1) return null;
    sessions[idx].participants = sessions[idx].participants.filter(p => p.playerId !== playerId);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[idx];
  });
}

export async function addBuy(sessionId: string, playerId: string, amount: number): Promise<Session | null> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx === -1) return null;
    const pIdx = sessions[sIdx].participants.findIndex(p => p.playerId === playerId);
    if (pIdx === -1) return null;
    sessions[sIdx].participants[pIdx].buys.push({
      amount: Number(amount),
      timestamp: new Date().toISOString(),
    });
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[sIdx];
  });
}

export async function removeBuy(sessionId: string, playerId: string, buyIndex: number): Promise<Session | null> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx === -1) return null;
    const pIdx = sessions[sIdx].participants.findIndex(p => p.playerId === playerId);
    if (pIdx === -1) return null;
    sessions[sIdx].participants[pIdx].buys.splice(buyIndex, 1);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[sIdx];
  });
}

export async function setFinalAmount(sessionId: string, playerId: string, amount: number): Promise<Session | null> {
  return withLock(KEYS.SESSIONS, async () => {
    const sessions = await getSessions();
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx === -1) return null;
    const pIdx = sessions[sIdx].participants.findIndex(p => p.playerId === playerId);
    if (pIdx === -1) return null;
    sessions[sIdx].participants[pIdx].finalAmount = Number(amount);
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    return sessions[sIdx];
  });
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

export function calcParticipant(participant: Participant): ParticipantCalc {
  const totalBought = participant.buys.reduce((sum, b) => sum + b.amount, 0);
  const finalAmount = participant.finalAmount ?? 0;
  const balance = finalAmount - totalBought;
  return { totalBought, finalAmount, balance };
}

export function calcSession(session: Session): SessionCalc {
  const totalPot = session.participants.reduce((sum, p) =>
    sum + p.buys.reduce((s, b) => s + b.amount, 0), 0);
  const totalOut = session.participants.reduce((sum, p) =>
    sum + (p.finalAmount ?? 0), 0);
  const diff = totalOut - totalPot;
  const status = diff === 0 ? 'ok' : diff < 0 ? 'faltan' : 'sobran';
  return { totalPot, totalOut, diff, status };
}

/**
 * Calcula quién le debe a quién usando el algoritmo de deudas mínimas.
 * Retorna array de { from, to, amount } solo para partidas cerradas con todos los resultados.
 */
export function calcDebts(session: Session): DebtTransaction[] {
  const balances = session.participants
    .filter(p => p.finalAmount !== null)
    .map(p => {
      const totalBought = p.buys.reduce((sum, b) => sum + b.amount, 0);
      const balance = (p.finalAmount ?? 0) - totalBought;
      return { id: p.playerId, name: p.name, balance };
    });

  if (balances.length === 0) return [];

  const debtors   = balances
    .filter(b => b.balance < 0)
    .map(b => ({ ...b, balance: Math.abs(b.balance) }));
  const creditors = balances
    .filter(b => b.balance > 0)
    .map(b => ({ ...b }));

  const transactions: DebtTransaction[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].balance, creditors[j].balance);
    if (amount > 0.5) {
      transactions.push({
        from:   debtors[i].name,
        fromId: debtors[i].id,
        to:     creditors[j].name,
        toId:   creditors[j].id,
        amount: Math.round(amount),
      });
    }
    debtors[i].balance   -= amount;
    creditors[j].balance -= amount;
    if (debtors[i].balance < 0.5)   i++;
    if (creditors[j].balance < 0.5) j++;
  }
  return transactions;
}


/**
 * Historial de un jugador a través de todas las sesiones cerradas.
 * Si se pasa seasonId, se limita a las sesiones de esa temporada.
 */
export async function getPlayerHistory(playerId: string, seasonId?: string): Promise<PlayerHistoryEntry[]> {
  const sessions = await getSessions();
  const closed = sessions.filter(s =>
    s.status === 'closed' && (!seasonId || s.seasonId === seasonId)
  );

  return closed
    .map((s): PlayerHistoryEntry | null => {
      const participant = s.participants.find(p => p.playerId === playerId);
      if (!participant || participant.finalAmount === null) return null;
      const { totalBought, finalAmount, balance } = calcParticipant(participant);
      return {
        sessionId: s.id,
        sessionName: s.name,
        date: s.closedAt || s.createdAt,
        totalBought,
        finalAmount,
        balance,
      };
    })
    .filter((h): h is PlayerHistoryEntry => h !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Ajustes manuales ────────────────────────────────────────────────────────

export interface AdjustmentInput {
  description: string;
  amount: number;
}

export async function addPlayerAdjustment(playerId: string, { description, amount }: AdjustmentInput): Promise<Player | null> {
  return withLock(KEYS.PLAYERS, async () => {
    const players = await getPlayers();
    const idx = players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;
    if (!players[idx].adjustments) players[idx].adjustments = [];
    const newAdjustment: PlayerAdjustment = {
      id: genId(),
      description: description.trim(),
      amount: Number(amount),
      date: new Date().toISOString(),
    };
    players[idx].adjustments!.push(newAdjustment);
    await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
    return players[idx];
  });
}

export async function deletePlayerAdjustment(playerId: string, adjustmentId: string): Promise<Player | null> {
  return withLock(KEYS.PLAYERS, async () => {
    const players = await getPlayers();
    const idx = players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;
    players[idx].adjustments = (players[idx].adjustments || []).filter(a => a.id !== adjustmentId);
    await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
    return players[idx];
  });
}

export async function updatePlayerAdjustment(
  playerId: string, adjustmentId: string, { description, amount }: AdjustmentInput
): Promise<Player | null> {
  return withLock(KEYS.PLAYERS, async () => {
    const players = await getPlayers();
    const idx = players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;
    const adjustments = players[idx].adjustments || [];
    const adjIdx = adjustments.findIndex(a => a.id === adjustmentId);
    if (adjIdx === -1) return null;
    adjustments[adjIdx] = { ...adjustments[adjIdx], description: description.trim(), amount: Number(amount) };
    players[idx].adjustments = adjustments;
    await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
    return players[idx];
  });
}

/**
 * Stats de un jugador. Si se pasa seasonId, las partidas (history, wins,
 * bestGame, etc.) se limitan a esa temporada; los ajustes manuales son
 * siempre globales, no tienen temporada.
 */
export async function getPlayerStats(playerId: string, seasonId?: string): Promise<PlayerStats | null> {
  const history = await getPlayerHistory(playerId, seasonId);
  const players = await getPlayers();
  const player = players.find(p => p.id === playerId);
  const adjustments = (player?.adjustments || [])
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const adjustmentsTotal = adjustments.reduce((sum, a) => sum + a.amount, 0);

  const allDebts = await getAllDebts();
  const manualDebtsNet = allDebts
    .filter(d => d.sessionId === MANUAL_DEBT_SESSION_ID && d.status !== 'paid')
    .reduce((sum, d) => {
      if (d.toPlayer.id === playerId) return sum + d.pendingAmount;
      if (d.fromPlayer.id === playerId) return sum - d.pendingAmount;
      return sum;
    }, 0);

  if (history.length === 0 && adjustments.length === 0 && manualDebtsNet === 0) return null;

  const wins = history.filter(h => h.balance > 0).length;
  const losses = history.filter(h => h.balance < 0).length;
  const ties = history.filter(h => h.balance === 0).length;
  const bestGame = history.length > 0
    ? history.reduce((best, h) => h.balance > best.balance ? h : best, history[0])
    : null;
  const worstGame = history.length > 0
    ? history.reduce((worst, h) => h.balance < worst.balance ? h : worst, history[0])
    : null;
  const sessionBalance = history.reduce((sum, h) => sum + h.balance, 0);

  return {
    totalGames: history.length,
    wins,
    losses,
    ties,
    winRate: history.length > 0 ? Math.round((wins / history.length) * 100) : 0,
    totalBalance: sessionBalance + adjustmentsTotal + manualDebtsNet,
    sessionBalance,
    adjustmentsTotal,
    manualDebtsNet,
    adjustments,
    bestGame,
    worstGame,
    history,
  };
}

// ─── Ranking global ───────────────────────────────────────────────────────────

/**
 * Ranking de jugadores. Sin seasonId: histórico total, ordenado por
 * totalBalance (incluye ajustes manuales), solo jugadores con al menos
 * una partida cerrada o un ajuste — comportamiento sin cambios.
 * Con seasonId: ranking de esa temporada, ordenado por sessionBalance
 * (resultado puro de las partidas, sin ajustes globales) y solo incluye
 * jugadores que jugaron al menos una partida en esa temporada.
 */
export async function getGlobalRanking(seasonId?: string): Promise<RankingEntry[]> {
  const players = await getPlayers();
  const results = await Promise.all(
    players.map(async (p): Promise<RankingEntry | null> => {
      const stats = await getPlayerStats(p.id, seasonId);
      if (!stats) return null;
      if (seasonId && stats.totalGames === 0) return null;
      return { playerId: p.id, name: p.name, ...stats };
    })
  );
  const ranked = results.filter((r): r is RankingEntry => r !== null);
  return seasonId
    ? ranked.sort((a, b) => b.sessionBalance - a.sessionBalance || b.totalGames - a.totalGames)
    : ranked.sort((a, b) => b.totalBalance - a.totalBalance || b.totalGames - a.totalGames);
}

// ─── Helpers para compartir ───────────────────────────────────────────────────

export function buildWhatsAppSummary(session: Session): string {
  const date = new Date(session.createdAt).toLocaleDateString('es-AR');
  let text = `🃏 *${session.name}* — ${date}\n\n`;

  const sorted = [...session.participants].sort((a, b) => {
    const { balance: bA } = calcParticipant(a);
    const { balance: bB } = calcParticipant(b);
    return bB - bA;
  });

  sorted.forEach(p => {
    const { balance } = calcParticipant(p);
    if (p.finalAmount === null) {
      text += `👤 ${p.name}: sin resultado\n`;
    } else {
      const emoji = balance > 0 ? '🏆' : balance < 0 ? '💸' : '🤝';
      const sign = balance > 0 ? '+' : '';
      text += `${emoji} ${p.name}: ${sign}${balance.toLocaleString('es-AR')}$\n`;
    }
  });

  const debts = calcDebts(session);
  if (debts.length > 0) {
    text += `\n💳 *Pagos pendientes:*\n`;
    debts.forEach(d => {
      text += `• ${d.from} le paga $${d.amount.toLocaleString('es-AR')} a ${d.to}\n`;
    });
  }

  text += `\n📊 Pozo total: $${session.participants.reduce((sum, p) => sum + p.buys.reduce((s, b) => s + b.amount, 0), 0).toLocaleString('es-AR')}`;
  return text;
}
