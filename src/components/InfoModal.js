import React, { useState, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, Share, Alert, ActivityIndicator, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn } from './UI';
import { useTheme } from '../theme/ThemeContext';
import RNFS from 'react-native-fs';

const APP_VERSION = '1.0.0';

async function exportAllData() {
  // En lugar de getAllKeys + multiGet, leemos las claves conocidas directamente
  const [playersRaw, sessionsRaw, debtsRaw] = await Promise.all([
    AsyncStorage.getItem('poker_players'),
    AsyncStorage.getItem('poker_sessions'),
    AsyncStorage.getItem('poker_debts'),
  ]);

  return {
    exportedAt:  new Date().toISOString(),
    appVersion:  APP_VERSION,
    data: {
      poker_players:  playersRaw  ? JSON.parse(playersRaw)  : [],
      poker_sessions: sessionsRaw ? JSON.parse(sessionsRaw) : [],
      poker_debts:    debtsRaw    ? JSON.parse(debtsRaw)    : [],
    },
  };
}

export default function InfoModal({ visible, onClose, title, children }) {
  const insets = useSafeAreaInsets();
  const { C, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const payload  = await exportAllData();
      const json     = JSON.stringify(payload, null, 2);
      const filename = `PokerControl_${new Date().toISOString().slice(0, 10)}.json`;
      const path     = `${RNFS.DocumentDirectoryPath}/${filename}`;

      await RNFS.writeFile(path, json, 'utf8');

      if (Platform.OS === 'android') {
        // En Android usamos el Intent de share con content:// URI via FileProvider
        await RNFS.scanFile(path); // indexa el archivo
        await Share.share({
          title:   'PokerControl — Backup',
          message: json, // fallback texto
          url:     `file://${path}`,
        });
      } else {
        // iOS comparte directo como archivo
        await Share.share({
          title: 'PokerControl — Backup',
          url:   path,
        });
      }

    } catch (err) {
      if (err.message !== 'User did not share') {
        Alert.alert('Error al exportar', err.message);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>

          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Contenido custom (children del HomeScreen) */}
            {children && (
              <View style={styles.contentBlock}>
                {children}
              </View>
            )}

            {/* Separador */}
            <View style={styles.divider} />

            {/* Sección export */}
            <View style={styles.exportBlock}>
              <Text style={styles.exportTitle}>Backup de datos</Text>
              <Text style={styles.exportDesc}>
                Exportá toda tu información (jugadores, partidas, historial) como archivo JSON. Podés guardarlo en Drive, enviarlo por WhatsApp o usarlo para restaurar en otro dispositivo.
              </Text>

              <TouchableOpacity
                style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
                onPress={handleExport}
                disabled={exporting}
                activeOpacity={0.8}>
                {exporting
                  ? <ActivityIndicator color={C.accent} size="small" />
                  : <Text style={styles.exportBtnIcon}>📤</Text>
                }
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportBtnLabel}>
                    {exporting ? 'Exportando...' : 'Exportar JSON'}
                  </Text>
                  <Text style={styles.exportBtnSub}>
                    Jugadores · Partidas · Historial
                  </Text>
                </View>
                {!exporting && <Text style={styles.exportArrow}>›</Text>}
              </TouchableOpacity>
            </View>

            {/* Sección tema */}
            <View style={styles.exportBlock}>
              <Text style={styles.exportTitle}>Apariencia</Text>

              <TouchableOpacity
                style={styles.exportBtn}
                onPress={toggleTheme}
                activeOpacity={0.8}>
                <Text style={styles.exportBtnIcon}>{isDark ? '🌙' : '☀️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportBtnLabel}>
                    Tema {isDark ? 'oscuro' : 'claro'}
                  </Text>
                  <Text style={styles.exportBtnSub}>
                    Tocá para cambiar a modo {isDark ? 'claro' : 'oscuro'}
                  </Text>
                </View>
                <Text style={styles.exportArrow}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Version */}
            <Text style={styles.version}>Poker Control v{APP_VERSION}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(C) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.muted,
    alignSelf: 'center', marginBottom: 20,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: C.accent },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 16, color: C.gray, fontWeight: '700' },

  contentBlock: { marginBottom: 4 },

  divider: {
    height: 1, backgroundColor: C.cardBorder,
    marginVertical: 20,
  },

  exportBlock: { marginBottom: 20 },
  exportTitle: {
    fontSize: 12, fontWeight: '700', color: C.gray,
    letterSpacing: 1, marginBottom: 10,
    textTransform: 'uppercase',
  },
  exportDesc: {
    fontSize: 15, color: C.gray, lineHeight: 20, marginBottom: 16,
  },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 16, gap: 12,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnIcon:  { fontSize: 25 },
  exportBtnLabel: { fontSize: 17, fontWeight: '700', color: C.white, marginBottom: 2 },
  exportBtnSub:   { fontSize: 12, color: C.muted },
  exportArrow:    { fontSize: 25, color: C.muted, fontWeight: '300' },

  version: {
    fontSize: 12, color: C.muted,
    textAlign: 'center', marginTop: 8,
  },
  });
}
