import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SESSIONS: 'poker_sessions',
  PLAYERS: 'poker_players',
};

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
