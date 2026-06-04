import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calcDebts, calcParticipant } from '../storage/storage';
import { C, Card, formatMoney } from '../components/UI';
import { GS } from '../components/GlobalStyles';

export default function DebtScreen({ route }) {
  const { session } = route.params;
  const insets = useSafeAreaInsets();
  const debts = calcDebts(session);
  const allHaveResult = session.participants.every(p => p.finalAmount !== null);

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

        {/* Pagos pendientes */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>💳 Pagos pendientes</Text>

        {debts.length === 0 ? (
          <View style={styles.noDebts}>
            <Text style={styles.noDebtsIcon}>🤝</Text>
            <Text style={styles.noDebtsText}>
              {allHaveResult
                ? '¡Todos mano a mano! No hay pagos pendientes.'
                : 'Registrá todos los resultados para ver los pagos.'}
            </Text>
          </View>
        ) : (
          debts.map((d, i) => (
            <Card key={i} style={styles.debtCard}>
              <View style={styles.debtRow}>
                <View style={styles.debtPerson}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{d.from[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.debtName}>{d.from}</Text>
                  <Text style={styles.debtLabel}>paga</Text>
                </View>
                <View style={styles.debtAmountBox}>
                  <Text style={styles.debtAmount}>{formatMoney(d.amount)}</Text>
                  <Text style={styles.debtArrow}>→</Text>
                </View>
                <View style={styles.debtPerson}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{d.to[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.debtName}>{d.to}</Text>
                  <Text style={styles.debtLabel}>recibe</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  ...GS,
  ...StyleSheet.create({
    warnBox: {
      backgroundColor: '#2a1f00', borderRadius: 10, padding: 12, marginBottom: 16,
      borderWidth: 1, borderColor: '#4a3a00',
    },
    warnText: { fontSize: 13, color: C.accent, lineHeight: 18 },
    balance: { fontSize: 16, fontWeight: '700' },
    noDebts: { alignItems: 'center', paddingVertical: 30 },
    noDebtsIcon: { fontSize: 40, marginBottom: 12 },
    noDebtsText: { fontSize: 14, color: C.gray, textAlign: 'center', lineHeight: 20 },
    debtCard: { marginBottom: 10 },
    debtRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    debtPerson: { flex: 1, alignItems: 'center' },
    debtName: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 2 },
    debtLabel: { fontSize: 11, color: C.gray },
    debtAmountBox: { alignItems: 'center', paddingHorizontal: 8 },
    debtAmount: { fontSize: 18, fontWeight: '800', color: C.accent, marginBottom: 2 },
    debtArrow: { fontSize: 16, color: C.muted },
  }),
};
