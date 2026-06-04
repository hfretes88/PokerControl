import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { C } from './UI';

const PAD = { left: 44, right: 14, top: 16, bottom: 32 };

export default function LineChart({ data, xLabels, height = 220 }) {
  const [containerWidth, setContainerWidth] = useState(0);

  if (!data || data.length < 2 || !xLabels) return null;

  const chartW = containerWidth - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const rawMax = Math.max(...data, 0);
  const rawMin = Math.min(...data, 0);
  const rawRange = rawMax - rawMin || 1000;

  // Calcula un step "lindo" que dé entre 4-6 ticks
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawRange / 4)));
  const normalized = rawRange / 4 / magnitude;
  const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceFactor * magnitude;

  const minVal = Math.floor(rawMin / step) * step;
  const maxVal = Math.ceil(rawMax / step) * step || step;
  const range = maxVal - minVal || step;

  const yTicks = [];
  for (let v = minVal; v <= maxVal; v += step) yTicks.push(Math.round(v));

  const toX = i => PAD.left + (i / (data.length - 1)) * chartW;
  const toY = v => PAD.top + chartH - ((v - minVal) / range) * chartH;

  const points = data.map((v, i) => ({ x: toX(i), y: toY(v), v }));

  const makeSeg = (ax, ay, bx, by, color) => {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { midX: (ax + bx) / 2, midY: (ay + by) / 2, length, angle, color };
  };

  const segments = [];
  points.slice(0, -1).forEach((p, i) => {
    const q = points[i + 1];
    const crossesZero = (p.v >= 0) !== (q.v >= 0);
    if (crossesZero) {
      const t = p.v / (p.v - q.v);
      const crossX = p.x + t * (q.x - p.x);
      const crossY = toY(0);
      segments.push(makeSeg(p.x, p.y, crossX, crossY, p.v >= 0 ? C.green : C.red));
      segments.push(makeSeg(crossX, crossY, q.x, q.y, q.v >= 0 ? C.green : C.red));
    } else {
      segments.push(makeSeg(p.x, p.y, q.x, q.y, p.v >= 0 ? C.green : C.red));
    }
  });

  return (
    <View style={{ height }} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <>
          {yTicks.map(v => {
            const isZero = v === 0;
            const absV = Math.abs(v);
            const label = v === 0 ? '0'
              : absV >= 1000000 ? `${v / 1000000}M`
              : absV >= 1000 ? `${v / 1000}k`
              : `${v}`;
            return (
              <View
                key={v}
                style={{
                  position: 'absolute',
                  top: toY(v) - 7,
                  left: 0,
                  width: containerWidth,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{
                    width: PAD.left - 6,
                    textAlign: 'right',
                    fontSize: 10,
                    color: isZero ? C.white : C.gray,
                    fontWeight: isZero ? '700' : '400',
                  }}>
                  {label}
                </Text>
                <View style={{ width: 6 }} />
                <View style={{
                  flex: 1,
                  height: isZero ? 2 : 1,
                  backgroundColor: isZero ? C.gray : C.cardBorder,
                }} />
              </View>
            );
          })}

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

          {points.map((p, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: p.x - 4,
                top: p.y - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: p.v >= 0 ? C.green : C.red,
                borderWidth: 2,
                borderColor: C.card,
              }}
            />
          ))}

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
                fontSize: 9,
                color: C.gray,
              }}
            >
              {lbl.length > 6 ? lbl.slice(0, 5) + '…' : lbl}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}
