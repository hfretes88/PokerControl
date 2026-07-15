/**
 * PlayerDebtsSection
 * Componente reutilizable para mostrar las deudas de un jugador.
 * Se agrega dentro de StatsScreen.
 *
 * Uso:
 *   import PlayerDebtsSection from '../components/PlayerDebtsSection';
 *   <PlayerDebtsSection playerId={playerId} />
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getDebtsForPlayer, markAsPaid,
  debtStatusLabel, debtStatusColor,
} from '../storage/debts';
import { C, Card, formatMoney } from './UI';

export default function PlayerDebtsSection({ playerId }) {
  const [owes, setOwes] = useState([]);  // lo que debe
  const [owed, setOwed] = useState([]);  // lo que le deben

  useFocusEffect(
    useCallback(() => { load(); }, [playerId])
  );

  async function load() {
    const { owes: o, owed: d } = await getDebtsForPlayer(playerId);
    setOwes(o.filter(d => d.status !== 'paid'));
    setOwed(d.filter(d => d.status !== 'paid'));
  }

  async function handleMarkPaid(debt) {
    Alert.alert(
      'Saldar deuda',
      `¿Marcar como saldada la deuda de ${formatMoney(debt.pendingAmount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: async () => { await markAsPaid(debt.id); load(); } }
      ]
    );
  }

  const totalOwes = owes.reduce((s, d) => s + d.pendingAmount, 0);
  const totalOwed = owed.reduce((s, d) => s + d.pendingAmount, 0);

  if (owes.length === 0 && owed.length === 0) {
    return (
      <View style={styles.clean}>
        <Text style={styles.cleanText}>🤝 Sin deudas pendientes</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Lo que debe */}
      {owes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Debe pagar</Text>
            <Text style={[styles.sectionTotal, { color: C.red }]}>{formatMoney(totalOwes)}</Text>
          </View>
          {owes.map(debt => (
            <View key={debt.id} style={styles.debtRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.debtTo}>
                  → <Text style={{ color: C.accent }}>{debt.toPlayer.name}</Text>
                </Text>
                <Text style={styles.debtSession}>{debt.sessionName}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.debtAmount}>{formatMoney(debt.pendingAmount)}</Text>
                <View style={[styles.badge, { backgroundColor: debtStatusColor(debt.status) + '22' }]}>
                  <Text style={[styles.badgeText, { color: debtStatusColor(debt.status) }]}>
                    {debtStatusLabel(debt.status)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.paidBtn} onPress={() => handleMarkPaid(debt)}>
                <Text style={styles.paidBtnText}>✓</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Lo que le deben */}
      {owed.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Le deben</Text>
            <Text style={[styles.sectionTotal, { color: C.green }]}>{formatMoney(totalOwed)}</Text>
          </View>
          {owed.map(debt => (
            <View key={debt.id} style={styles.debtRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.debtTo}>
                  ← <Text style={{ color: C.red }}>{debt.fromPlayer.name}</Text>
                </Text>
                <Text style={styles.debtSession}>{debt.sessionName}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.debtAmount, { color: C.green }]}>{formatMoney(debt.pendingAmount)}</Text>
                <View style={[styles.badge, { backgroundColor: debtStatusColor(debt.status) + '22' }]}>
                  <Text style={[styles.badgeText, { color: debtStatusColor(debt.status) }]}>
                    {debtStatusLabel(debt.status)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clean:        { paddingVertical: 12, alignItems: 'center' },
  cleanText:    { fontSize: 13, color: C.gray },
  section:      { marginBottom: 16 },
  sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.gray, letterSpacing: 0.5 },
  sectionTotal: { fontSize: 15, fontWeight: '800' },
  debtRow:      {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 10,
    padding: 10, marginBottom: 6, gap: 8,
  },
  debtTo:       { fontSize: 13, fontWeight: '600', color: C.white, marginBottom: 2 },
  debtSession:  { fontSize: 11, color: C.muted },
  debtAmount:   { fontSize: 14, fontWeight: '800', color: C.red, marginBottom: 3 },
  badge:        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  paidBtn:      {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  paidBtnText:  { fontSize: 14, color: C.green, fontWeight: '700' },
});
