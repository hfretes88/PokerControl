import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  generateDebtsFromSession,
  getAllDebts,
  getPendingDebts,
  getDebtsForPlayer,
  registerPayment,
  markAsPaid,
  deleteDebtsForSession,
  reNetAllDebts,
  undoReNet,
  canUndoReNet,
  hasDebtsToReorganize,
  addManualDebt,
  deleteManualDebt,
  MANUAL_DEBT_SESSION_ID,
} from '../debts';

const ana  = { id: '1', name: 'Ana' };
const beto = { id: '2', name: 'Beto' };

function session(id) {
  return { id, name: `Sesión ${id}` };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('generateDebtsFromSession', () => {
  it('crea una deuda pendiente a partir del resultado de calcDebts', async () => {
    const debts = await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      sessionId: 's1',
      fromPlayer: beto,
      toPlayer: ana,
      pendingAmount: 50,
      status: 'pending',
    });
  });

  it('es idempotente: no duplica deudas si se llama dos veces para la misma sesión', async () => {
    const calc = [{ from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 }];
    await generateDebtsFromSession(session('s1'), calc);
    const second = await generateDebtsFromSession(session('s1'), calc);
    expect(second).toHaveLength(1);
  });

  it('netea automáticamente deudas nuevas contra deudas pendientes del mismo par', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    const all = await generateDebtsFromSession(session('s2'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    // Se consolidan en una sola deuda de 80 en vez de quedar 2 separadas
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ pendingAmount: 80, isConsolidated: true });
  });

  it('cuando la deuda se invierte entre sesiones, el neteo cambia el sentido del pago', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    const all = await generateDebtsFromSession(session('s2'), [
      { from: ana.name, fromId: ana.id, to: beto.name, toId: beto.id, amount: 80 },
    ]);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ fromPlayer: ana, toPlayer: beto, pendingAmount: 30 });
  });
});

describe('registerPayment / markAsPaid', () => {
  async function setup() {
    const [debt] = await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 100 },
    ]);
    return debt;
  }

  it('un pago parcial deja status "partial" y reduce pendingAmount', async () => {
    const debt = await setup();
    const updated = await registerPayment(debt.id, 40);
    expect(updated.status).toBe('partial');
    expect(updated.pendingAmount).toBe(60);
    expect(updated.payments).toHaveLength(1);
  });

  it('un pago que cubre todo el saldo marca la deuda como "paid"', async () => {
    const debt = await setup();
    const updated = await registerPayment(debt.id, 100);
    expect(updated.status).toBe('paid');
    expect(updated.pendingAmount).toBe(0);
  });

  it('no permite que el pago deje pendingAmount negativo aunque se pase de monto', async () => {
    const debt = await setup();
    const updated = await registerPayment(debt.id, 999);
    expect(updated.pendingAmount).toBe(0);
    expect(updated.status).toBe('paid');
  });

  it('markAsPaid salda el resto pendiente de una', async () => {
    const debt = await setup();
    await registerPayment(debt.id, 40);
    const updated = await markAsPaid(debt.id);
    expect(updated.status).toBe('paid');
    expect(updated.pendingAmount).toBe(0);
  });

  it('registerPayment tira error si la deuda no existe', async () => {
    await expect(registerPayment('inexistente', 10)).rejects.toThrow('Deuda no encontrada');
  });
});

describe('deleteDebtsForSession', () => {
  it('borra solo las deudas de la sesión indicada', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    // Neteo automático consolida todo bajo sessionId "neteado" en cuanto hay 2 sesiones,
    // así que probamos el caso simple: una sola sesión sin neteo.
    let all = await getAllDebts();
    expect(all).toHaveLength(1);

    await deleteDebtsForSession('s1');
    all = await getAllDebts();
    expect(all).toHaveLength(0);
  });

  it('no afecta deudas de otras sesiones', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    const caro = { id: '3', name: 'Caro' };
    await generateDebtsFromSession(session('s2'), [
      { from: caro.name, fromId: caro.id, to: ana.name, toId: ana.id, amount: 20 },
    ]);

    await deleteDebtsForSession('s1');
    const remaining = await getAllDebts();
    expect(remaining.every(d => d.sessionId !== 's1')).toBe(true);
  });
});

describe('reNetAllDebts / undoReNet', () => {
  it('permite deshacer un neteo manual si no hay pagos sobre las deudas consolidadas', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    await reNetAllDebts();
    const { canUndo } = await canUndoReNet();
    expect(canUndo).toBe(true);

    const restored = await undoReNet();
    expect(restored).toHaveLength(1);
    expect(restored[0].pendingAmount).toBe(50);
  });

  it('bloquea el undo si ya hay pagos sobre la deuda consolidada', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    const netted = await reNetAllDebts();
    await registerPayment(netted[0].id, 10);

    const { canUndo, reason } = await canUndoReNet();
    expect(canUndo).toBe(false);
    expect(reason).toBe('has_payments');
    await expect(undoReNet()).rejects.toThrow();
  });
});

describe('getPendingDebts / getDebtsForPlayer', () => {
  it('excluye deudas saldadas de getPendingDebts', async () => {
    const [debt] = await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    await markAsPaid(debt.id);
    const pending = await getPendingDebts();
    expect(pending).toHaveLength(0);
  });

  it('getDebtsForPlayer separa lo que debe de lo que le deben', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    const anaDebts  = await getDebtsForPlayer(ana.id);
    const betoDebts = await getDebtsForPlayer(beto.id);
    expect(anaDebts.owed).toHaveLength(1);
    expect(anaDebts.owes).toHaveLength(0);
    expect(betoDebts.owes).toHaveLength(1);
    expect(betoDebts.owed).toHaveLength(0);
  });
});

describe('hasDebtsToReorganize', () => {
  it('da false en el flujo normal: generateDebtsFromSession ya netea sola', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 50 },
    ]);
    await generateDebtsFromSession(session('s2'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    expect(await hasDebtsToReorganize()).toBe(false);
  });

  it('da false si no hay ninguna deuda pendiente', async () => {
    expect(await hasDebtsToReorganize()).toBe(false);
  });

  it('da true si hay 2+ deudas pendientes sin netear entre el mismo par (p. ej. datos migrados a mano)', async () => {
    const now = new Date().toISOString();
    const rawDebts = [
      {
        id: 'd1', fromPlayer: beto, toPlayer: ana, sessionId: 's1', sessionName: 'S1',
        originalAmount: 50, pendingAmount: 50, status: 'pending', payments: [], createdAt: now, isConsolidated: false,
      },
      {
        id: 'd2', fromPlayer: beto, toPlayer: ana, sessionId: 's2', sessionName: 'S2',
        originalAmount: 30, pendingAmount: 30, status: 'pending', payments: [], createdAt: now, isConsolidated: false,
      },
    ];
    await AsyncStorage.setItem('poker_debts', JSON.stringify(rawDebts));
    expect(await hasDebtsToReorganize()).toBe(true);
  });
});

describe('addManualDebt', () => {
  it('crea una deuda pendiente con sessionId de ajuste previo', async () => {
    const debts = await addManualDebt({
      fromPlayer: beto, toPlayer: ana, amount: 40, description: 'Deuda del asado',
    });
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      fromPlayer: beto, toPlayer: ana,
      sessionId: MANUAL_DEBT_SESSION_ID,
      sessionName: 'Deuda del asado',
      pendingAmount: 40,
      status: 'pending',
    });
  });

  it('usa "Ajuste previo" como nombre si no hay descripción', async () => {
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 10 });
    expect(debt.sessionName).toBe('Ajuste previo');
  });

  it('se puede pagar y marcar como saldada igual que una deuda de sesión', async () => {
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 40 });
    const partial = await registerPayment(debt.id, 15);
    expect(partial.status).toBe('partial');
    expect(partial.pendingAmount).toBe(25);

    const paid = await markAsPaid(debt.id);
    expect(paid.status).toBe('paid');
    expect(paid.pendingAmount).toBe(0);
  });

  it('se netea con una deuda pendiente que ya existía entre el mismo par', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    const debts = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 20 });
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ pendingAmount: 50, isConsolidated: true });
  });

  it('la consolidada con una deuda de sesión real conserva la marca de ajuste previo', async () => {
    // Regresión: si se pierde, esa plata deja de contar en getPlayerStats.
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    const [merged] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 20 });
    expect(merged.sessionId).toBe(MANUAL_DEBT_SESSION_ID);
  });
});

describe('deleteManualDebt', () => {
  it('borra una deuda manual suelta', async () => {
    const [debt] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 40 });
    await deleteManualDebt(debt.id);
    expect(await getAllDebts()).toHaveLength(0);
  });

  it('tira error si ya se neteó con otra deuda del mismo par', async () => {
    await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    const [merged] = await addManualDebt({ fromPlayer: beto, toPlayer: ana, amount: 20 });
    await expect(deleteManualDebt(merged.id)).rejects.toThrow();
  });

  it('tira error si el id no corresponde a una deuda manual', async () => {
    const [debt] = await generateDebtsFromSession(session('s1'), [
      { from: beto.name, fromId: beto.id, to: ana.name, toId: ana.id, amount: 30 },
    ]);
    await expect(deleteManualDebt(debt.id)).rejects.toThrow();
  });
});
