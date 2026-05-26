import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SESSIONS: 'poker_sessions',
  PLAYERS: 'poker_players',
};

// ─── Jugadores ────────────────────────────────────────────────────────────────

export async function getPlayers() {
  const raw = await AsyncStorage.getItem(KEYS.PLAYERS);
  return raw ? JSON.parse(raw) : [];
}

export async function savePlayer(name) {
  const players = await getPlayers();
  const newPlayer = {
    id: Date.now().toString(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  players.push(newPlayer);
  await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(players));
  return newPlayer;
}

export async function deletePlayer(playerId) {
  const players = await getPlayers();
  const updated = players.filter(p => p.id !== playerId);
  await AsyncStorage.setItem(KEYS.PLAYERS, JSON.stringify(updated));
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

export async function getSessions() {
  const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
  return raw ? JSON.parse(raw) : [];
}

export async function getSession(sessionId) {
  const sessions = await getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

export async function createSession(name) {
  const sessions = await getSessions();
  const newSession = {
    id: Date.now().toString(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
    status: 'active',
    participants: [],
  };
  sessions.unshift(newSession);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return newSession;
}

/**
 * Crea una sesión con jugadores y sus compras iniciales en un solo paso.
 * entries: [{ player: { id, name }, amount: number }]
 */
export async function createSessionWithBuys(name, entries) {
  const sessions = await getSessions();
  const now = new Date().toISOString();
  const participants = entries
    .filter(e => e.player && e.amount > 0)
    .map(e => ({
      playerId: e.player.id,
      name: e.player.name,
      buys: [{ amount: Number(e.amount), timestamp: now }],
      finalAmount: null,
    }));

  const newSession = {
    id: Date.now().toString(),
    name: name.trim(),
    createdAt: now,
    status: 'active',
    participants,
  };
  sessions.unshift(newSession);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return newSession;
}

export async function closeSession(sessionId) {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return null;
  sessions[idx].status = 'closed';
  sessions[idx].closedAt = new Date().toISOString();
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return sessions[idx];
}

export async function deleteSession(sessionId) {
  const sessions = await getSessions();
  const updated = sessions.filter(s => s.id !== sessionId);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(updated));
}

// ─── Participantes ────────────────────────────────────────────────────────────

export async function addParticipant(sessionId, player) {
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
}

export async function removeParticipant(sessionId, playerId) {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return null;
  sessions[idx].participants = sessions[idx].participants.filter(p => p.playerId !== playerId);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return sessions[idx];
}

export async function addBuy(sessionId, playerId, amount) {
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
}

export async function removeBuy(sessionId, playerId, buyIndex) {
  const sessions = await getSessions();
  const sIdx = sessions.findIndex(s => s.id === sessionId);
  if (sIdx === -1) return null;
  const pIdx = sessions[sIdx].participants.findIndex(p => p.playerId === playerId);
  if (pIdx === -1) return null;
  sessions[sIdx].participants[pIdx].buys.splice(buyIndex, 1);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return sessions[sIdx];
}

export async function setFinalAmount(sessionId, playerId, amount) {
  const sessions = await getSessions();
  const sIdx = sessions.findIndex(s => s.id === sessionId);
  if (sIdx === -1) return null;
  const pIdx = sessions[sIdx].participants.findIndex(p => p.playerId === playerId);
  if (pIdx === -1) return null;
  sessions[sIdx].participants[pIdx].finalAmount = Number(amount);
  await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
  return sessions[sIdx];
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

export function calcParticipant(participant) {
  const totalBought = participant.buys.reduce((sum, b) => sum + b.amount, 0);
  const finalAmount = participant.finalAmount ?? 0;
  const balance = finalAmount - totalBought;
  return { totalBought, finalAmount, balance };
}

export function calcSession(session) {
  const totalPot = session.participants.reduce((sum, p) =>
    sum + p.buys.reduce((s, b) => s + b.amount, 0), 0);
  const totalOut = session.participants.reduce((sum, p) =>
    sum + (p.finalAmount ?? 0), 0);
  return { totalPot, totalOut, diff: totalOut - totalPot };
}

/**
 * Calcula quién le debe a quién usando el algoritmo de deudas mínimas.
 * Retorna array de { from, to, amount } solo para partidas cerradas con todos los resultados.
 */
export function calcDebts(session) {
  const balances = session.participants
    .filter(p => p.finalAmount !== null)
    .map(p => {
      const { balance } = calcParticipant(p);
      return { name: p.name, balance };
    });

  if (balances.length === 0) return [];

  // Separamos deudores (balance negativo) y acreedores (balance positivo)
  const debtors = balances.filter(b => b.balance < 0).map(b => ({ ...b, balance: Math.abs(b.balance) }));
  const creditors = balances.filter(b => b.balance > 0).map(b => ({ ...b }));

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].balance, creditors[j].balance);
    if (amount > 0.5) { // ignoramos diferencias de centavos
      transactions.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(amount),
      });
    }
    debtors[i].balance -= amount;
    creditors[j].balance -= amount;
    if (debtors[i].balance < 0.5) i++;
    if (creditors[j].balance < 0.5) j++;
  }

  return transactions;
}

/**
 * Historial de un jugador a través de todas las sesiones cerradas.
 */
export async function getPlayerHistory(playerId) {
  const sessions = await getSessions();
  const closed = sessions.filter(s => s.status === 'closed');

  return closed
    .map(s => {
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
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Stats globales de un jugador.
 */
export async function getPlayerStats(playerId) {
  const history = await getPlayerHistory(playerId);
  if (history.length === 0) return null;

  const totalBalance = history.reduce((sum, h) => sum + h.balance, 0);
  const wins = history.filter(h => h.balance > 0).length;
  const losses = history.filter(h => h.balance < 0).length;
  const bestGame = history.reduce((best, h) => h.balance > best.balance ? h : best, history[0]);
  const worstGame = history.reduce((worst, h) => h.balance < worst.balance ? h : worst, history[0]);

  return {
    totalGames: history.length,
    wins,
    losses,
    winRate: Math.round((wins / history.length) * 100),
    totalBalance,
    bestGame,
    worstGame,
    history,
  };
}

// ─── Helpers para compartir ───────────────────────────────────────────────────

export function buildWhatsAppSummary(session) {
  const date = new Date(session.createdAt).toLocaleDateString('es-AR');
  let text = `🃏 *${session.name}* — ${date}\n\n`;

  const sorted = [...session.participants].sort((a, b) => {
    const { balance: bA } = calcParticipant(a);
    const { balance: bB } = calcParticipant(b);
    return bB - bA;
  });

  sorted.forEach(p => {
    const { totalBought, finalAmount, balance } = calcParticipant(p);
    if (p.finalAmount === null) {
      text += `👤 ${p.name}: sin resultado\n`;
    } else {
      const emoji = balance > 0 ? '🏆' : balance < 0 ? '💸' : '🤝';
      const sign = balance > 0 ? '+' : '';
      text += `${emoji} ${p.name}: ${sign}$${balance.toLocaleString('es-AR')}\n`;
      text += `   Invertido: $${totalBought.toLocaleString('es-AR')} → Final: $${finalAmount.toLocaleString('es-AR')}\n`;
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
