/**
 * types.ts — modelos de datos compartidos por el módulo de storage.
 * Reflejan la forma exacta de lo que se guarda en AsyncStorage (ver
 * README § Data Model), no un modelo "ideal" aparte.
 */

export interface Player {
  id: string;
  name: string;
  createdAt: string;
  adjustments?: PlayerAdjustment[];
}

export interface PlayerAdjustment {
  id: string;
  description: string;
  amount: number;
  date: string;
}

export interface Buy {
  amount: number;
  timestamp: string;
}

export interface Participant {
  playerId: string;
  name: string;
  buys: Buy[];
  finalAmount: number | null;
}

export type SessionStatus = 'active' | 'closed';

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  closedAt?: string | null;
  status: SessionStatus;
  seasonId?: string;
  participants: Participant[];
}

export type SeasonStatus = 'active' | 'closed';

export interface Season {
  id: string;
  name: string;
  createdAt: string;
  closedAt: string | null;
  status: SeasonStatus;
}

export interface DebtPlayerRef {
  id: string;
  name: string;
}

export interface DebtPayment {
  amount: number;
  date: string;
  note: string;
}

export type DebtStatus = 'pending' | 'partial' | 'paid';

export interface Debt {
  id: string;
  fromPlayer: DebtPlayerRef;
  toPlayer: DebtPlayerRef;
  sessionId: string;
  sessionName: string;
  originalAmount: number;
  pendingAmount: number;
  status: DebtStatus;
  payments: DebtPayment[];
  createdAt: string;
  isConsolidated: boolean;
}

export interface DebtBackup {
  debts: Debt[];
  savedAt: string;
}

export interface CanUndoReNetResult {
  canUndo: boolean;
  reason: 'no_backup' | 'has_payments' | null;
}

export interface DebtorGroup {
  player: DebtPlayerRef;
  debts: Debt[];
  totalPending: number;
}

/** Transacción de saldo mínimo calculada por calcDebts, previa a persistirse como Debt. */
export interface DebtTransaction {
  from: string;
  fromId: string;
  to: string;
  toId: string;
  amount: number;
}

export interface ParticipantCalc {
  totalBought: number;
  finalAmount: number;
  balance: number;
}

export type SessionBalanceStatus = 'ok' | 'faltan' | 'sobran';

export interface SessionCalc {
  totalPot: number;
  totalOut: number;
  diff: number;
  status: SessionBalanceStatus;
}

export interface PlayerHistoryEntry {
  sessionId: string;
  sessionName: string;
  date: string;
  totalBought: number;
  finalAmount: number;
  balance: number;
}

export interface PlayerStats {
  totalGames: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  totalBalance: number;
  sessionBalance: number;
  adjustmentsTotal: number;
  manualDebtsNet: number;
  adjustments: PlayerAdjustment[];
  bestGame: PlayerHistoryEntry | null;
  worstGame: PlayerHistoryEntry | null;
  history: PlayerHistoryEntry[];
}

export interface RankingEntry extends PlayerStats {
  playerId: string;
  name: string;
}
