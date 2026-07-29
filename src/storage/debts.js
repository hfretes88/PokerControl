/**
 * debts.js — módulo de manejo de deudas
 * Se integra con storage.js existente.
 * Clave AsyncStorage: "poker_debts"
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBTS_KEY = 'poker_debts';

// ─── Lectura ──────────────────────────────────────────────────

export async function getAllDebts() {
  const raw = await AsyncStorage.getItem(DEBTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getPendingDebts() {
  const debts = await getAllDebts();
  return debts.filter(d => d.status !== 'paid');
}

/**
 * Deudas pendientes agrupadas por deudor.
 * Retorna [{ player: {id, name}, debts: [], totalPending }]
 */
export async function getPendingDebtsByDebtor() {
  const debts = await getPendingDebts();
  const map = {};

  debts.forEach(d => {
    const key = d.fromPlayer.id;
    if (!map[key]) {
      map[key] = { player: d.fromPlayer, debts: [], totalPending: 0 };
    }
    map[key].debts.push(d);
    map[key].totalPending += d.pendingAmount;
  });

  return Object.values(map).sort((a, b) => b.totalPending - a.totalPending);
}

/**
 * Deudas pendientes de un jugador específico (lo que debe a otros).
 */
export async function getDebtsForPlayer(playerId) {
  const debts = await getAllDebts();
  return {
    owes: debts.filter(d => d.fromPlayer.id === playerId),   // lo que debe
    owed: debts.filter(d => d.toPlayer.id === playerId),     // lo que le deben
  };
}

// ─── Creación ─────────────────────────────────────────────────

/**
 * Genera deudas a partir de una sesión cerrada.
 * Usa el mismo algoritmo greedy de calcDebts.
 * Solo genera si no existen ya para esa sesión.
 */
export async function generateDebtsFromSession(session, calcDebtsResult) {
  const allDebts = await getAllDebts();

  // Evitar duplicados — si ya hay deudas de esta sesión, no generar
  const alreadyExists = allDebts.some(d => d.sessionId === session.id);
  if (alreadyExists) return allDebts;

  const now = new Date().toISOString();
  const newDebts = calcDebtsResult.map(debt => ({
    id:             `${session.id}_${debt.from}_${debt.to}_${Date.now()}`,
    fromPlayer:     { id: debt.fromId,   name: debt.from },
    toPlayer:       { id: debt.toId,     name: debt.to },
    sessionId:      session.id,
    sessionName:    session.name,
    originalAmount: debt.amount,
    pendingAmount:  debt.amount,
    status:         'pending',   // pending | partial | paid
    payments:       [],
    createdAt:      now,
  }));

  const updated = [...allDebts, ...newDebts];
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(updated));
  return updated;
}

// ─── Pagos ────────────────────────────────────────────────────

/**
 * Registra un pago (total o parcial) sobre una deuda.
 */
export async function registerPayment(debtId, amount, note = '') {
  const debts = await getAllDebts();
  const idx   = debts.findIndex(d => d.id === debtId);
  if (idx === -1) throw new Error('Deuda no encontrada');

  const debt    = debts[idx];
  const paid    = Math.min(amount, debt.pendingAmount); // no pagar de más
  const pending = debt.pendingAmount - paid;

  debt.payments.push({
    amount:    paid,
    date:      new Date().toISOString(),
    note:      note.trim(),
  });

  debt.pendingAmount = pending;
  debt.status = pending <= 0 ? 'paid' : 'partial';

  debts[idx] = debt;
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  return debts[idx];
}

/**
 * Marca una deuda como saldada completamente (sin importar el monto).
 */
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
  debts[idx] = debt;
  await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(debts));
  return debts[idx];
}

/**
 * Elimina todas las deudas de una sesión (al borrar la sesión).
 */
export async function deleteDebtsForSession(sessionId) {
  const debts = await getAllDebts();
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
