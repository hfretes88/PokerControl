/* eslint-disable react-native/no-inline-styles --
   Los colores de cada jugador y el resaltado dependen del dato. */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import type { RaceData } from '../../storage/reports';
import { useTheme } from '../../theme/ThemeContext';
import { chartColors, seriesColor } from '../../theme/chartColors';
import { formatMoney } from '../UI';
import type { Colors } from '../UI';
import { niceTicks, shortMoney } from './scale';

const PAD = { left: 40, right: 10, top: 10, bottom: 8 };
const HEIGHT = 230;

function signed(n: number) {
  return `${n > 0 ? '+' : ''}${formatMoney(n)}`;
}

export default function RaceChart({ race }: { race: RaceData }) {
  const { C, isDark } = useTheme();
  const colors = chartColors(isDark);
  const styles = useMemo(() => createStyles(C), [C]);
  const [width, setWidth] = useState(0);
  // Partida tocada (índice) y jugador resaltado desde la leyenda.
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const n = race.sessions.length;
  const all = race.players.flatMap(p => race.cumulative[p.playerId]);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  // Con una sola partida se arranca desde 0 para que haya una línea.
  const points = n === 1 ? 2 : n;
  const toX = (i: number) => PAD.left + (points === 1 ? 0 : (i / (points - 1)) * plotW);
  const toY = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  const valuesOf = (id: string) => (n === 1 ? [0, ...race.cumulative[id]] : race.cumulative[id]);
  const dataIdx = (i: number) => (n === 1 ? i - 1 : i);

  const pick = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX - PAD.left;
    const i = Math.round((x / plotW) * (points - 1));
    const idx = dataIdx(Math.max(0, Math.min(points - 1, i)));
    setSelected(idx >= 0 ? idx : null);
  };

  const legend = race.players
    .map(p => ({ ...p, value: selected === null ? p.final : race.cumulative[p.playerId][selected] }))
    .sort((a, b) => b.value - a.value);

  if (n === 0) return <Text style={styles.empty}>Sin partidas todavía</Text>;

  return (
    <View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        // Si el dedo se mueve en vertical, el ScrollView se queda con el gesto y scrollea.
        onResponderTerminationRequest={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        accessibilityLabel="Gráfico de la carrera: balance acumulado por jugador"
        accessibilityHint="Tocá o deslizá para ver los valores de cada partida">
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            {ticks.map(t => (
              <React.Fragment key={t}>
                <Line
                  x1={PAD.left} x2={width - PAD.right} y1={toY(t)} y2={toY(t)}
                  stroke={t === 0 ? colors.axis : colors.grid}
                  strokeWidth={t === 0 ? 1.5 : 1}
                />
                <SvgText x={PAD.left - 6} y={toY(t) + 4} fontSize={10} fill={C.gray} textAnchor="end">
                  {shortMoney(t)}
                </SvgText>
              </React.Fragment>
            ))}
            {selected !== null && (
              <Line
                x1={toX(n === 1 ? 1 : selected)} x2={toX(n === 1 ? 1 : selected)}
                y1={PAD.top} y2={HEIGHT - PAD.bottom}
                stroke={C.gray} strokeWidth={1} strokeDasharray="3,3"
              />
            )}
            {/* El resaltado se dibuja al final para que quede arriba de las demás. */}
            {[...race.players]
              .sort((a, b) => Number(a.playerId === focus) - Number(b.playerId === focus))
              .map(p => {
                const values = valuesOf(p.playerId);
                const color = seriesColor(colors, p.slot);
                const dimmed = focus !== null && focus !== p.playerId;
                return (
                  <Polyline
                    key={p.playerId}
                    points={values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
                    fill="none"
                    stroke={color}
                    strokeOpacity={dimmed ? 0.18 : 1}
                    strokeWidth={focus === p.playerId ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              })}
            {selected !== null && race.players.map(p => (
              <Circle
                key={p.playerId}
                cx={toX(n === 1 ? 1 : selected)}
                cy={toY(race.cumulative[p.playerId][selected])}
                r={4.5}
                fill={seriesColor(colors, p.slot)}
                stroke={C.card}
                strokeWidth={2}
                opacity={focus !== null && focus !== p.playerId ? 0.25 : 1}
              />
            ))}
          </Svg>
        )}
      </View>

      <View style={styles.axisRow}>
        <Text style={styles.axisText} numberOfLines={1}>{race.sessions[0].sessionName}</Text>
        {n > 1 && <Text style={styles.axisText} numberOfLines={1}>{race.sessions[n - 1].sessionName}</Text>}
      </View>

      <View style={styles.selectedRow}>
        <Text style={styles.selectedText} numberOfLines={1}>
          {selected === null
            ? 'Hoy'
            : `Después de ${race.sessions[selected].sessionName} · ${new Date(race.sessions[selected].date).toLocaleDateString('es-AR')}`}
        </Text>
        {selected !== null && (
          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
            <Text style={styles.clear}>Ver hoy</Text>
          </TouchableOpacity>
        )}
      </View>

      {legend.map((p, idx) => {
        const night = selected !== null ? race.nights[p.playerId][selected] : null;
        const dimmed = focus !== null && focus !== p.playerId;
        return (
          <TouchableOpacity
            key={p.playerId}
            onPress={() => setFocus(f => (f === p.playerId ? null : p.playerId))}
            activeOpacity={0.7}
            style={[styles.legendRow, idx > 0 && styles.legendBorder, { opacity: dimmed ? 0.45 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}, ${signed(p.value)}. Tocá para resaltar`}>
            <Text style={styles.pos}>{idx + 1}</Text>
            <View style={[styles.swatch, { backgroundColor: seriesColor(colors, p.slot) }]} />
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            {selected !== null && (
              <Text style={styles.night}>{night === null ? 'no jugó' : `noche ${signed(night)}`}</Text>
            )}
            <Text style={[styles.value, { color: p.value >= 0 ? C.green : C.red }]}>{signed(p.value)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(C: Colors) {
  return StyleSheet.create({
    empty: { fontSize: 12, color: C.gray },
    axisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: PAD.left, gap: 8 },
    axisText: { fontSize: 11, color: C.gray, flexShrink: 1 },
    selectedRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 12, marginBottom: 4, gap: 8,
    },
    selectedText: { fontSize: 13, fontWeight: '700', color: C.white, flexShrink: 1 },
    clear: { fontSize: 13, fontWeight: '700', color: C.accent },
    legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 },
    legendBorder: { borderTopWidth: 1, borderTopColor: C.cardBorder },
    pos: { width: 16, fontSize: 13, fontWeight: '700', color: C.gray, textAlign: 'center' },
    swatch: { width: 14, height: 4, borderRadius: 2 },
    name: { flex: 1, fontSize: 15, fontWeight: '700', color: C.white },
    night: { fontSize: 12, color: C.gray },
    value: { fontSize: 15, fontWeight: '800', minWidth: 92, textAlign: 'right' },
  });
}
