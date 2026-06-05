import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getPlayerStats, addPlayerAdjustment, deletePlayerAdjustment } from '../storage/storage';
import { C, Card, Btn, Divider, formatMoney } from '../components/UI';
import { GS } from '../components/GlobalStyles';
import LineChart from '../components/LineChart';

export default function StatsScreen({ route }) {
  const { playerId, playerName } = route.params;
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjModal, setAdjModal] = useState(false);
  const [adjType, setAdjType] = useState('cobro');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjAmount, setAdjAmount] = useState('');

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const data = await getPlayerStats(playerId);
    setStats(data);
    setLoading(false);
  }

  function openAdjModal() {
    setAdjType('cobro');
    setAdjDescription('');
    setAdjAmount('');
    setAdjModal(true);
  }

  async function handleAddAdj() {
    const amount = parseFloat((adjAmount || '0').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.');
      return;
    }
    const finalAmount = adjType === 'deuda' ? -amount : amount;
    await addPlayerAdjustment(playerId, {
      description: adjDescription || (adjType === 'deuda' ? 'Deuda previa' : 'Cobro previo'),
      amount: finalAmount,
    });
    setAdjModal(false);
    load();
  }

  async function handleDeleteAdj(adjustmentId) {
    Alert.alert('Eliminar ajuste', '¿Eliminar este ajuste?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await deletePlayerAdjustment(playerId, adjustmentId); load(); }
      }
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.loading}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  // Estado vacío: sin sesiones ni ajustes — igual permite agregar uno
  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>Sin historial aún</Text>
          <Text style={styles.emptyMuted}>
            {playerName} todavía no tiene partidas cerradas.
          </Text>
          <TouchableOpacity style={styles.adjAddBtnEmpty} onPress={openAdjModal}>
            <Text style={styles.adjAddText}>+ Agregar ajuste previo</Text>
          </TouchableOpacity>
        </View>
        {adjModalView()}
      </SafeAreaView>
    );
  }

  const totalIsPositive = stats.totalBalance >= 0;

  function adjModalView() {
    return (
      <Modal visible={adjModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Ajuste manual</Text>

            {/* Toggle cobro / deuda */}
            <View style={styles.adjTypeRow}>
              <TouchableOpacity
                style={[styles.adjTypeBtn, adjType === 'cobro' && styles.adjTypeBtnCobro]}
                onPress={() => setAdjType('cobro')}>
                <Text style={[styles.adjTypeTxt, adjType === 'cobro' && { color: C.green }]}>
                  💰 Cobro
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adjTypeBtn, adjType === 'deuda' && styles.adjTypeBtnDeuda]}
                onPress={() => setAdjType('deuda')}>
                <Text style={[styles.adjTypeTxt, adjType === 'deuda' && { color: C.red }]}>
                  💸 Deuda
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>DESCRIPCIÓN (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder={adjType === 'deuda' ? 'Ej: Deuda de torneo anterior' : 'Ej: Cobro de apuesta vieja'}
              placeholderTextColor={C.muted}
              value={adjDescription}
              onChangeText={setAdjDescription}
            />

            <Text style={styles.fieldLabel}>MONTO</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ej: 5000"
              placeholderTextColor={C.muted}
              value={adjAmount}
              onChangeText={setAdjAmount}
              keyboardType="decimal-pad"
              autoFocus
            />

            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => setAdjModal(false)} color={C.muted} small />
              <Btn label="Guardar" onPress={handleAddAdj} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Resumen global */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroLabel}>BALANCE HISTÓRICO</Text>
          <Text style={[styles.heroAmount, { color: totalIsPositive ? C.green : C.red }]}>
            {totalIsPositive ? '+' : ''}{formatMoney(stats.totalBalance)}
          </Text>
          {stats.adjustmentsTotal !== 0 && (
            <Text style={styles.adjBreakdown}>
              Partidas {stats.sessionBalance >= 0 ? '+' : ''}{formatMoney(stats.sessionBalance)}
              {'  ·  '}
              Ajustes {stats.adjustmentsTotal > 0 ? '+' : ''}{formatMoney(stats.adjustmentsTotal)}
            </Text>
          )}
          {stats.totalGames > 0 && (
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
          )}
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
        {stats.bestGame && stats.worstGame && (
          <View style={styles.row}>
            <Card style={[styles.halfCard, { marginRight: 6 }]}>
              <Text style={styles.halfLabel}>🏆 Mejor</Text>
              <Text style={[styles.halfAmount, { color: C.green }]}>
                {stats.bestGame.balance > 0 ? '+' : ''}{formatMoney(stats.bestGame.balance)}
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
        )}

        {/* Ajustes manuales */}
        <View style={styles.adjSectionHeader}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Ajustes previos</Text>
          <TouchableOpacity onPress={openAdjModal} style={styles.adjAddBtn}>
            <Text style={styles.adjAddText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        {stats.adjustments.length === 0 ? (
          <Text style={styles.adjEmpty}>Sin ajustes registrados</Text>
        ) : (
          stats.adjustments.map(adj => (
            <Card key={adj.id}>
              <View style={styles.adjRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adjDesc}>{adj.description}</Text>
                  <Text style={styles.histDate}>
                    {new Date(adj.date).toLocaleDateString('es-AR', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })}
                  </Text>
                </View>
                <Text style={[styles.adjAmount, { color: adj.amount >= 0 ? C.green : C.red }]}>
                  {adj.amount > 0 ? '+' : ''}{formatMoney(adj.amount)}
                </Text>
                <TouchableOpacity onPress={() => handleDeleteAdj(adj.id)} style={styles.delBtn}>
                  <Text style={styles.delText}>🗑</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}

        {/* Historial de partidas */}
        {stats.history.length > 0 && (
          <>
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
          </>
        )}

      </ScrollView>

      {adjModalView()}
    </SafeAreaView>
  );
}

const styles = {
  ...GS,
  ...StyleSheet.create({
    heroCard: { alignItems: 'center', marginBottom: 12 },
    heroLabel: { fontSize: 11, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 6 },
    heroAmount: { fontSize: 42, fontWeight: '800', marginBottom: 8 },
    adjBreakdown: { fontSize: 11, color: C.gray, marginBottom: 14 },
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

    // Ajustes
    adjSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 },
    adjAddBtn: { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, paddingVertical: 5 },
    adjAddBtnEmpty: { marginTop: 20, borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
    adjAddText: { fontSize: 13, color: C.accent, fontWeight: '700' },
    adjEmpty: { fontSize: 13, color: C.muted, marginBottom: 12 },
    adjRow: { flexDirection: 'row', alignItems: 'center' },
    adjDesc: { fontSize: 14, fontWeight: '600', color: C.white, marginBottom: 3 },
    adjAmount: { fontSize: 16, fontWeight: '700', marginRight: 4 },
    adjTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    adjTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center' },
    adjTypeBtnCobro: { borderColor: C.green, backgroundColor: '#0a2a18' },
    adjTypeBtnDeuda: { borderColor: C.red, backgroundColor: '#2a0e0e' },
    adjTypeTxt: { fontSize: 14, fontWeight: '700', color: C.gray },
  }),
};
