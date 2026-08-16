import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { calcDebts, calcParticipant } from '../storage/storage';
import {
  getAllDebts, registerPayment, markAsPaid,
  debtStatusLabel, debtStatusColor,
} from '../storage/debts';
import { Card, Btn, formatMoney } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';

export default function DebtScreen({ route }) {
  const { session } = route.params;
  const insets      = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const debtsResult = calcDebts(session);
  const allHaveResult = session.participants.every(p => p.finalAmount !== null);

  const [sessionDebts, setSessionDebts] = useState([]);
  const [payModal, setPayModal]         = useState(null);
  const [payAmount, setPayAmount]       = useState('');
  const [payNote, setPayNote]           = useState('');
  const [loading, setLoading]           = useState(false);

  const loadDebts = useCallback(async () => {
    const all = await getAllDebts();
    setSessionDebts(all.filter(d => d.sessionId === session.id));
  }, [session.id]);

  useFocusEffect(loadDebts);

  function findStoredDebt(from, to) {
    return sessionDebts.find(
      d => d.fromPlayer.name === from && d.toPlayer.name === to
    );
  }

  async function handlePartialPay() {
    const val = parseFloat(payAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      Alert.alert('Monto inválido'); return;
    }
    if (val > payModal.pendingAmount) {
      Alert.alert('Monto inválido', `El máximo es ${formatMoney(payModal.pendingAmount)}`); return;
    }
    setLoading(true);
    await registerPayment(payModal.id, val, payNote);
    setLoading(false);
    setPayModal(null); setPayAmount(''); setPayNote('');
    loadDebts();
  }

  async function handleFullPay() {
    Alert.alert(
      'Saldar deuda',
      `¿Confirmar que ${payModal.fromPlayer.name} pagó todo (${formatMoney(payModal.pendingAmount)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', onPress: async () => {
            setLoading(true);
            await markAsPaid(payModal.id);
            setLoading(false);
            setPayModal(null); setPayAmount(''); setPayNote('');
            loadDebts();
          }
        }
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {!allHaveResult && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠️ Algunos jugadores no tienen resultado final. Los cálculos pueden estar incompletos.
            </Text>
          </View>
        )}

        {/* Balances individuales */}
        <Text style={styles.sectionTitle}>Balance de cada jugador</Text>
        {[...session.participants]
          .filter(p => p.finalAmount !== null)
          .sort((a, b) => calcParticipant(b).balance - calcParticipant(a).balance)
          .map(p => {
            const { balance } = calcParticipant(p);
            return (
              <Card key={p.playerId}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{p.name[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Text style={[styles.balance, {
                    color: balance > 0 ? C.green : balance < 0 ? C.red : C.gray
                  }]}>
                    {balance > 0 ? '+' : ''}{formatMoney(balance)}
                  </Text>
                </View>
              </Card>
            );
          })}

        {/* Pagos pendientes con estado */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>💳 Pagos</Text>

        {debtsResult.length === 0 ? (
          <View style={styles.noDebts}>
            <Text style={styles.noDebtsIcon}>🤝</Text>
            <Text style={styles.noDebtsText}>
              {allHaveResult
                ? '¡Todos mano a mano! No hay pagos pendientes.'
                : 'Registrá todos los resultados para ver los pagos.'}
            </Text>
          </View>
        ) : (
          debtsResult.map((d, i) => {
            const stored = findStoredDebt(d.from, d.to);
            const statusColor = stored ? debtStatusColor(stored.status) : C.red;
            const isPaid = stored?.status === 'paid';

            return (
              <Card key={i} style={styles.debtCard}>
                {/* Fila principal */}
                <View style={styles.debtRow}>
                  <View style={styles.debtPerson}>
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarSmallText}>{d.from[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.debtName}>{d.from}</Text>
                    <Text style={styles.debtVerb}>debe</Text>
                  </View>
                  <View style={styles.debtCenter}>
                    <Text style={[styles.debtAmount, { color: isPaid ? C.green : C.accent }]}>
                      {formatMoney(d.amount)}
                    </Text>
                    <Text style={styles.debtArrow}>→</Text>
                  </View>
                  <View style={styles.debtPerson}>
                    <View style={[styles.avatarSmall, { backgroundColor: C.successSoftBg }]}>
                      <Text style={[styles.avatarSmallText, { color: C.green }]}>{d.to[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.debtName}>{d.to}</Text>
                    <Text style={styles.debtVerb}>cobra</Text>
                  </View>
                </View>

                {/* Estado y pendiente */}
                {stored && (
                  <>
                    <View style={styles.debtStatus}>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {debtStatusLabel(stored.status)}
                        </Text>
                      </View>
                      {!isPaid && (
                        <Text style={styles.pendingLabel}>
                          Pendiente: <Text style={{ color: C.red, fontWeight: '700' }}>{formatMoney(stored.pendingAmount)}</Text>
                        </Text>
                      )}
                    </View>

                    {/* Barra de progreso */}
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, {
                        width: `${((stored.originalAmount - stored.pendingAmount) / stored.originalAmount) * 100}%`,
                        backgroundColor: isPaid ? C.green : C.accent,
                      }]} />
                    </View>

                    {/* Historial de pagos */}
                    {stored.payments.length > 0 && (
                      <View style={styles.paymentsBlock}>
                        {stored.payments.map((p, pi) => (
                          <View key={pi} style={styles.paymentRow}>
                            <Text style={styles.paymentCheck}>✓</Text>
                            <Text style={styles.paymentAmt}>{formatMoney(p.amount)}</Text>
                            {p.note ? <Text style={styles.paymentNote}>{p.note}</Text> : null}
                            <Text style={styles.paymentDate}>
                              {new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {/* Botón registrar pago */}
                {stored && !isPaid && (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => { setPayModal(stored); setPayAmount(''); setPayNote(''); }}
                    activeOpacity={0.8}>
                    <Text style={styles.payBtnText}>+ Registrar pago</Text>
                  </TouchableOpacity>
                )}

                {/* Si no hay stored debt aún (sesión recién cerrada sin sync) */}
                {!stored && (
                  <Text style={styles.noStoredNote}>
                    Cerrá la partida para habilitar el seguimiento de pagos.
                  </Text>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Modal de pago */}
      <Modal visible={!!payModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>
              {payModal?.fromPlayer.name} → {payModal?.toPlayer.name}
            </Text>
            <Text style={styles.modalSub}>
              Pendiente: {payModal ? formatMoney(payModal.pendingAmount) : ''}
            </Text>

            <Text style={styles.fieldLabel}>MONTO QUE PAGA AHORA</Text>
            <TextInput
              style={styles.input}
              placeholder={payModal ? `Máx: ${formatMoney(payModal.pendingAmount)}` : ''}
              placeholderTextColor={C.muted}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              autoFocus
            />

            <Text style={styles.fieldLabel}>NOTA (opcional)</Text>
            <TextInput
              style={[styles.input, { marginBottom: 20 }]}
              placeholder="Ej: efectivo, transferencia..."
              placeholderTextColor={C.muted}
              value={payNote}
              onChangeText={setPayNote}
            />

            <View style={styles.modalBtns}>
              <Btn label="Cancelar"
                onPress={() => { setPayModal(null); setPayAmount(''); setPayNote(''); }}
                color={C.muted} small />
              <Btn label="Parcial" onPress={handlePartialPay} color={C.accent} small loading={loading} />
              <Btn label="Saldó todo" onPress={handleFullPay} color={C.green} small loading={loading} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(C) {
  return StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  warnBox:      {
    backgroundColor: C.warningSoftBg, borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: C.warningSoftBorder,
  },
  warnText:     { fontSize: 15, color: C.accent, lineHeight: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 10 },
  row:          { flexDirection: 'row', alignItems: 'center' },
  avatar:       {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.infoSoftBg, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText:   { fontSize: 16, fontWeight: '700', color: C.accent },
  playerName:   { flex: 1, fontSize: 17, fontWeight: '600', color: C.white },
  balance:      { fontSize: 18, fontWeight: '700' },

  noDebts:      { alignItems: 'center', paddingVertical: 30 },
  noDebtsIcon:  { fontSize: 45, marginBottom: 12 },
  noDebtsText:  { fontSize: 16, color: C.gray, textAlign: 'center', lineHeight: 20 },

  debtCard:     { marginBottom: 10 },
  debtRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  debtPerson:   { flex: 1, alignItems: 'center' },
  avatarSmall:  {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.dangerSoftBg, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  avatarSmallText: { fontSize: 15, fontWeight: '700', color: C.red },
  debtName:     { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 1 },
  debtVerb:     { fontSize: 11, color: C.gray },
  debtCenter:   { alignItems: 'center', paddingHorizontal: 8 },
  debtAmount:   { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  debtArrow:    { fontSize: 16, color: C.muted },

  debtStatus:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText:   { fontSize: 12, fontWeight: '700' },
  pendingLabel: { fontSize: 13, color: C.gray },

  progressBar:  { height: 4, backgroundColor: C.cardBorder, borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  paymentsBlock: { marginBottom: 10 },
  paymentRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  paymentCheck: { fontSize: 12, color: C.green },
  paymentAmt:   { fontSize: 13, fontWeight: '700', color: C.green },
  paymentNote:  { flex: 1, fontSize: 12, color: C.gray },
  paymentDate:  { fontSize: 11, color: C.muted },

  payBtn:       {
    paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed',
    alignItems: 'center',
  },
  payBtnText:   { fontSize: 15, color: C.accent, fontWeight: '700' },
  noStoredNote: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalBox:     { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle:   { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 4 },
  modalSub:     { fontSize: 15, color: C.gray, marginBottom: 20 },
  fieldLabel:   { fontSize: 11, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 8 },
  input:        {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 18, fontWeight: '600', marginBottom: 12,
  },
  modalBtns:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  });
}
