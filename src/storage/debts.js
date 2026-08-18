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
import { genId, safeParse } from './id';
import { withLock } from './lock';

const DEBTS_KEY   = 'poker_debts';
const BACKUP_KEY  = 'poker_debts_backup';
export const MANUAL_DEBT_SESSION_ID = 'ajuste_previo';

// ─── Lectura ──────────────────────────────────────────────────

export async function getAllDebts() {
  const raw = await AsyncStorage.getItem(DEBTS_KEY);
  return safeParse(raw, []);
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
  return safeParse(raw, null);
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

  // Verificar si se registró algún pago nuevo (sobre cualquier deuda, no
  // solo las consolidadas) desde que se guardó el backup: deshacer
  // pisaría ese pago con el estado viejo.
  const currentDebts = await getAllDebts();
  const backupPaymentCounts = new Map(
    backup.debts.map(d => [d.id, (d.payments || []).length])
  );
  const hasNewPayments = currentDebts.some(d => {
    const before = backupPaymentCounts.get(d.id) ?? 0;
    return (d.payments || []).length > before;
  });

  if (hasNewPayments) {
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
      netMap[key] = { playerA: keyA, playerB: keyB, net: 0, payments: [], sourceDebts: [] };
    }
    netMap[key].net += sign * d.pendingAmount;
    netMap[key].payments.push(...d.payments);
    netMap[key].sourceDebts.push(d);
  });

  const now = new Date().toISOString();
  const consolidatedDebts = [];

  Object.values(netMap).forEach(({ playerA, playerB, net, payments, sourceDebts }) => {
    if (Math.abs(net) < 1) return;

    // Si hay una sola deuda pendiente entre este par, no hay nada que
    // consolidar: se mantiene tal cual (conserva su sessionId real, así
    // DebtScreen puede seguir encontrándola para registrar pagos).
    if (sourceDebts.length === 1) {
      consolidatedDebts.push(sourceDebts[0]);
      return;
    }

    const fromPlayer = net > 0 ? playerA : playerB;
    const toPlayer   = net > 0 ? playerB : playerA;
    const amount     = Math.round(Math.abs(net));
    const totalPaid  = payments.reduce((sum, p) => sum + p.amount, 0);
    // Si alguna de las deudas combinadas era un ajuste previo, la
    // consolidada sigue siendo ajuste previo: no puede perder la marca
    // que la hace contar en el balance del jugador (ver getPlayerStats).
    const hasManualSource = sourceDebts.some(d => d.sessionId === MANUAL_DEBT_SESSION_ID);

    consolidatedDebts.push({
      id:             `net_${fromPlayer.id}_${toPlayer.id}_${genId()}`,
      fromPlayer,
      toPlayer,
      sessionId:      hasManualSource ? MANUAL_DEBT_SESSION_ID : 'neteado',
      sessionName:    hasManualSource ? 'Deuda consolidada (incluye ajuste previo)' : 'Deuda consolidada',
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
  return withLock(DEBTS_KEY, async () => {
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
      id:             `${session.id}_${debt.fromId}_${debt.toId}_${genId()}`,
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
  });
}

/**
 * Registra una deuda manual entre dos jugadores (p. ej. plata pendiente
 * de antes de usar la app). Se comporta como cualquier deuda de sesión:
 * se puede pagar parcial, marcar como saldada, y se netea automáticamente
 * si ya había una deuda pendiente entre el mismo par.
 */
export async function addManualDebt({ fromPlayer, toPlayer, amount, description }) {
  return withLock(DEBTS_KEY, async () => {
    const allDebts = await getAllDebts();
    const now = new Date().toISOString();
    const newDebt = {
      id:             genId(),
      fromPlayer,
      toPlayer,
      sessionId:      MANUAL_DEBT_SESSION_ID,
      sessionName:    (description || '').trim() || 'Ajuste previo',
      originalAmount: amount,
      pendingAmount:  amount,
      status:         'pending',
      payments:       [],
      createdAt:      now,
      isConsolidated: false,
    };

    const netted = netDebts([...allDebts, newDebt]);
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(netted));
    return netted;
  });
}

/**
 * Borra una deuda manual suelta. Solo funciona si todavía no se neteó
 * con otra deuda del mismo par — una vez consolidada podría incluir
 * plata de una deuda real de partida, y borrarla la perdería.
 */
export async function deleteManualDebt(debtId) {
  return withLock(DEBTS_KEY, async () => {
    const allDebts = await getAllDebts();
    const debt = allDebts.find(
      d => d.id === debtId && d.sessionId === MANUAL_DEBT_SESSION_ID && !d.isConsolidated
    );
    if (!debt) {
      throw new Error('No se puede borrar: ya se combinó con otra deuda entre estos jugadores.');
    }
    const updated = allDebts.filter(d => d.id !== debtId);
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(updated));
    return updated;
  });
}

/**
 * Indica si hay algo para consolidar: al menos un par de jugadores con
 * 2+ deudas pendientes entre ellos. Como generateDebtsFromSession ya
 * netea automáticamente en cada cierre de partida, esto normalmente da
 * false — solo es true en casos raros (p. ej. datos migrados a mano).
 */
export async function hasDebtsToReorganize() {
  const debts = await getAllDebts();
  const pending = debts.filter(d => d.status !== 'paid');
  const counts = {};
  pending.forEach(d => {
    const idA = d.fromPlayer.id;
    const idB = d.toPlayer.id;
    const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.values(counts).some(n => n >= 2);
}

/**
 * Reorganiza manualmente todas las deudas pendientes.
 * Guarda backup antes de netear para poder deshacer.
 */
export async function reNetAllDebts() {
  return withLock(DEBTS_KEY, async () => {
    const allDebts = await getAllDebts();

    // Guardar backup del estado actual antes de netear
    await saveBackup(allDebts);

    const netted = netDebts(allDebts);
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(netted));
    return netted;
  });
}

/**
 * Deshace la última reorganización, restaurando el estado previo.
 * Solo funciona si no hay pagos sobre deudas consolidadas.
 */
export async function undoReNet() {
  return withLock(DEBTS_KEY, async () => {
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
  });
}

// ─── Pagos ────────────────────────────────────────────────────

export async function registerPayment(debtId, amount, note = '') {
  return withLock(DEBTS_KEY, async () => {
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
  });
}

export async function markAsPaid(debtId) {
  return withLock(DEBTS_KEY, async () => {
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
  });
}

export async function deleteDebtsForSession(sessionId) {
  return withLock(DEBTS_KEY, async () => {
    const debts   = await getAllDebts();
    const updated = debts.filter(d => d.sessionId !== sessionId);
    await AsyncStorage.setItem(DEBTS_KEY, JSON.stringify(updated));
  });
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
