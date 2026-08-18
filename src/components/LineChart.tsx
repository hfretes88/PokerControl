/* eslint-disable react-native/no-inline-styles --
   Este gráfico dibuja a mano cada punto/segmento/etiqueta en base a
   coordenadas calculadas por dato (toX/toY, ángulos de segmento, etc.),
   así que no hay forma de moverlas a un StyleSheet estático. */
import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const PAD      = { left: 44, right: 14, top: 16, bottom: 32 };
const PT_WIDTH = 56; // ancho por punto en el eje X

interface LineChartProps {
  data: number[];
  xLabels: string[];
  height?: number;
}

interface Segment {
  midX: number;
  midY: number;
  length: number;
  angle: number;
  color: string;
}

export default function LineChart({ data, xLabels, height = 220 }: LineChartProps) {
  const { C } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  // Scrollear al final (últimos 6 puntos) al montar
  useEffect(() => {
    if (!data || data.length < 2 || !xLabels) return;
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 50);
  }, [data, xLabels]);

  if (!data || data.length < 2 || !xLabels) return null;

  // Ancho total del gráfico según cantidad de puntos
  const chartW      = PT_WIDTH * (data.length - 1);
  const totalWidth  = chartW + PAD.left + PAD.right;
  const chartH      = height - PAD.top - PAD.bottom;

  // Calcular rango Y con ticks prolijos
  const rawMax  = Math.max(...data, 0);
  const rawMin  = Math.min(...data, 0);
  const rawRange = rawMax - rawMin || 1000;

  const magnitude  = Math.pow(10, Math.floor(Math.log10(rawRange / 4)));
  const normalized = rawRange / 4 / magnitude;
  const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceFactor * magnitude;

  const minVal = Math.floor(rawMin / step) * step;
  const maxVal = Math.ceil(rawMax / step) * step || step;
  const range  = maxVal - minVal || step;

  const yTicks: number[] = [];
  for (let v = minVal; v <= maxVal; v += step) yTicks.push(Math.round(v));

  const toX = (i: number) => PAD.left + i * PT_WIDTH;
  const toY = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;

  const points = data.map((v, i) => ({ x: toX(i), y: toY(v), v }));

  const makeSeg = (ax: number, ay: number, bx: number, by: number, color: string): Segment => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
    return { midX: (ax + bx) / 2, midY: (ay + by) / 2, length, angle, color };
  };

  const segments: Segment[] = [];
  points.slice(0, -1).forEach((p, i) => {
    const q = points[i + 1];
    const crossesZero = (p.v >= 0) !== (q.v >= 0);
    if (crossesZero) {
      const t      = p.v / (p.v - q.v);
      const crossX = p.x + t * (q.x - p.x);
      const crossY = toY(0);
      segments.push(makeSeg(p.x, p.y, crossX, crossY, p.v >= 0 ? C.green : C.red));
      segments.push(makeSeg(crossX, crossY, q.x, q.y, q.v >= 0 ? C.green : C.red));
    } else {
      segments.push(makeSeg(p.x, p.y, q.x, q.y, p.v >= 0 ? C.green : C.red));
    }
  });

  return (
    <View style={{ height }}>
      {/* Eje Y fijo a la izquierda */}
      <View style={{
        position: 'absolute', left: 0, top: 0,
        width: PAD.left, height,
        zIndex: 2,
        backgroundColor: C.card, // mismo fondo que la Card
      }}>
        {yTicks.map(v => {
          const absV  = Math.abs(v);
          const label = v === 0 ? '0'
            : absV >= 1000000 ? `${v / 1000000}M`
            : absV >= 1000    ? `${v / 1000}k`
            : `${v}`;
          return (
            <View
              key={v}
              style={{ position: 'absolute', top: toY(v) - 7, left: 0, width: PAD.left - 4, alignItems: 'flex-end' }}>
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 11,
                  color: v === 0 ? C.white : C.gray,
                  fontWeight: v === 0 ? '700' : '400',
                }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Contenido scrolleable */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: totalWidth, height }}
        scrollEventThrottle={16}>

        {/* Líneas horizontales de grid */}
        {yTicks.map(v => (
          <View
            key={v}
            style={{
              position: 'absolute',
              left: PAD.left,
              top: toY(v) - (v === 0 ? 1 : 0.5),
              width: chartW + PAD.right,
              height: v === 0 ? 2 : 1,
              backgroundColor: v === 0 ? C.gray : C.cardBorder,
            }}
          />
        ))}

        {/* Segmentos de línea */}
        {segments.map((seg, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: seg.midX - seg.length / 2,
              top: seg.midY - 1.5,
              width: seg.length,
              height: 2.5,
              backgroundColor: seg.color,
              borderRadius: 2,
              transform: [{ rotate: `${seg.angle}deg` }],
            }}
          />
        ))}

        {/* Puntos */}
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 4,
              top: p.y - 4,
              width: 8, height: 8,
              borderRadius: 4,
              backgroundColor: p.v >= 0 ? C.green : C.red,
              borderWidth: 2,
              borderColor: C.card,
            }}
          />
        ))}

        {/* Etiquetas eje X */}
        {xLabels.map((lbl, i) => (
          <Text
            key={i}
            numberOfLines={1}
            allowFontScaling={false}
            style={{
              position: 'absolute',
              left: toX(i) - 22,
              top: PAD.top + chartH + 8,
              width: 44,
              textAlign: 'center',
              fontSize: 10,
              color: C.gray,
            }}>
            {lbl.length > 6 ? lbl.slice(0, 5) + '…' : lbl}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
