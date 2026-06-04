import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getPlayerStats } from '../storage/storage';
import { C, Card, Divider, formatMoney } from '../components/UI';
import LineChart from '../components/LineChart';

export default function StatsScreen({ route }) {
  const { playerId, playerName } = route.params;
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const data = await getPlayerStats(playerId);
    setStats(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.loading}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>Sin historial aún</Text>
          <Text style={styles.emptyMuted}>
            {playerName} todavía no tiene partidas cerradas.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalIsPositive = stats.totalBalance >= 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Resumen global */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroLabel}>BALANCE HISTÓRICO</Text>
          <Text style={[styles.heroAmount, { color: totalIsPositive ? C.green : C.red }]}>
            {totalIsPositive ? '+' : ''}{formatMoney(stats.totalBalance)}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{stats.totalGames}</Text>
              <Text style={styles.statLabel}>Partidas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: C.green }]}>{stats.wins}</Text>
              <Text style={styles.statLabel}>Ganadas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: C.red }]}>{stats.losses}</Text>
              <Text style={styles.statLabel}>Perdidas</Text>
            </View>
            {stats.ties > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: C.gray }]}>{stats.ties}</Text>
                  <Text style={styles.statLabel}>Empates</Text>
                </View>
              </>
            )}
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: C.accent }]}>{stats.winRate}%</Text>
              <Text style={styles.statLabel}>Win rate</Text>
            </View>
          </View>
        </Card>

        {/* Gráfico de balance */}
        {stats.history.length >= 2 && (() => {
          const chronological = [...stats.history].reverse().slice(-6);
          return (
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Balance por partida</Text>
              <Text style={styles.chartSubtitle}>Escala x1.000</Text>
              <LineChart
                data={chronological.map(h => h.balance)}
                xLabels={chronological.map(h => h.sessionName)}
                height={220}
              />
            </Card>
          );
        })()}

        {/* Mejor y peor partida */}
        <View style={styles.row}>
          <Card style={[styles.halfCard, { marginRight: 6 }]}>
            <Text style={styles.halfLabel}>🏆 Mejor</Text>
            <Text style={[styles.halfAmount, { color: C.green }]}>
              {stats.bestGame.balance > 0 ? '+' : ''}
              {formatMoney(stats.bestGame.balance)}
            </Text>
            <Text style={styles.halfSession} numberOfLines={1}>
              {stats.bestGame.sessionName}
            </Text>
          </Card>
          <Card style={[styles.halfCard, { marginLeft: 6 }]}>
            <Text style={styles.halfLabel}>💸 Peor</Text>
            <Text style={[styles.halfAmount, { color: C.red }]}>
              {formatMoney(stats.worstGame.balance)}
            </Text>
            <Text style={styles.halfSession} numberOfLines={1}>
              {stats.worstGame.sessionName}
            </Text>
          </Card>
        </View>

        {/* Historial */}
        <Text style={styles.sectionTitle}>Historial de partidas</Text>
        {stats.history.map(h => (
          <Card key={h.sessionId}>
            <View style={styles.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histSession} numberOfLines={1}>{h.sessionName}</Text>
                <Text style={styles.histDate}>
                  {new Date(h.date).toLocaleDateString('es-AR', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.histBalance, {
                  color: h.balance > 0 ? C.green : h.balance < 0 ? C.red : C.gray
                }]}>
                  {h.balance > 0 ? '+' : ''}{formatMoney(h.balance)}
                </Text>
                <Text style={styles.histDetail}>
                  {formatMoney(h.totalBought)} → {formatMoney(h.finalAmount)}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loading: { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 50, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted: { fontSize: 13, color: C.gray, textAlign: 'center' },
  heroCard: { alignItems: 'center', marginBottom: 12 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 6 },
  heroAmount: { fontSize: 42, fontWeight: '800', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 20, fontWeight: '800', color: C.white },
  statLabel: { fontSize: 11, color: C.gray, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: C.cardBorder },
  row: { flexDirection: 'row', marginBottom: 4 },
  halfCard: { flex: 1, marginBottom: 12 },
  halfLabel: { fontSize: 12, color: C.gray, marginBottom: 6 },
  halfAmount: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  halfSession: { fontSize: 11, color: C.muted },
  chartCard: { marginBottom: 12 },
  chartTitle: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 2 },
  chartSubtitle: { fontSize: 11, color: C.gray, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 10, marginTop: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center' },
  histSession: { fontSize: 14, fontWeight: '600', color: C.white, marginBottom: 3 },
  histDate: { fontSize: 12, color: C.gray },
  histBalance: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  histDetail: { fontSize: 11, color: C.muted },
});
