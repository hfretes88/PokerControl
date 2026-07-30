/**
 * debts.js — módulo de manejo de deudas
 * Clave AsyncStorage: "poker_debts"
 * Clave backup:       "poker_debts_backup"
 *
 * Flujo de reorganización:
 * 1. reNetAllDebts()  → guarda backup, netea y devuelve { canUndo: true }
 * 2. undoReNet()      → restaura backup si no hay pagos sobre consolidadas
 * 3. canUndoReNet()   → true si hay backup y ninguna deuda consolidada tiene pagos
 * 4. Al cerrar nueva partida → se borra el backup (nueva reorganización disponible)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBTS_KEY   = 'poker_debts';
const BACKUP_KEY  = 'poker_debts_backup';

// ─── Lectura ──────────────────────────────────────────────────

export async function getAllDebts() {
  const raw = await AsyncStorage.getItem(DEBTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getPendingDebts() {
  const debts = await getAllDebts();
  return debts.filter(d => d.status !== 'paid');
}

export async function getPendingDebtsByDebtor() {
  const debts = await getPendingDebts();
  const map = {};
  debts.forEach(d => {
    const key = d.fromPlayer.id;
    if (!map[key]) map[key] = { player: d.fromPlayer, debts: [], totalPending: 0 };
    map[key].debts.push(d);
    map[key].totalPending += d.pendingAmount;
  });
  return Object.values(map).sort((a, b) => b.totalPending - a.totalPending);
}

export async function getDebtsForPlayer(playerId) {
  const debts = await getAllDebts();
  return {
    owes: debts.filter(d => d.fromPlayer.id === playerId),
    owed: debts.filter(d => d.toPlayer.id === playerId),
  };
}

// ─── Backup ───────────────────────────────────────────────────

async function saveBackup(debts) {
  await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify({
    debts,
    savedAt: new Date().toISOString(),
  }));
}

async function getBackup() {
  const raw = await AsyncStorage.getItem(BACKUP_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function clearBackup() {
  await AsyncStorage.removeItem(BACKUP_KEY);
}

/**
 * Verifica si se puede deshacer la reorganización.
 * Retorna { canUndo, reason } donde reason explica por qué no se puede si aplica.
 */
export async function canUndoReNet() {
  const backup = await getBackup();
  if (!backup) return { canUndo: false, reason: 'no_backup' };

  // Verificar si hay pagos registrados sobre deudas consolidadas
  const currentDebts = await getAllDebts();
  const consolidatedWithPayments = currentDebts.filter(
    d => d.isConsolidated && d.payments && d.payments.length > 0
  );

  if (consolidatedWithPayments.length > 0) {
    return { canUndo: false, reason: 'has_payments' };
  }

  return { canUndo: true, reason: null };
}

// ─── Neteo ────────────────────────────────────────────────────

function netDebts(allDebts) {
  const paidDebts    = allDebts.filter(d => d.status === 'paid');
  const pendingDebts = allDebts.filter(d => d.status !== 'paid');

  if (pendingDebts.length === 0) return allDebts;

  // Construir mapa de saldos netos entre pares
  const netMap = {};

  pendingDebts.forEach(d => {
    const idA = d.fromPlayer.id;
    const idB = d.toPlayer.id;
    const [keyA, keyB] = idA < idB
      ? [d.fromPlayer, d.toPlayer]
      : [d.toPlayer, d.fromPlayer];
    const key  = `${keyA.id}|${keyB.id}`;
    const sign = idA === keyA.id ? 1 : -1;

    if (!netMap[key]) {
      netMap[key] = { playerA: keyA, playerB: keyB, net: 0, payments: [] };
    }
    netMap[key].net += sign * d.pendingAmount;
    netMap[key].payments.push(...d.payments);
  });

  const now = new Date().toISOString();
  const consolidatedDebts = [];

  Object.values(netMap).forEach(({ playerA, playerB, net, payments }) => {
    if (Math.abs(net) < 1) return;

    const fromPlayer = net > 0 ? playerA : playerB;
    const toPlayer   = net > 0 ? playerB : playerA;
    const amount     = Math.round(Math.abs(net));
    const totalPaid  = payments.reduce((sum, p) => sum + p.amount, 0);

    consolidatedDebts.push({
      id:             `net_${fromPlayer.id}_${toPlayer.id}_${Date.now()}`,
      fromPlayer,
      toPlayer,
      sessionId:      'neteado',
      sessionName:    'Deuda consolidada',
      originalAmount: amount + totalPaid,
      pendingAmount:  amount,
      status:         'pending',
      payments:       payments.length > 0 ? payments : [],
      createdAt:      now,
      isConsolidated: true,
    });
  });

  return [...paidDebts, ...consolidatedDebts];
}

// ─── Creación con neteo automático ───────────────────────────

export async function generateDebtsFromSession(session, calcDebtsResult) {
  const allDebts = await getAllDebts();

  // Evitar duplicados
  const alreadyExists = allDebts.some(d => d.sessionId === session.id);
  if (alreadyExists) return allDebts;

  // Al cerrar nueva partida → borrar backup (nueva reorganización disponible)
  await clearBackup();

  if (calcDebtsResult.length === 0) {
    const netted = netDebts(allDebts);
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(netted));
    return netted;
  }

  const now = new Date().toISOString();
  const newDebts = calcDebtsResult.map(debt => ({
    id:             `${session.id}_${debt.fromId}_${debt.toId}_${Date.now()}`,
    fromPlayer:     { id: debt.fromId, name: debt.from },
    toPlayer:       { id: debt.toId,   name: debt.to },
    sessionId:      session.id,
    sessionName:    session.name,
    originalAmount: debt.amount,
    pendingAmount:  debt.amount,
    status:         'pending',
    payments:       [],
    createdAt:      now,
    isConsolidated: false,
  }));

  const netted = netDebts([...allDebts, ...newDebts]);
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(netted));
  return netted;
}

/**
 * Reorganiza manualmente todas las deudas pendientes.
 * Guarda backup antes de netear para poder deshacer.
 */
export async function reNetAllDebts() {
  const allDebts = await getAllDebts();

  // Guardar backup del estado actual antes de netear
  await saveBackup(allDebts);

  const netted = netDebts(allDebts);
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(netted));
  return netted;
}

/**
 * Deshace la última reorganización, restaurando el estado previo.
 * Solo funciona si no hay pagos sobre deudas consolidadas.
 */
export async function undoReNet() {
  const { canUndo, reason } = await canUndoReNet();
  if (!canUndo) {
    if (reason === 'has_payments') {
      throw new Error('No se puede deshacer: ya hay pagos registrados sobre las deudas reorganizadas.');
    }
    throw new Error('No hay reorganización para deshacer.');
  }

  const backup = await getBackup();
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(backup.debts));
  await clearBackup();
  return backup.debts;
}

// ─── Pagos ────────────────────────────────────────────────────

export async function registerPayment(debtId, amount, note = '') {
  const debts = await getAllDebts();
  const idx   = debts.findIndex(d => d.id === debtId);
  if (idx === -1) throw new Error('Deuda no encontrada');

  const debt    = debts[idx];
  const paid    = Math.min(amount, debt.pendingAmount);
  const pending = debt.pendingAmount - paid;

  debt.payments.push({
    amount: paid,
    date:   new Date().toISOString(),
    note:   note.trim(),
  });

  debt.pendingAmount = pending;
  debt.status = pending <= 0 ? 'paid' : 'partial';

  debts[idx] = debt;
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  return debts[idx];
}

export async function markAsPaid(debtId) {
  const debts = await getAllDebts();
  const idx   = debts.findIndex(d => d.id === debtId);
  if (idx === -1) throw new Error('Deuda no encontrada');

  const debt = debts[idx];
  if (debt.pendingAmount > 0) {
    debt.payments.push({
      amount: debt.pendingAmount,
      date:   new Date().toISOString(),
      note:   'Saldado',
    });
    debt.pendingAmount = 0;
  }
  debt.status = 'paid';
  debts[idx]  = debt;
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  return debts[idx];
}

export async function deleteDebtsForSession(sessionId) {
  const debts   = await getAllDebts();
  const updated = debts.filter(d => d.sessionId !== sessionId);
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(updated));
}

// ─── Helpers ──────────────────────────────────────────────────

export function debtStatusLabel(status) {
  switch (status) {
    case 'paid':    return 'Saldada';
    case 'partial': return 'Parcial';
    default:        return 'Pendiente';
  }
}

export function debtStatusColor(status) {
  switch (status) {
    case 'paid':    return '#27ae60';
    case 'partial': return '#f0c040';
    default:        return '#e74c3c';
  }
}
