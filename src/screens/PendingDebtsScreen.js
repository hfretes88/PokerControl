import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  getPendingDebtsByDebtor,
  registerPayment,
  markAsPaid,
  debtStatusLabel,
  debtStatusColor,
} from '../storage/debts';
import { C, Card, Btn, formatMoney } from '../components/UI';

// ─── Modal de pago ────────────────────────────────────────────
function PaymentModal({ debt, visible, onClose, onPaid }) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount]   = useState('');
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);

  function reset() { setAmount(''); setNote(''); }

  async function handlePartial() {
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a cero.');
      return;
    }
    if (val > debt.pendingAmount) {
      Alert.alert('Monto inválido', `El máximo pendiente es ${formatMoney(debt.pendingAmount)}.`);
      return;
    }
    setLoading(true);
    await registerPayment(debt.id, val, note);
    setLoading(false);
    reset();
    onPaid();
  }

  async function handleFull() {
    Alert.alert(
      'Marcar como saldada',
      `¿Confirmar que ${debt.fromPlayer.name} pagó todo (${formatMoney(debt.pendingAmount)})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', onPress: async () => {
            setLoading(true);
            await markAsPaid(debt.id);
            setLoading(false);
            reset();
            onPaid();
          }
        }
      ]
    );
  }

  if (!debt) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}>
        <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>Registrar pago</Text>

          {/* Info de la deuda */}
          <View style={styles.debtSummary}>
            <View style={styles.debtPlayers}>
              <View style={styles.playerChip}>
                <Text style={styles.playerChipText}>{debt.fromPlayer.name}</Text>
              </View>
              <Text style={styles.debtArrow}>→</Text>
              <View style={[styles.playerChip, styles.playerChipGreen]}>
                <Text style={[styles.playerChipText, { color: C.green }]}>{debt.toPlayer.name}</Text>
              </View>
            </View>
            <Text style={styles.debtSession}>{debt.sessionName}</Text>
            <View style={styles.debtAmounts}>
              <View style={styles.debtAmountCol}>
                <Text style={styles.debtAmountLabel}>Original</Text>
                <Text style={styles.debtAmountVal}>{formatMoney(debt.originalAmount)}</Text>
              </View>
              <View style={styles.debtAmountDivider} />
              <View style={styles.debtAmountCol}>
                <Text style={styles.debtAmountLabel}>Pendiente</Text>
                <Text style={[styles.debtAmountVal, { color: C.red }]}>{formatMoney(debt.pendingAmount)}</Text>
              </View>
              {debt.payments.length > 0 && (
                <>
                  <View style={styles.debtAmountDivider} />
                  <View style={styles.debtAmountCol}>
                    <Text style={styles.debtAmountLabel}>Ya pagó</Text>
                    <Text style={[styles.debtAmountVal, { color: C.green }]}>
                      {formatMoney(debt.originalAmount - debt.pendingAmount)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Pago parcial */}
          <Text style={styles.fieldLabel}>MONTO QUE PAGA AHORA</Text>
          <TextInput
            style={styles.input}
            placeholder={`Máx: ${formatMoney(debt.pendingAmount)}`}
            placeholderTextColor={C.muted}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            autoFocus
          />

          <Text style={styles.fieldLabel}>NOTA (opcional)</Text>
          <TextInput
            style={[styles.input, { marginBottom: 20 }]}
            placeholder="Ej: pagó en efectivo"
            placeholderTextColor={C.muted}
            value={note}
            onChangeText={setNote}
          />

          <View style={styles.modalBtns}>
            <Btn label="Cancelar" onPress={() => { reset(); onClose(); }} color={C.muted} small />
            <Btn label="Pago parcial" onPress={handlePartial} color={C.accent} small loading={loading} />
            <Btn label="Saldó todo" onPress={handleFull} color={C.green} small loading={loading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Card de deuda individual ─────────────────────────────────
function DebtCard({ debt, onPay }) {
  const paidPct = Math.round(
    ((debt.originalAmount - debt.pendingAmount) / debt.originalAmount) * 100
  );
  const statusColor = debtStatusColor(debt.status);

  return (
    <View style={styles.debtCard}>
      {/* Header */}
      <View style={styles.debtCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.debtCardSession}>{debt.sessionName}</Text>
          <Text style={styles.debtCardDate}>
            {new Date(debt.createdAt).toLocaleDateString('es-AR', {
              day: '2-digit', month: 'short', year: 'numeric'
            })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {debtStatusLabel(debt.status)}
            </Text>
          </View>
          <Text style={[styles.debtPending, { color: debt.status === 'paid' ? C.green : C.red }]}>
            {debt.status === 'paid' ? 'Saldada' : formatMoney(debt.pendingAmount)}
          </Text>
        </View>
      </View>

      {/* Barra de progreso */}
      {debt.originalAmount > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {
            width: `${100 - paidPct}%`,
            backgroundColor: debt.status === 'paid' ? C.green : C.red,
          }]} />
        </View>
      )}

      {/* Historial de pagos */}
      {debt.payments.length > 0 && (
        <View style={styles.paymentsHistory}>
          {debt.payments.map((p, i) => (
            <View key={i} style={styles.paymentRow}>
              <Text style={styles.paymentIcon}>✓</Text>
              <Text style={styles.paymentAmount}>{formatMoney(p.amount)}</Text>
              {p.note ? <Text style={styles.paymentNote}>{p.note}</Text> : null}
              <Text style={styles.paymentDate}>
                {new Date(p.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Botón pagar */}
      {debt.status !== 'paid' && (
        <TouchableOpacity style={styles.payBtn} onPress={() => onPay(debt)} activeOpacity={0.8}>
          <Text style={styles.payBtnText}>+ Registrar pago</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Screen principal ─────────────────────────────────────────
export default function PendingDebtsScreen() {
  const insets = useSafeAreaInsets();
  const [groups, setGroups]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [payModal, setPayModal] = useState(null); // debt seleccionada

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const data = await getPendingDebtsByDebtor();
    setGroups(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.loadingText}>Cargando deudas...</Text>
      </SafeAreaView>
    );
  }

  if (groups.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🤝</Text>
          <Text style={styles.emptyText}>Sin deudas pendientes</Text>
          <Text style={styles.emptyMuted}>
            Todos los balances están saldados.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {groups.map(group => (
          <View key={group.player.id} style={styles.group}>

            {/* Header del deudor */}
            <View style={styles.groupHeader}>
              <View style={styles.groupAvatar}>
                <Text style={styles.groupAvatarText}>
                  {group.player.name[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{group.player.name}</Text>
                <Text style={styles.groupSub}>
                  {group.debts.length} deuda{group.debts.length > 1 ? 's' : ''} pendiente{group.debts.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.groupTotalBox}>
                <Text style={styles.groupTotalLabel}>Total debe</Text>
                <Text style={styles.groupTotal}>{formatMoney(group.totalPending)}</Text>
              </View>
            </View>

            {/* Deudas del jugador */}
            {group.debts.map(debt => (
              <DebtCard
                key={debt.id}
                debt={debt}
                onPay={d => setPayModal(d)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      <PaymentModal
        debt={payModal}
        visible={!!payModal}
        onClose={() => setPayModal(null)}
        onPaid={() => { setPayModal(null); load(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  loadingText:   { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 16 },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon:     { fontSize: 50, marginBottom: 16 },
  emptyText:     { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted:    { fontSize: 13, color: C.gray, textAlign: 'center' },

  // Grupo por deudor
  group:         { marginBottom: 20 },
  groupHeader:   {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, gap: 12,
  },
  groupAvatar:   {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1a3a4a', alignItems: 'center', justifyContent: 'center',
  },
  groupAvatarText: { fontSize: 18, fontWeight: '700', color: C.accent },
  groupName:     { fontSize: 16, fontWeight: '800', color: C.white },
  groupSub:      { fontSize: 12, color: C.gray, marginTop: 2 },
  groupTotalBox: { alignItems: 'flex-end' },
  groupTotalLabel: { fontSize: 10, color: C.gray, marginBottom: 2 },
  groupTotal:    { fontSize: 18, fontWeight: '800', color: C.red },

  // Card de deuda
  debtCard:      {
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 14, marginBottom: 8, marginLeft: 16,
  },
  debtCardHeader:  { flexDirection: 'row', marginBottom: 10 },
  debtCardSession: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 3 },
  debtCardDate:    { fontSize: 11, color: C.gray },
  statusBadge:     {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, marginBottom: 4,
  },
  statusText:    { fontSize: 11, fontWeight: '700' },
  debtPending:   { fontSize: 16, fontWeight: '800' },

  // Barra de progreso
  progressBar:   {
    height: 4, backgroundColor: C.cardBorder,
    borderRadius: 2, marginBottom: 10, overflow: 'hidden',
  },
  progressFill:  { height: '100%', borderRadius: 2 },

  // Historial de pagos
  paymentsHistory: { marginBottom: 10 },
  paymentRow:    {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingVertical: 3,
  },
  paymentIcon:   { fontSize: 12, color: C.green },
  paymentAmount: { fontSize: 13, fontWeight: '700', color: C.green },
  paymentNote:   { flex: 1, fontSize: 12, color: C.gray },
  paymentDate:   { fontSize: 11, color: C.muted },

  // Botón pagar
  payBtn:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed',
  },
  payBtnText:    { fontSize: 13, color: C.accent, fontWeight: '700' },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox:      {
    backgroundColor: C.card, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24,
  },
  modalTitle:    { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 16 },

  debtSummary:   {
    backgroundColor: C.bg, borderRadius: 12,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  debtPlayers:   {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, marginBottom: 8,
  },
  playerChip:    {
    backgroundColor: '#2a0d0d', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: C.red + '44',
  },
  playerChipGreen: {
    backgroundColor: '#0d2a1a', borderColor: C.green + '44',
  },
  playerChipText:  { fontSize: 14, fontWeight: '700', color: C.red },
  debtArrow:     { fontSize: 18, color: C.muted },
  debtSession:   { fontSize: 12, color: C.gray, textAlign: 'center', marginBottom: 12 },
  debtAmounts:   { flexDirection: 'row', alignItems: 'center' },
  debtAmountCol: { flex: 1, alignItems: 'center' },
  debtAmountLabel: { fontSize: 10, color: C.gray, marginBottom: 4 },
  debtAmountVal: { fontSize: 16, fontWeight: '800', color: C.white },
  debtAmountDivider: { width: 1, height: 30, backgroundColor: C.cardBorder },

  fieldLabel:    {
    fontSize: 10, fontWeight: '700', color: C.gray,
    letterSpacing: 1, marginBottom: 8,
  },
  input:         {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1,
    borderColor: C.cardBorder, padding: 13,
    color: C.white, fontSize: 16, fontWeight: '600', marginBottom: 12,
  },
  modalBtns:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
