import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function Card({ children, style }) {
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Btn({ label, onPress, color, small, disabled, loading }) {
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const bg = disabled ? C.muted : (color || C.accent);
  // C es siempre una de las dos instancias singleton (darkColors/lightColors),
  // así que esta comparación por referencia sigue funcionando en ambos temas.
  const textColor = (color === C.green || color === C.red) ? '#fff' : C.bg;
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
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
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
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  return <View style={styles.divider} />;
}

export function formatMoney(n) {
  return '$' + Number(n).toLocaleString('es-AR');
}

function createStyles(C) {
  return StyleSheet.create({
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
      fontSize: 17,
      letterSpacing: 0.3,
    },
    btnTextSmall: {
      fontSize: 15,
    },
    badge: {
      fontWeight: '700',
      fontSize: 17,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: 'hidden',
    },
    badgeGreen: { color: C.green },
    badgeRed: { color: C.red },
    badgeNeutral: { color: C.gray, fontSize: 15 },
    divider: {
      height: 1,
      backgroundColor: C.cardBorder,
      marginVertical: 12,
    },
  });
}
