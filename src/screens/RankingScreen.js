import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getGlobalRanking } from '../storage/storage';
import { C, Card, formatMoney } from '../components/UI';

const MEDALS = ['🥇', '🥈', '🥉'];
const PODIUM_COLORS = ['#4da6ff', '#b0b8c0', '#cd7f32'];

export default function RankingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const data = await getGlobalRanking();
    setRanking(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.loading}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (ranking.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyText}>Sin ranking aún</Text>
          <Text style={styles.emptyMuted}>
            El ranking aparece cuando al menos una partida esté cerrada.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Podio */}
        {podium.length >= 2 && (
          <View style={styles.podiumWrapper}>
            <Text style={styles.sectionTitle}>Podio</Text>
            <View style={styles.podiumRow}>
              {/* orden visual: 2do - 1ro - 3ro */}
              {[1, 0, 2].map(i => {
                const p = podium[i];
                if (!p) return <View key={i} style={{ flex: 1 }} />;
                const isFirst = i === 0;
                return (
                  <TouchableOpacity
                    key={p.playerId}
                    style={[styles.podiumItem, isFirst && styles.podiumFirst]}
                    onPress={() => navigation.navigate('Stats', { playerId: p.playerId, playerName: p.name })}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.podiumMedal}>{MEDALS[i]}</Text>
                    <View style={[styles.podiumAvatar, { borderColor: PODIUM_COLORS[i] }]}>
                      <Text style={[styles.podiumAvatarText, { color: PODIUM_COLORS[i] }]}>
                        {p.name[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.podiumBalance, { color: p.totalBalance >= 0 ? C.green : C.red }]}>
                      {p.totalBalance > 0 ? '+' : ''}{formatMoney(p.totalBalance)}
                    </Text>
                    <Text style={styles.podiumGames}>{p.totalGames} partidas</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Lista completa */}
        <Text style={styles.sectionTitle}>Tabla completa</Text>
        {ranking.map((p, idx) => (
          <TouchableOpacity
            key={p.playerId}
            onPress={() => navigation.navigate('Stats', { playerId: p.playerId, playerName: p.name })}
            activeOpacity={0.75}
          >
            <Card style={styles.rowCard}>
              <View style={styles.rowInner}>

                {/* Posición */}
                <View style={styles.positionCol}>
                  {idx < 3
                    ? <Text style={styles.medal}>{MEDALS[idx]}</Text>
                    : <Text style={styles.position}>#{idx + 1}</Text>
                  }
                </View>

                {/* Avatar + nombre */}
                <View style={[styles.avatar, { borderColor: PODIUM_COLORS[idx] || C.cardBorder }]}>
                  <Text style={[styles.avatarText, { color: PODIUM_COLORS[idx] || C.gray }]}>
                    {p.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{p.totalGames} partidas</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={[styles.metaText, { color: C.accent }]}>{p.winRate}% win</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={[styles.metaText, { color: C.green }]}>{p.wins}G</Text>
                    <Text style={[styles.metaText, { color: C.muted }]}>/{p.losses}P</Text>
                  </View>
                </View>

                {/* Balance */}
                <Text style={[styles.balance, { color: p.totalBalance >= 0 ? C.green : C.red }]}>
                  {p.totalBalance > 0 ? '+' : ''}{formatMoney(p.totalBalance)}
                </Text>

              </View>
            </Card>
          </TouchableOpacity>
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

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: C.white,
    marginBottom: 12, marginTop: 4,
  },

  // Podio
  podiumWrapper: { marginBottom: 24 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  podiumItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBorder,
    paddingVertical: 16, paddingHorizontal: 6,
  },
  podiumFirst: {
    paddingVertical: 22,
    borderColor: '#4da6ff',
    borderWidth: 1.5,
  },
  podiumMedal: { fontSize: 22, marginBottom: 8 },
  podiumAvatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    backgroundColor: '#0e1e35', alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  podiumAvatarText: { fontSize: 18, fontWeight: '800' },
  podiumName: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 4, textAlign: 'center' },
  podiumBalance: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  podiumGames: { fontSize: 11, color: C.gray },

  // Lista
  rowCard: { marginBottom: 8 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  positionCol: { width: 30, alignItems: 'center' },
  medal: { fontSize: 18 },
  position: { fontSize: 14, fontWeight: '700', color: C.gray },
  avatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    backgroundColor: '#0e1e35', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },
  playerName: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: C.gray },
  metaDot: { fontSize: 11, color: C.muted },
  balance: { fontSize: 15, fontWeight: '800' },
});
