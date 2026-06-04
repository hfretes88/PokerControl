import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';

export const C = {
  bg: '#080e1a',
  card: '#0e1e35',
  cardBorder: '#1a3058',
  accent: '#4da6ff',
  green: '#27ae60',
  red: '#e74c3c',
  gray: '#6b8cad',
  white: '#ddeaf8',
  muted: '#2a3f5f',
};

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Btn({ label, onPress, color, small, disabled, loading }) {
  const bg = disabled ? C.muted : (color || C.accent);
  const textColor = (color === C.green || color === C.red) ? '#fff' : '#080e1a';
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }, small && styles.btnSmall]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      {loading
        ? <ActivityIndicator color={textColor} size="small" />
        : <Text style={[styles.btnText, { color: textColor }, small && styles.btnTextSmall]}>
            {label}
          </Text>
      }
    </TouchableOpacity>
  );
}

export function BalanceBadge({ amount }) {
  if (amount === null || amount === undefined) {
    return <Text style={styles.badgeNeutral}>— sin cerrar</Text>;
  }
  const isPositive = amount > 0;
  const isZero = amount === 0;
  return (
    <Text style={[
      styles.badge,
      isZero ? styles.badgeNeutral : isPositive ? styles.badgeGreen : styles.badgeRed
    ]}>
      {isPositive ? '+' : ''}{formatMoney(amount)}
    </Text>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnText: {
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  btnTextSmall: {
    fontSize: 13,
  },
  badge: {
    fontWeight: '700',
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  badgeGreen: { color: C.green },
  badgeRed: { color: C.red },
  badgeNeutral: { color: C.gray, fontSize: 13 },
  divider: {
    height: 1,
    backgroundColor: C.cardBorder,
    marginVertical: 12,
  },
});
