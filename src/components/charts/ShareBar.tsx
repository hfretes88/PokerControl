/* eslint-disable react-native/no-inline-styles --
   Ancho y color de cada tramo dependen del dato. */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ShareItem } from '../../reports/reportSections';
import { useTheme } from '../../theme/ThemeContext';
import { chartColors, seriesColor } from '../../theme/chartColors';
import { formatMoney } from '../UI';
import type { Colors } from '../UI';

/** Barra 100% apilada con la parte de cada jugador, y la lista con montos debajo. */
export default function ShareBar({ items }: { items: ShareItem[] }) {
  const { C, isDark } = useTheme();
  const colors = chartColors(isDark);
  const styles = useMemo(() => createStyles(C), [C]);
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total === 0) return <Text style={styles.muted}>Sin compras todavía</Text>;

  return (
    <View>
      <View style={styles.bar} accessibilityLabel="Parte de las compras de cada jugador">
        {items.filter(i => i.amount > 0).map(i => (
          <View
            key={i.playerId}
            style={{ flex: i.amount, backgroundColor: seriesColor(colors, i.slot), borderRadius: 4 }}
          />
        ))}
      </View>
      {items.map((i, idx) => (
        <View key={i.playerId} style={[styles.row, idx > 0 && styles.border]}>
          <View style={[styles.swatch, { backgroundColor: seriesColor(colors, i.slot) }]} />
          <Text style={styles.name} numberOfLines={1}>{i.name}</Text>
          <Text style={styles.amount}>{formatMoney(i.amount)}</Text>
          <Text style={styles.percent}>{i.percent}%</Text>
        </View>
      ))}
      <Text style={styles.total}>Total comprado: {formatMoney(total)}</Text>
    </View>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    muted: { fontSize: 12, color: C.gray },
    bar: { flexDirection: 'row', height: 22, gap: 2, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
    border: { borderTopWidth: 1, borderTopColor: C.cardBorder },
    swatch: { width: 12, height: 12, borderRadius: 3 },
    name: { flex: 1, fontSize: 15, fontWeight: '700', color: C.white },
    amount: { fontSize: 13, color: C.gray },
    percent: { width: 44, fontSize: 15, fontWeight: '800', color: C.white, textAlign: 'right' },
    total: { fontSize: 12, color: C.gray, marginTop: 6, textAlign: 'right' },
  });
}
