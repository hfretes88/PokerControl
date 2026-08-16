import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  getPendingDebtsByDebtor,
  registerPayment,
  markAsPaid,
  reNetAllDebts,
  undoReNet,
  canUndoReNet,
  hasDebtsToReorganize,
  debtStatusLabel,
  debtStatusColor,
} from '../storage/debts';
import { Btn, formatMoney } from '../components/UI';
import { useTheme } from '../theme/ThemeContext';

function buildWhatsAppText(groups) {
  if (groups.length === 0) return '🤝 No hay deudas pendientes.';

  let text = `💳 RESUMEN DE PAGOS PENDIENTES\n`;

  groups.forEach(group => {
    text += `\n${group.player.name} paga: $${group.totalPending.toLocaleString('es-AR')}\n`;

    const byCreditor = {};
    group.debts.forEach(d => {
      const key = d.toPlayer.id;
      if (!byCreditor[key]) byCreditor[key] = { name: d.toPlayer.name, total: 0 };
      byCreditor[key].total += d.pendingAmount;
    });

    Object.values(byCreditor).forEach(creditor => {
      text += `•  A ${creditor.name}: $${creditor.total.toLocaleString('es-AR')}\n`;
    });
  });

  return text;
}

// ─── Modal de pago ────────────────────────────────────────────
function PaymentModal({ debt, visible, onClose, onPaid }) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
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
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const paidPct = Math.round(
    ((debt.originalAmount - debt.pendingAmount) / debt.originalAmount) * 100
  );
  const statusColor = debtStatusColor(debt.status);

  return (
    <View style={styles.debtCard}>
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

      {debt.originalAmount > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, {
            width: `${100 - paidPct}%`,
            backgroundColor: debt.status === 'paid' ? C.green : C.red,
          }]} />
        </View>
      )}

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
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [groups, setGroups]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [payModal, setPayModal]     = useState(null);
  const [undoState, setUndoState]   = useState({ canUndo: false, reason: null }); // estado del botón deshacer
  const [canReorganize, setCanReorganize] = useState(false);

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    setLoading(true);
    const [data, undoStatus, reorganizable] = await Promise.all([
      getPendingDebtsByDebtor(),
      canUndoReNet(),
      hasDebtsToReorganize(),
    ]);
    setGroups(data);
    setUndoState(undoStatus);
    setCanReorganize(reorganizable);
    setLoading(false);
  }

  async function handleShare() {
    const text = buildWhatsAppText(groups);
    try {
      await Share.share({ message: text, title: 'Deudas pendientes' });
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  }

  async function handleReNet() {
    Alert.alert(
      'Reorganizar deudas',
      'Esto va a netear y consolidar todas las deudas pendientes entre los mismos jugadores. Podrás deshacer si no hay pagos registrados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reorganizar',
          onPress: async () => {
            await reNetAllDebts();
            load();
          }
        }
      ]
    );
  }

  async function handleUndo() {
    Alert.alert(
      'Deshacer reorganización',
      '¿Restaurar las deudas al estado anterior a la última reorganización?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer',
          style: 'destructive',
          onPress: async () => {
            try {
              await undoReNet();
              load();
            } catch (err) {
              Alert.alert('No se puede deshacer', err.message);
            }
          }
        }
      ]
    );
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
          <Text style={styles.emptyMuted}>Todos los balances están saldados.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>

        {/* Botones de acción */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <Text style={styles.shareBtnIcon}>📤</Text>
          <Text style={styles.shareBtnText}>Compartir por WhatsApp</Text>
        </TouchableOpacity>

        {/* Botón reorganizar / deshacer */}
        {undoState.canUndo ? (
          // Hay backup y no hay pagos → mostrar "Deshacer"
          <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} activeOpacity={0.8}>
            <Text style={styles.reNetBtnIcon}>↩</Text>
            <Text style={styles.undoBtnText}>Deshacer reorganización</Text>
          </TouchableOpacity>
        ) : undoState.reason === 'has_payments' ? (
          // Hay backup pero hay pagos → bloqueado
          <View style={[styles.reNetBtn, styles.reNetBtnDisabled]}>
            <Text style={styles.reNetBtnIcon}>🔒</Text>
            <Text style={styles.reNetBtnTextDisabled}>Reorganizar (bloqueado por pagos)</Text>
          </View>
        ) : !canReorganize ? (
          // Nada para consolidar: las deudas ya se netean solas al cerrar cada partida
          <View style={[styles.reNetBtn, styles.reNetBtnDisabled]}>
            <Text style={styles.reNetBtnIcon}>✓</Text>
            <Text style={styles.reNetBtnTextDisabled}>No hay deudas para reorganizar</Text>
          </View>
        ) : (
          // Hay 2+ deudas pendientes entre el mismo par → reorganizar disponible
          <TouchableOpacity style={styles.reNetBtn} onPress={handleReNet} activeOpacity={0.8}>
            <Text style={styles.reNetBtnIcon}>⚡</Text>
            <Text style={styles.reNetBtnText}>Reorganizar deudas</Text>
          </TouchableOpacity>
        )}

        {groups.map(group => (
          <View key={group.player.id} style={styles.group}>
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

function createStyles(C) {
  return StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  loadingText:   { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 18 },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon:     { fontSize: 56, marginBottom: 16 },
  emptyText:     { fontSize: 20, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted:    { fontSize: 15, color: C.gray, textAlign: 'center' },

  // Botones de acción
  shareBtn:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.successSoftBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.green + '44',
    paddingVertical: 12, gap: 8, marginBottom: 10,
  },
  shareBtnIcon:  { fontSize: 20 },
  shareBtnText:  { fontSize: 16, fontWeight: '700', color: C.green },
  reNetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.neutralSoftBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.accent + '55',
    paddingVertical: 12, gap: 8, marginBottom: 16,
  },
  reNetBtnDisabled: {
    backgroundColor: C.card, borderColor: C.muted + '44', opacity: 0.5,
  },
  reNetBtnIcon:      { fontSize: 18 },
  reNetBtnText:      { fontSize: 16, fontWeight: '700', color: C.accent },
  reNetBtnTextDisabled: { fontSize: 15, fontWeight: '600', color: C.muted },
  undoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.infoSoftBg, borderRadius: 12,
    borderWidth: 1, borderColor: C.infoSoftBorder,
    paddingVertical: 12, gap: 8, marginBottom: 16,
  },
  undoBtnText: { fontSize: 16, fontWeight: '700', color: C.accent },

  // Grupo por deudor
  group:         { marginBottom: 20 },
  groupHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  groupAvatar:   {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.infoSoftBg, alignItems: 'center', justifyContent: 'center',
  },
  groupAvatarText: { fontSize: 20, fontWeight: '700', color: C.accent },
  groupName:     { fontSize: 18, fontWeight: '800', color: C.white },
  groupSub:      { fontSize: 13, color: C.gray, marginTop: 2 },
  groupTotalBox: { alignItems: 'flex-end' },
  groupTotalLabel: { fontSize: 11, color: C.gray, marginBottom: 2 },
  groupTotal:    { fontSize: 20, fontWeight: '800', color: C.red },

  // Card de deuda
  debtCard:      {
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 14, marginBottom: 8, marginLeft: 16,
  },
  debtCardHeader:  { flexDirection: 'row', marginBottom: 10 },
  debtCardSession: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 3 },
  debtCardDate:    { fontSize: 12, color: C.gray },
  statusBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginBottom: 4 },
  statusText:    { fontSize: 12, fontWeight: '700' },
  debtPending:   { fontSize: 18, fontWeight: '800' },
  progressBar:   { height: 4, backgroundColor: C.cardBorder, borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 2 },
  paymentsHistory: { marginBottom: 10 },
  paymentRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  paymentIcon:   { fontSize: 13, color: C.green },
  paymentAmount: { fontSize: 15, fontWeight: '700', color: C.green },
  paymentNote:   { flex: 1, fontSize: 13, color: C.gray },
  paymentDate:   { fontSize: 12, color: C.muted },
  payBtn:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: C.accent, borderStyle: 'dashed',
  },
  payBtnText:    { fontSize: 15, color: C.accent, fontWeight: '700' },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalBox:      { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: C.white, marginBottom: 16 },
  debtSummary:   { backgroundColor: C.bg, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.cardBorder },
  debtPlayers:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 },
  playerChip:    { backgroundColor: C.dangerSoftBg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.red + '44' },
  playerChipGreen: { backgroundColor: C.successSoftBg, borderColor: C.green + '44' },
  playerChipText:  { fontSize: 16, fontWeight: '700', color: C.red },
  debtArrow:     { fontSize: 20, color: C.muted },
  debtSession:   { fontSize: 13, color: C.gray, textAlign: 'center', marginBottom: 12 },
  debtAmounts:   { flexDirection: 'row', alignItems: 'center' },
  debtAmountCol: { flex: 1, alignItems: 'center' },
  debtAmountLabel: { fontSize: 11, color: C.gray, marginBottom: 4 },
  debtAmountVal: { fontSize: 18, fontWeight: '800', color: C.white },
  debtAmountDivider: { width: 1, height: 30, backgroundColor: C.cardBorder },
  fieldLabel:    { fontSize: 11, fontWeight: '700', color: C.gray, letterSpacing: 1, marginBottom: 8 },
  input:         { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, padding: 13, color: C.white, fontSize: 18, fontWeight: '600', marginBottom: 12 },
  modalBtns:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  });
}