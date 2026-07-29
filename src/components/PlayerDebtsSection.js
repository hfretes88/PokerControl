/**
 * PlayerDebtsSection
 * Muestra deudas agrupadas por jugador (no por deuda individual).
 * "Debe pagar" → agrupa por acreedor (toPlayer)
 * "Le deben"   → agrupa por deudor (fromPlayer)
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getDebtsForPlayer, markAsPaid,
  debtStatusColor,
} from '../storage/debts';
import { C, formatMoney } from './UI';

// ─── Agrupar deudas por jugador ───────────────────────────────
function groupByPlayer(debts, playerKey) {
  const map = {};
  debts.forEach(d => {
    const key = d[playerKey].id;
    if (!map[key]) {
      map[key] = {
        player:       d[playerKey],
        totalPending: 0,
        sessions:     [],
        debts:        [],
      };
    }
    map[key].totalPending += d.pendingAmount;
    map[key].debts.push(d);
    // Sesiones únicas
    if (!map[key].sessions.includes(d.sessionName)) {
      map[key].sessions.push(d.sessionName);
    }
  });
  return Object.values(map).sort((a, b) => b.totalPending - a.totalPending);
}

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

  async function handleMarkAllPaid(debts, playerName) {
    const total = debts.reduce((sum, d) => sum + d.pendingAmount, 0);
    Alert.alert(
      'Saldar deudas',
      `¿Marcar ${formatMoney(total)} con ${playerName} como saldado?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await Promise.all(debts.map(d => markAsPaid(d.id)));
            load();
          }
        }
      ]
    );
  }

  const owesGroups = groupByPlayer(owes, 'toPlayer');
  const owedGroups = groupByPlayer(owed, 'fromPlayer');

  const totalOwes = owes.reduce((s, d) => s + d.pendingAmount, 0);
  const totalOwed = owed.reduce((s, d) => s + d.pendingAmount, 0);

  if (owesGroups.length === 0 && owedGroups.length === 0) {
    return (
      <View style={styles.clean}>
        <Text style={styles.cleanText}>🤝 Sin deudas pendientes</Text>
      </View>
    );
  }

  return (
    <View>

      {/* Lo que debe — agrupado por acreedor */}
      {owesGroups.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Debe pagar</Text>
            <Text style={[styles.sectionTotal, { color: C.red }]}>
              {formatMoney(totalOwes)}
            </Text>
          </View>

          {owesGroups.map(group => (
            <View key={group.player.id} style={styles.debtRow}>
              <View style={styles.debtAvatar}>
                <Text style={styles.debtAvatarText}>
                  {group.player.name[0].toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.debtNameRow}>
                  <Text style={styles.debtArrow}>→</Text>
                  <Text style={styles.debtPlayerName}>{group.player.name}</Text>
                </View>
                <Text style={styles.debtMeta}>
                  {group.debts.length} deuda{group.debts.length > 1 ? 's' : ''}
                  {' · '}
                  {group.sessions.length === 1
                    ? group.sessions[0]
                    : `${group.sessions.length} partidas`}
                </Text>
              </View>

              <Text style={[styles.debtAmount, { color: C.red }]}>
                {formatMoney(group.totalPending)}
              </Text>

              <TouchableOpacity
                style={styles.paidBtn}
                onPress={() => handleMarkAllPaid(group.debts, group.player.name)}>
                <Text style={styles.paidBtnText}>✓</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Lo que le deben — agrupado por deudor */}
      {owedGroups.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Le deben</Text>
            <Text style={[styles.sectionTotal, { color: C.green }]}>
              {formatMoney(totalOwed)}
            </Text>
          </View>

          {owedGroups.map(group => (
            <View key={group.player.id} style={styles.debtRow}>
              <View style={[styles.debtAvatar, { backgroundColor: '#0d2a1a' }]}>
                <Text style={[styles.debtAvatarText, { color: C.green }]}>
                  {group.player.name[0].toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.debtNameRow}>
                  <Text style={[styles.debtArrow, { color: C.green }]}>←</Text>
                  <Text style={styles.debtPlayerName}>{group.player.name}</Text>
                </View>
                <Text style={styles.debtMeta}>
                  {group.debts.length} deuda{group.debts.length > 1 ? 's' : ''}
                  {' · '}
                  {group.sessions.length === 1
                    ? group.sessions[0]
                    : `${group.sessions.length} partidas`}
                </Text>
              </View>

              <Text style={[styles.debtAmount, { color: C.green }]}>
                {formatMoney(group.totalPending)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clean:         { paddingVertical: 12, alignItems: 'center' },
  cleanText:     { fontSize: 13, color: C.gray },

  section:       { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: C.gray, letterSpacing: 0.5 },
  sectionTotal:  { fontSize: 16, fontWeight: '800' },

  debtRow:       {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 10,
    padding: 12, marginBottom: 8, gap: 10,
  },
  debtAvatar:    {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2a0d0d',
    alignItems: 'center', justifyContent: 'center',
  },
  debtAvatarText: { fontSize: 15, fontWeight: '700', color: C.red },

  debtNameRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  debtArrow:     { fontSize: 13, color: C.red, fontWeight: '700' },
  debtPlayerName:{ fontSize: 14, fontWeight: '700', color: C.white },
  debtMeta:      { fontSize: 11, color: C.muted },

  debtAmount:    { fontSize: 15, fontWeight: '800' },

  paidBtn:       {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.green + '22',
    borderWidth: 1, borderColor: C.green + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  paidBtnText:   { fontSize: 15, color: C.green, fontWeight: '700' },
});
