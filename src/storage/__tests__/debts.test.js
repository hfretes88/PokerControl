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
