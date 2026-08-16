import { calcParticipant, calcSession, calcDebts, buildWhatsAppSummary } from '../storage';

function participant(playerId, name, buys, finalAmount) {
  return {
    playerId,
    name,
    buys: buys.map(amount => ({ amount, timestamp: '2026-01-01T00:00:00.000Z' })),
    finalAmount,
  };
}

describe('calcParticipant', () => {
  it('suma las compras y calcula el balance final', () => {
    const p = participant('1', 'Ana', [100, 50], 200);
    expect(calcParticipant(p)).toEqual({ totalBought: 150, finalAmount: 200, balance: 50 });
  });

  it('trata finalAmount null como 0', () => {
    const p = participant('1', 'Ana', [100], null);
    expect(calcParticipant(p)).toEqual({ totalBought: 100, finalAmount: 0, balance: -100 });
  });
});

describe('calcSession', () => {
  it('detecta cuando el pozo cierra exacto', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 150),
        participant('2', 'Beto', [100], 50),
      ],
    };
    const result = calcSession(session);
    expect(result).toEqual({ totalPot: 200, totalOut: 200, diff: 0, status: 'ok' });
  });

  it('detecta cuando sobran fichas (los resultados finales suman más que lo comprado)', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 150),
        participant('2', 'Beto', [100], 100),
      ],
    };
    const result = calcSession(session);
    expect(result.diff).toBe(50);
    expect(result.status).toBe('sobran');
  });

  it('detecta cuando faltan fichas (los resultados finales suman menos que lo comprado)', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 50),
        participant('2', 'Beto', [100], 100),
      ],
    };
    const result = calcSession(session);
    expect(result.diff).toBe(-50);
    expect(result.status).toBe('faltan');
  });
});

describe('calcDebts', () => {
  it('genera una sola transacción entre dos jugadores', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 150),
        participant('2', 'Beto', [100], 50),
      ],
    };
    const debts = calcDebts(session);
    expect(debts).toEqual([
      { from: 'Beto', fromId: '2', to: 'Ana', toId: '1', amount: 50 },
    ]);
  });

  it('minimiza transacciones entre múltiples jugadores', () => {
    // Ana +150, Beto -50, Caro -100 → Beto y Caro le pagan a Ana, 2 transacciones (no 3)
    const session = {
      participants: [
        participant('1', 'Ana', [100], 250),
        participant('2', 'Beto', [100], 50),
        participant('3', 'Caro', [100], 0),
      ],
    };
    const debts = calcDebts(session);
    expect(debts).toHaveLength(2);
    const total = debts.reduce((sum, d) => sum + d.amount, 0);
    expect(total).toBe(150);
    expect(debts.every(d => d.to === 'Ana')).toBe(true);
  });

  it('ignora a los jugadores sin resultado cargado', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 150),
        participant('2', 'Beto', [100], null),
      ],
    };
    expect(calcDebts(session)).toEqual([]);
  });

  it('no genera deudas si todos quedan saldados', () => {
    const session = {
      participants: [
        participant('1', 'Ana', [100], 100),
        participant('2', 'Beto', [100], 100),
      ],
    };
    expect(calcDebts(session)).toEqual([]);
  });

  it('devuelve array vacío si nadie cargó resultado', () => {
    const session = { participants: [] };
    expect(calcDebts(session)).toEqual([]);
  });
});

describe('buildWhatsAppSummary', () => {
  it('antepone el signo + a los balances positivos', () => {
    const session = {
      name: 'Viernes de poker',
      createdAt: '2026-01-01T00:00:00.000Z',
      participants: [
        participant('1', 'Ana', [100], 150),
        participant('2', 'Beto', [100], 50),
      ],
    };
    const text = buildWhatsAppSummary(session);
    expect(text).toContain('Ana: +50$');
    expect(text).toContain('Beto: -50$');
  });
});
