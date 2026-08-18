import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Session } from '../storage/types';

/**
 * Rutas del stack único de la app (ver App.js). Cuando App.js se migre a
 * TypeScript, este mismo tipo se pasa a createNativeStackNavigator<RootStackParamList>().
 */
export type RootStackParamList = {
  Seasons: undefined;
  SessionsList: { seasonId: string; seasonName: string };
  Players: undefined;
  Session: { sessionId: string };
  Stats: { playerId: string; playerName: string; seasonId?: string; seasonName?: string };
  Debts: { session: Session };
  Ranking: { seasonId?: string; seasonName?: string } | undefined;
  PendingDebts: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
