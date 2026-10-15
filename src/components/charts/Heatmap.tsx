/* eslint-disable react-native/no-inline-styles --
   El color de cada celda depende de su valor. */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import type { RaceData } from '../../storage/reports';
import { useTheme } from '../../theme/ThemeContext';
import { chartColors, divergingColor } from '../../theme/chartColors';
import { formatMoney } from '../UI';
import type { Colors } from '../UI';

const CELL = 22;
const GAP = 2;
const NAME_W = 64;

interface Cell {
  playerId: string;
  index: number;
}

export default function Heatmap({ race }: { race: RaceData }) {
  const { C, isDark } = useTheme();
  const colors = chartColors(isDark);
  const styles = useMemo(() => createStyles(C), [C]);
  const scrollRef = useRef<ScrollView>(null);
  const [selected, setSelected] = useState<Cell | null>(null);

  const maxAbs = Math.max(
    0,
    ...race.players.flatMap(p => race.nights[p.playerId].map(v => Math.abs(v ?? 0))),
  );

  const info = (() => {
    if (!selected) return 'Tocá una celda para ver el resultado';
    const player = race.players.find(p => p.playerId === selected.playerId);
    const session = race.sessions[selected.index];
    const v = race.nights[selected.playerId][selected.index];
    const result = v === null ? 'no jugó' : `${v > 0 ? '+' : ''}${formatMoney(v)}`;
    return `${player?.name} · ${session.sessionName} · ${result}`;
  })();

  return (
    <View>
      <Text style={styles.info} numberOfLines={1}>{info}</Text>
      <View style={styles.body}>
        <View style={{ width: NAME_W }}>
          {race.players.map(p => (
            <Text key={p.playerId} style={styles.name} numberOfLines={1}>{p.name}</Text>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          <View>
            {race.players.map(p => (
              <View key={p.playerId} style={styles.row}>
                {race.nights[p.playerId].map((v, i) => {
                  const isSelected = selected?.playerId === p.playerId && selected.index === i;
                  return (
                    <Pressable
                      key={race.sessions[i].sessionId}
                      onPress={() => setSelected(isSelected ? null : { playerId: p.playerId, index: i })}
                      hitSlop={1}
                      accessibilityLabel={`${p.name}, ${race.sessions[i].sessionName}: ${v === null ? 'no jugó' : formatMoney(v)}`}
                      style={[
                        styles.cell,
                        v === null
                          ? { borderWidth: 1, borderColor: colors.grid }
                          : { backgroundColor: divergingColor(colors, v, maxAbs) },
                        isSelected && { borderWidth: 2, borderColor: C.white },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Perdió</Text>
        {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(step => (
          <View
            key={step}
            style={[styles.legendCell, { backgroundColor: divergingColor(colors, step, 4) }]}
          />
        ))}
        <Text style={styles.legendText}>Ganó</Text>
      </View>
    </View>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    info: { fontSize: 13, fontWeight: '700', color: C.white, marginBottom: 8 },
    body: { flexDirection: 'row' },
    name: { height: CELL + GAP, lineHeight: CELL, fontSize: 12, fontWeight: '700', color: C.gray, paddingRight: 6 },
    row: { flexDirection: 'row', gap: GAP, marginBottom: GAP },
    cell: { width: CELL, height: CELL, borderRadius: 4 },
    legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 10 },
    legendCell: { width: 16, height: 10, borderRadius: 2 },
    legendText: { fontSize: 11, color: C.gray, marginHorizontal: 4 },
  });
}
