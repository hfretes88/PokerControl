import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getPlayerStats, deletePlayerAdjustment, updatePlayerAdjustment, getPlayers } from '../storage/storage';
import { getDebtsForPlayer, addManualDebt, deleteManualDebt, markAsPaid, MANUAL_DEBT_SESSION_ID } from '../storage/debts';
import { Card, Btn, formatMoney } from '../components/UI';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';
import LineChart from '../components/LineChart';
import PlayerDebtsSection from '../components/PlayerDebtsSection';

export default function StatsScreen({ route }) {
  const { playerId, playerName, seasonId, seasonName } = route.params;
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [stats, setStats] = useState(null);
  const [manualDebts, setManualDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjModal, setAdjModal] = useState(false);
  const [adjType, setAdjType] = useState('cobro');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [otherPlayers, setOtherPlayers] = useState([]);
  const [adjCounterpartId, setAdjCounterpartId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [editAdjModal, setEditAdjModal] = useState(false);
  const [editAdjId, setEditAdjId] = useState(null);
  const [editAdjType, setEditAdjType] = useState('cobro');
  const [editAdjDescription, setEditAdjDescription] = useState('');
  const [editAdjAmount, setEditAdjAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [data, { owes, owed }] = await Promise.all([
      getPlayerStats(playerId, seasonId),
      getDebtsForPlayer(playerId),
    ]);
    setStats(data);
    setManualDebts(
      [...owes, ...owed].filter(d => d.sessionId === MANUAL_DEBT_SESSION_ID && d.status !== 'paid')
    );
    setLoading(false);
  }, [playerId, seasonId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openAdjModal() {
    setAdjType('cobro');
    setAdjDescription('');
    setAdjAmount('');
    setAdjCounterpartId(null);
    const players = await getPlayers();
    setOtherPlayers(players.filter(p => p.id !== playerId));
    setAdjModal(true);
  }

  async function handleAddAdj() {
    const amount = parseFloat((adjAmount || '0').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.');
      return;
    }
    const counterpart = otherPlayers.find(p => p.id === adjCounterpartId);
    if (!counterpart) {
      Alert.alert('Falta el jugador', 'Elegí con quién es la deuda previa.');
      return;
    }
    const me = { id: playerId, name: playerName };
    const other = { id: counterpart.id, name: counterpart.name };
    const fromPlayer = adjType === 'deuda' ? me : other;
    const toPlayer   = adjType === 'deuda' ? other : me;
    await addManualDebt({
      fromPlayer,
      toPlayer,
      amount,
      description: adjDescription,
    });
    setAdjModal(false);
    setRefreshTick(t => t + 1);
    load();
  }

  async function handleDeleteManualDebt(debtId) {
    Alert.alert('Eliminar deuda previa', '¿Eliminar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await deleteManualDebt(debtId);
            setRefreshTick(t => t + 1);
            load();
          } catch (err) {
            Alert.alert('No se puede eliminar', err.message);
          }
        }
      }
    ]);
  }

  async function handleMarkManualDebtPaid(debt) {
    Alert.alert(
      'Saldar deuda previa',
      `¿Confirmar que se pagó ${formatMoney(debt.pendingAmount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await markAsPaid(debt.id);
            setRefreshTick(t => t + 1);
            load();
          }
        }
      ]
    );
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

  function openEditAdjModal(adj) {
    setEditAdjId(adj.id);
    setEditAdjType(adj.amount < 0 ? 'deuda' : 'cobro');
    setEditAdjDescription(adj.description);
    setEditAdjAmount(String(Math.abs(adj.amount)));
    setEditAdjModal(true);
  }

  async function handleSaveEditAdj() {
    const amount = parseFloat((editAdjAmount || '0').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.');
      return;
    }
    const signedAmount = editAdjType === 'deuda' ? -amount : amount;
    await updatePlayerAdjustment(playerId, editAdjId, {
      description: editAdjDescription,
      amount: signedAmount,
    });
    setEditAdjModal(false);
    load();
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
            {seasonId
              ? `${playerName} todavía no tiene partidas cerradas en ${seasonName}.`
              : `${playerName} todavía no tiene partidas cerradas.`}
          </Text>
          <TouchableOpacity style={styles.adjAddBtnEmpty} onPress={openAdjModal}>
            <Text style={styles.adjAddText}>+ Agregar deuda previa</Text>
          </TouchableOpacity>
        </View>
        {adjModalView()}
      </SafeAreaView>
    );
  }

  const heroLabel = seasonId ? 'BALANCE DE LA TEMPORADA' : 'BALANCE HISTÓRICO';
  const heroValue = seasonId ? stats.sessionBalance : stats.totalBalance;
  const totalIsPositive = heroValue >= 0;

  function adjModalView() {
    return (
      <Modal visible={adjModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Deuda previa</Text>

            {/* Toggle cobro / deuda */}
            <View style={styles.adjTypeRow}>
              <TouchableOpacity
                style={[styles.adjTypeBtn, adjType === 'cobro' && styles.adjTypeBtnCobro]}
                onPress={() => setAdjType('cobro')}>
                <Text style={[styles.adjTypeTxt, adjType === 'cobro' && { color: C.green }]}>
                  <Text style={styles.adjTypeEmoji}>💰 </Text>
                  Me debe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adjTypeBtn, adjType === 'deuda' && styles.adjTypeBtnDeuda]}
                onPress={() => setAdjType('deuda')}>
                <Text style={[styles.adjTypeTxt, adjType === 'deuda' && { color: C.red }]}>
                  <Text style={styles.adjTypeEmoji}>💸 </Text>
                  Le debo
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {adjType === 'deuda' ? '¿A QUIÉN LE DEBE?' : '¿QUIÉN LE DEBE?'}
            </Text>
            {otherPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>No hay otros jugadores creados.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.counterpartList}
                contentContainerStyle={styles.gap8}>
                {otherPlayers.map(p => {
                  const selected = p.id === adjCounterpartId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.counterpartChip, selected && styles.counterpartChipSelected]}
                      onPress={() => setAdjCounterpartId(p.id)}
                      activeOpacity={0.75}>
                      <Text style={[styles.counterpartChipText, selected && { color: C.bg }]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

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

  function editAdjModalView() {
    return (
      <Modal visible={editAdjModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Editar ajuste</Text>

            <View style={styles.adjTypeRow}>
              <TouchableOpacity
                style={[styles.adjTypeBtn, editAdjType === 'cobro' && styles.adjTypeBtnCobro]}
                onPress={() => setEditAdjType('cobro')}>
                <Text style={[styles.adjTypeTxt, editAdjType === 'cobro' && { color: C.green }]}>
                  <Text style={styles.adjTypeEmoji}>💰 </Text>
                  Me debe
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adjTypeBtn, editAdjType === 'deuda' && styles.adjTypeBtnDeuda]}
                onPress={() => setEditAdjType('deuda')}>
                <Text style={[styles.adjTypeTxt, editAdjType === 'deuda' && { color: C.red }]}>
                  <Text style={styles.adjTypeEmoji}>💸 </Text>
                  Le debo
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>DESCRIPCIÓN</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor={C.muted}
              value={editAdjDescription}
              onChangeText={setEditAdjDescription}
            />

            <Text style={styles.fieldLabel}>MONTO</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholderTextColor={C.muted}
              value={editAdjAmount}
              onChangeText={setEditAdjAmount}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => setEditAdjModal(false)} color={C.muted} small />
              <Btn label="Guardar" onPress={handleSaveEditAdj} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
        {/* Resumen global */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroLabel}>{heroLabel}</Text>
          <Text style={[styles.heroAmount, { color: totalIsPositive ? C.green : C.red }]}>
            {totalIsPositive ? '+' : ''}{formatMoney(heroValue)}
          </Text>
          {!seasonId && (stats.adjustmentsTotal !== 0 || stats.manualDebtsNet !== 0) && (
            <Text style={styles.adjBreakdown}>
              Partidas {stats.sessionBalance >= 0 ? '+' : ''}{formatMoney(stats.sessionBalance)}
              {stats.adjustmentsTotal !== 0 && (
                <>{'  ·  '}Ajustes {stats.adjustmentsTotal > 0 ? '+' : ''}{formatMoney(stats.adjustmentsTotal)}</>
              )}
              {stats.manualDebtsNet !== 0 && (
                <>{'  ·  '}Deudas previas {stats.manualDebtsNet > 0 ? '+' : ''}{formatMoney(stats.manualDebtsNet)}</>
              )}
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
          const chronological = [...stats.history].reverse();
          return (
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Balance por partida</Text>
              <Text style={styles.chartSubtitle}>Escala x1.000 · deslizá para ver historial</Text>
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
            <Card style={[styles.halfCard, styles.mr6]}>
              <Text style={styles.halfLabel}>🏆 Mejor</Text>
              <Text style={[styles.halfAmount, { color: C.green }]}>
                {stats.bestGame.balance > 0 ? '+' : ''}{formatMoney(stats.bestGame.balance)}
              </Text>
              <Text style={styles.halfSession} numberOfLines={1}>
                {stats.bestGame.sessionName}
              </Text>
            </Card>
            <Card style={[styles.halfCard, styles.ml6]}>
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

        {/* Deudas previas (con contraparte) */}
        <View style={styles.adjSectionHeader}>
          <Text style={[styles.sectionTitle, styles.mb0]}>Deudas previas</Text>
          <TouchableOpacity onPress={openAdjModal} style={styles.adjAddBtn}>
            <Text style={styles.adjAddText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        {manualDebts.length === 0 ? (
          <Text style={styles.adjEmpty}>Sin deudas previas registradas</Text>
        ) : (
          manualDebts.map(debt => {
            const iAmOwed = debt.toPlayer.id === playerId;
            const counterpartName = iAmOwed ? debt.fromPlayer.name : debt.toPlayer.name;
            return (
              <Card key={debt.id}>
                <View style={styles.adjRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.adjDesc}>
                      {iAmOwed ? `${counterpartName} le debe` : `Le debe a ${counterpartName}`}
                    </Text>
                    <Text style={styles.histDate}>{debt.sessionName}</Text>
                  </View>
                  <Text style={[styles.adjAmount, { color: iAmOwed ? C.green : C.red }]}>
                    {iAmOwed ? '+' : '-'}{formatMoney(debt.pendingAmount)}
                  </Text>
                  {!iAmOwed && (
                    <TouchableOpacity
                      onPress={() => handleMarkManualDebtPaid(debt)}
                      style={styles.paidBtn}>
                      <Text style={styles.paidBtnText}>✓</Text>
                    </TouchableOpacity>
                  )}
                  {!debt.isConsolidated && (
                    <TouchableOpacity onPress={() => handleDeleteManualDebt(debt.id)} style={styles.delBtn}>
                      <Text style={styles.delText}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            );
          })
        )}

        {/* Ajustes previos legacy (sin contraparte) */}
        {stats.adjustments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Ajustes previos (sin jugador asociado)</Text>
            {stats.adjustments.map(adj => (
              <Card key={adj.id}>
                <View style={styles.adjRow}>
                  <View style={styles.flex1}>
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
                  <TouchableOpacity onPress={() => openEditAdjModal(adj)} style={styles.delBtn}>
                    <Text style={styles.delText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteAdj(adj.id)} style={styles.delBtn}>
                    <Text style={styles.delText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Deudas pendientes</Text>
        <Card>
          <PlayerDebtsSection key={refreshTick} playerId={playerId} />
        </Card>
        {/* Historial de partidas */}
        {stats.history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Historial de partidas</Text>
            {stats.history.map(h => (
              <Card key={h.sessionId}>
                <View style={styles.histRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.histSession} numberOfLines={1}>{h.sessionName}</Text>
                    <Text style={styles.histDate}>
                      {new Date(h.date).toLocaleDateString('es-AR', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </Text>
                  </View>
                  <View style={styles.alignEnd}>
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
      {editAdjModalView()}
    </SafeAreaView>
  );
}

function createStyles(C) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
    heroCard: { alignItems: 'center', marginBottom: 12 },
    scrollContent: { padding: 16 },
    flex1: { flex: 1 },
    alignEnd: { alignItems: 'flex-end' },
    gap8: { gap: 8 },
    mr6: { marginRight: 6 },
    ml6: { marginLeft: 6 },
    mb0: { marginBottom: 0 },
    heroLabel: { fontSize: 12, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 6 },
    heroAmount: { fontSize: 47, fontWeight: '800', marginBottom: 8 },
    adjBreakdown: { fontSize: 12, color: C.gray, marginBottom: 14 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statItem: { alignItems: 'center', flex: 1 },
    statNum: { fontSize: 22, fontWeight: '800', color: C.white },
    statLabel: { fontSize: 12, color: C.gray, marginTop: 2 },
    statDivider: { width: 1, height: 30, backgroundColor: C.cardBorder },
    row: { flexDirection: 'row', marginBottom: 4 },
    halfCard: { flex: 1, marginBottom: 12 },
    halfLabel: { fontSize: 13, color: C.gray, marginBottom: 6 },
    halfAmount: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    halfSession: { fontSize: 12, color: C.gray },
    chartCard: { marginBottom: 12 },
    chartTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 2 },
    chartSubtitle: { fontSize: 12, color: C.gray, marginBottom: 4 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 10, marginTop: 4 },
    histRow: { flexDirection: 'row', alignItems: 'center' },
    histSession: { fontSize: 16, fontWeight: '600', color: C.white, marginBottom: 3 },
    histDate: { fontSize: 13, color: C.gray },
    histBalance: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
    histDetail: { fontSize: 12, color: C.gray },

    // Ajustes
    adjSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 },
    adjAddBtn: { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 12, paddingVertical: 5 },
    adjAddBtnEmpty: { marginTop: 20, borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
    adjAddText: { fontSize: 15, color: C.accent, fontWeight: '700' },
    adjEmpty: { fontSize: 15, color: C.gray, marginBottom: 12 },
    adjRow: { flexDirection: 'row', alignItems: 'center' },
    adjDesc: { fontSize: 16, fontWeight: '600', color: C.white, marginBottom: 3 },
    adjAmount: { fontSize: 18, fontWeight: '700', marginRight: 4 },
    adjTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    adjTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center' },
    adjTypeBtnCobro: { borderColor: C.green, backgroundColor: C.successSoftBg },
    adjTypeBtnDeuda: { borderColor: C.red, backgroundColor: C.dangerSoftBg },
    adjTypeTxt: { fontSize: 16, fontWeight: '700', color: C.gray },
    adjTypeEmoji: { fontWeight: '400' },
    noPlayersText: { fontSize: 14, color: C.gray, marginBottom: 12 },
    counterpartList: { marginBottom: 16 },
    counterpartChip: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
      borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bg,
    },
    counterpartChipSelected: { backgroundColor: C.accent, borderColor: C.accent },
    counterpartChipText: { fontSize: 14, fontWeight: '600', color: C.white },
    paidBtn: {
      width: 32, height: 32, borderRadius: 16, marginLeft: 4,
      backgroundColor: C.green + '22',
      borderWidth: 1, borderColor: C.green + '55',
      alignItems: 'center', justifyContent: 'center',
    },
    paidBtnText: { fontSize: 17, color: C.green, fontWeight: '700' },
  }),
  };
}
