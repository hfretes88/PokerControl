import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, Linking, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  getSession, getPlayers, addParticipant, removeParticipant,
  addBuy, removeBuy, setFinalAmount, closeSession,
  calcParticipant, calcSession, buildWhatsAppSummary
} from '../storage/storage';
import type { Session, Player, Participant } from '../storage/types';
import { Card, Btn, BalanceBadge, Divider, formatMoney } from '../components/UI';
import type { Colors } from '../components/UI';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';
import type { ScreenProps } from '../navigation/types';

export default function SessionScreen({ route, navigation }: ScreenProps<'Session'>) {
  const { sessionId } = route.params;
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [session, setSession] = useState<Session | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [addPlayerModal, setAddPlayerModal] = useState(false);
  const [buyModal, setBuyModal] = useState<Participant | null>(null);
  const [finalModal, setFinalModal] = useState<Participant | null>(null);
  const [buyAmount, setBuyAmount] = useState('');
  const [finalInput, setFinalInput] = useState('');

  const load = useCallback(async () => {
    const s = await getSession(sessionId);
    const p = await getPlayers();
    setSession(s);
    setAllPlayers(p);
    if (s) navigation.setOptions({ title: s.name });
  }, [sessionId, navigation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function availablePlayers(): Player[] {
    if (!session) return [];
    const inSession = new Set(session.participants.map(p => p.playerId));
    return allPlayers.filter(p => !inSession.has(p.id));
  }

  async function handleAddParticipant(player: Player) {
    await addParticipant(sessionId, player);
    setAddPlayerModal(false);
    load();
  }

  async function handleRemoveParticipant(playerId: string, name: string) {
    Alert.alert('Quitar jugador', `¿Quitar a ${name} de esta partida?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive',
        onPress: async () => { await removeParticipant(sessionId, playerId); load(); }
      }
    ]);
  }

  async function handleAddBuy() {
    if (!buyModal) return;
    const amount = parseFloat(buyAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { Alert.alert('Monto inválido'); return; }
    await addBuy(sessionId, buyModal.playerId, amount);
    setBuyAmount('');
    setBuyModal(null);
    load();
  }

  async function handleRemoveBuy(playerId: string, buyIndex: number, amount: number) {
    Alert.alert('Eliminar compra', `¿Eliminar compra de ${formatMoney(amount)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await removeBuy(sessionId, playerId, buyIndex); load(); }
      }
    ]);
  }

  async function handleSetFinal() {
    if (!finalModal) return;
    const amount = parseFloat(finalInput.replace(',', '.'));
    if (isNaN(amount) || amount < 0) { Alert.alert('Monto inválido'); return; }
    await setFinalAmount(sessionId, finalModal.playerId, amount);
    setFinalInput('');
    setFinalModal(null);
    load();
  }

  async function handleCloseSession() {
    if (!session) return;
    const { diff, status } = calcSession(session);
    const msg = Math.abs(diff) > 1
      ? `⚠️ Los montos no cuadran, ${status} ${formatMoney(diff)}.\n¿Cerrar igual?`
      : 'Los montons cuadran bien.\n¿Cerrar y registrar resultados finales?';
    Alert.alert('Cerrar partida', msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar', style: 'destructive',
        onPress: async () => { await closeSession(sessionId); load(); }
      }
    ]);
  }

  async function handleShareWhatsApp() {
    if (!session) return;
    const text = buildWhatsAppSummary(session);
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.');
    }
  }

  if (!session) return null;

  const isClosed = session.status === 'closed';
  const { totalPot, diff } = calcSession(session);
  const modalPaddingBottom = insets.bottom + 16;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}>

        {/* Resumen mesa */}
        <Card style={styles.summaryCard}>
          <Text style={styles.sectionLabel}>POZO TOTAL</Text>
          <Text style={styles.bigPot}>{formatMoney(totalPot)}</Text>
          <View style={styles.row}>
            <Text style={styles.metaText}>{session.participants.length} jugadores</Text>
            {Math.abs(diff) > 1 && (
              <Text style={styles.diffWarn}>⚠ Diferencia: {formatMoney(diff)}</Text>
            )}
          </View>
          {isClosed && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>✓ Partida cerrada</Text>
            </View>
          )}
        </Card>

        {/* Botones de acción rápida */}
        {session.participants.length > 0 && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShareWhatsApp}>
              <Text style={styles.actionIcon}>📤</Text>
              <Text style={styles.actionText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('Debts', { session })}>
              <Text style={styles.actionIcon}>💳</Text>
              <Text style={styles.actionText}>Deudas</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Jugadores</Text>

        {session.participants.map(p => {
          const { totalBought, finalAmount, balance } = calcParticipant(p);
          const hasResult = p.finalAmount !== null;

          return (
            <Card key={p.playerId}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.name[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.playerName}>{p.name}</Text>
                {!isClosed && (
                  <TouchableOpacity
                    onPress={() => handleRemoveParticipant(p.playerId, p.name)}
                    style={styles.p6}>
                    <Text style={styles.removeIcon}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Divider />

              <Text style={styles.label}>Compras de fichas</Text>
              {p.buys.map((b, i) => (
                <View key={i} style={[styles.row, styles.buyRow]}>
                  <Text style={styles.buyText}>🎰 {formatMoney(b.amount)}</Text>
                  <Text style={styles.buyTime}>
                    {new Date(b.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {!isClosed && (
                    <TouchableOpacity
                      onPress={() => handleRemoveBuy(p.playerId, i, b.amount)}
                      style={styles.p4}>
                      <Text style={styles.removeBuyIcon}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {p.buys.length === 0 && (
                <Text style={styles.emptyBuys}>Sin compras aún</Text>
              )}

              <View style={[styles.row, styles.mt6]}>
                <Text style={styles.totalLabel}>Total invertido:</Text>
                <Text style={styles.totalAmount}>{formatMoney(totalBought)}</Text>
              </View>

              {!isClosed && (
                <TouchableOpacity
                  style={styles.addBuyBtn}
                  onPress={() => { setBuyModal(p); setBuyAmount(''); }}>
                  <Text style={styles.addBuyText}>+ Agregar compra</Text>
                </TouchableOpacity>
              )}

              <Divider />

              <View style={styles.row}>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Al terminar tenía</Text>
                  <Text style={styles.finalAmount}>
                    {hasResult ? formatMoney(finalAmount) : '—'}
                  </Text>
                </View>
                <View style={styles.alignEnd}>
                  <Text style={styles.label}>Balance</Text>
                  <BalanceBadge amount={hasResult ? balance : null} />
                </View>
              </View>

              {hasResult && (
                <View style={[styles.balanceBox,
                  balance > 0 ? styles.winBox : balance < 0 ? styles.loseBox : styles.evenBox]}>
                  <Text style={[styles.balanceMsg,
                    { color: balance > 0 ? C.green : balance < 0 ? C.red : C.gray }]}>
                    {balance > 0
                      ? `🏆 Ganó ${formatMoney(balance)}`
                      : balance < 0
                        ? `💸 Debe ${formatMoney(Math.abs(balance))}`
                        : '🤝 Mano a mano'}
                  </Text>
                </View>
              )}

              {!isClosed && (
                <View style={styles.mt10}>
                  <Btn
                    label={hasResult ? 'Editar resultado final' : 'Registrar resultado final'}
                    onPress={() => { setFinalModal(p); setFinalInput(hasResult ? String(finalAmount) : ''); }}
                    color={hasResult ? C.muted : C.green}
                    small
                  />
                </View>
              )}
            </Card>
          );
        })}

        {!isClosed && (
          <TouchableOpacity style={styles.addPlayerBtn} onPress={() => setAddPlayerModal(true)}>
            <Text style={styles.addPlayerText}>👤+  Agregar jugador a la partida</Text>
          </TouchableOpacity>
        )}

        {!isClosed && session.participants.length > 0 && (
          <View style={styles.mt8}>
            <Btn label="🏁  Cerrar partida" onPress={handleCloseSession} color={C.red} />
          </View>
        )}
      </ScrollView>

      {/* Modal agregar jugador */}
      <Modal visible={addPlayerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: modalPaddingBottom }]}>
            <Text style={styles.modalTitle}>Agregar jugador</Text>
            {availablePlayers().length === 0 ? (
              <Text style={styles.noPlayersText}>
                No hay jugadores disponibles. Creá jugadores en la sección Jugadores.
              </Text>
            ) : (
              availablePlayers().map(player => (
                <TouchableOpacity
                  key={player.id}
                  style={styles.playerOption}
                  onPress={() => handleAddParticipant(player)}>
                  <View style={styles.avatarSm}>
                    <Text style={styles.avatarTextSm}>{player.name[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.playerOptionText}>{player.name}</Text>
                  <Text style={styles.addOptionPlus}>+</Text>
                </TouchableOpacity>
              ))
            )}
            <View style={styles.mt12}>
              <Btn label="Cerrar" onPress={() => setAddPlayerModal(false)} color={C.muted} small />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal agregar compra */}
      <Modal visible={!!buyModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: modalPaddingBottom }]}>
            <Text style={styles.modalTitle}>Compra — {buyModal?.name}</Text>
            <Text style={styles.modalSub}>¿Cuánto compra en fichas?</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ej: 20000"
              placeholderTextColor={C.muted}
              value={buyAmount}
              onChangeText={setBuyAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => setBuyModal(null)} color={C.muted} small />
              <Btn label="Registrar" onPress={handleAddBuy} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal resultado final */}
      <Modal visible={!!finalModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: modalPaddingBottom }]}>
            <Text style={styles.modalTitle}>Resultado — {finalModal?.name}</Text>
            <Text style={styles.modalSub}>¿Con cuánto terminó?</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ej: 35000"
              placeholderTextColor={C.muted}
              value={finalInput}
              onChangeText={setFinalInput}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => setFinalModal(null)} color={C.muted} small />
              <Btn label="Guardar" onPress={handleSetFinal} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(C: Colors) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
    // modalTitle se sobreescribe porque en esta pantalla va seguido de modalSub (menos margen)
    modalTitle: { fontSize: 20, fontWeight: '800', color: C.white, marginBottom: 4 },
    summaryCard: { marginBottom: 12, alignItems: 'center' },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 4 },
    scrollContent: { padding: 16 },
    flex1: { flex: 1 },
    alignEnd: { alignItems: 'flex-end' },
    p4: { padding: 4 },
    p6: { padding: 6 },
    mt6: { marginTop: 6 },
    mt8: { marginTop: 8 },
    mt10: { marginTop: 10 },
    mt12: { marginTop: 12 },
    removeIcon: { fontSize: 20, color: C.muted },
    removeBuyIcon: { fontSize: 16, color: C.muted },
    addOptionPlus: { fontSize: 22, color: C.accent },
    bigPot: { fontSize: 43, fontWeight: '800', color: C.accent, marginBottom: 4 },
    metaText: { fontSize: 15, color: C.gray, flex: 1 },
    diffWarn: { fontSize: 13, color: C.red, fontWeight: '600' },
    closedBanner: {
      marginTop: 10, backgroundColor: C.successSoftBg,
      paddingVertical: 6, paddingHorizontal: 16, borderRadius: 8,
    },
    closedText: { fontSize: 15, color: C.green, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    actionBtn: {
      flex: 1, backgroundColor: C.card, borderRadius: 12,
      borderWidth: 1, borderColor: C.cardBorder,
      paddingVertical: 12, alignItems: 'center',
    },
    actionIcon: { fontSize: 25, marginBottom: 4 },
    actionText: { fontSize: 13, fontWeight: '600', color: C.white },
    label: { fontSize: 12, fontWeight: '600', color: C.gray, letterSpacing: 0.5, marginBottom: 6 },
    buyRow: { marginBottom: 5, gap: 6 },
    buyText: { flex: 1, fontSize: 16, color: C.white },
    buyTime: { fontSize: 13, color: C.gray, marginRight: 8 },
    emptyBuys: { fontSize: 15, color: C.gray, marginBottom: 6 },
    totalLabel: { flex: 1, fontSize: 15, color: C.gray },
    totalAmount: { fontSize: 17, fontWeight: '700', color: C.white },
    addBuyBtn: { marginTop: 8, paddingVertical: 6 },
    addBuyText: { fontSize: 16, color: C.accent, fontWeight: '600' },
    finalAmount: { fontSize: 22, fontWeight: '700', color: C.white, marginTop: 2 },
    balanceBox: { marginTop: 10, padding: 10, borderRadius: 10, alignItems: 'center' },
    winBox: { backgroundColor: C.infoSoftBg },
    loseBox: { backgroundColor: C.dangerSoftBg },
    evenBox: { backgroundColor: C.neutralSoftBg },
    balanceMsg: { fontSize: 17, fontWeight: '700' },
    addPlayerBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderWidth: 1, borderColor: C.cardBorder,
      borderRadius: 12, borderStyle: 'dashed', marginBottom: 12,
    },
    addPlayerText: { fontSize: 17, color: C.accent, fontWeight: '600' },
    noPlayersText: { fontSize: 16, color: C.gray, marginBottom: 16, lineHeight: 20 },
    playerOption: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
    },
    playerOptionText: { flex: 1, fontSize: 17, color: C.white, fontWeight: '500' },
  }),
  };
}
