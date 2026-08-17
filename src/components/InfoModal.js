import React, { useState, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ScrollView, Share, Alert, ActivityIndicator, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pick, types, isErrorWithCode, errorCodes, saveDocuments } from '@react-native-documents/picker';
import { useTheme } from '../theme/ThemeContext';
import RNFS from 'react-native-fs';

const APP_VERSION = '1.0.0';

async function exportAllData() {
  // En lugar de getAllKeys + multiGet, leemos las claves conocidas directamente
  const [playersRaw, sessionsRaw, debtsRaw, seasonsRaw] = await Promise.all([
    AsyncStorage.getItem('poker_players'),
    AsyncStorage.getItem('poker_sessions'),
    AsyncStorage.getItem('poker_debts'),
    AsyncStorage.getItem('poker_seasons'),
  ]);

  return {
    exportedAt:  new Date().toISOString(),
    appVersion:  APP_VERSION,
    data: {
      poker_players:  playersRaw  ? JSON.parse(playersRaw)  : [],
      poker_sessions: sessionsRaw ? JSON.parse(sessionsRaw) : [],
      poker_debts:    debtsRaw    ? JSON.parse(debtsRaw)    : [],
      poker_seasons:  seasonsRaw  ? JSON.parse(seasonsRaw)  : [],
    },
  };
}

/**
 * Valida que el JSON tenga la forma de un backup de Poker Control
 * antes de tocar el storage.
 */
function isValidBackup(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') return false;
  return ['poker_players', 'poker_sessions', 'poker_debts', 'poker_seasons']
    .every(key => Array.isArray(data[key]));
}

export default function InfoModal({ visible, onClose, title, children, onImported }) {
  const insets = useSafeAreaInsets();
  const { C, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  async function applyImport(data) {
    setImporting(true);
    try {
      await AsyncStorage.setMany({
        poker_players:  JSON.stringify(data.poker_players),
        poker_sessions: JSON.stringify(data.poker_sessions),
        poker_debts:    JSON.stringify(data.poker_debts),
        poker_seasons:  JSON.stringify(data.poker_seasons),
      });
      // El backup de "reorganizar deudas" queda obsoleto tras un reemplazo total.
      await AsyncStorage.removeItem('poker_debts_backup');
      onClose();
      onImported?.();
    } catch (err) {
      Alert.alert('Error al importar', err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleImport() {
    let file;
    try {
      [file] = await pick({ type: [types.json] });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Error al importar', err.message);
      return;
    }

    let payload;
    try {
      const text = await (await fetch(file.uri)).text();
      payload = JSON.parse(text);
    } catch (err) {
      Alert.alert('Error al importar', 'No se pudo leer el archivo. ¿Es un JSON válido?');
      return;
    }

    if (!isValidBackup(payload)) {
      Alert.alert('Archivo inválido', 'Ese archivo no tiene el formato de un backup de Poker Control.');
      return;
    }

    Alert.alert(
      'Importar backup',
      'Esto va a reemplazar TODOS los datos actuales (jugadores, partidas, temporadas y deudas) por los del archivo. No se puede deshacer.\n\n¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reemplazar todo', style: 'destructive', onPress: () => applyImport(payload.data) },
      ]
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const payload  = await exportAllData();
      const json     = JSON.stringify(payload, null, 2);
      const filename = `PokerControl_${new Date().toISOString().slice(0, 10)}.json`;
      const path     = `${RNFS.DocumentDirectoryPath}/${filename}`;

      await RNFS.writeFile(path, json, 'utf8');

      if (Platform.OS === 'android') {
        // Share.share con url: file:// no funciona en Android sin un FileProvider:
        // termina compartiendo el JSON como texto plano en vez del archivo.
        // saveDocuments abre el diálogo nativo "Guardar como" y sí guarda un
        // archivo .json real (en Descargas, Drive, etc.).
        await saveDocuments({
          sourceUris: [encodeURI(`file://${path}`)],
          fileName:   filename,
          mimeType:   'application/json',
        });
      } else {
        // iOS comparte directo como archivo
        await Share.share({
          title: 'PokerControl — Backup',
          url:   path,
        });
      }

    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
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
                Exportá toda tu información (jugadores, partidas, temporadas y deudas) como archivo JSON, o importá un backup para restaurarla en este dispositivo.
              </Text>

              <TouchableOpacity
                style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
                onPress={handleExport}
                disabled={exporting || importing}
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
                    Jugadores · Partidas · Temporadas · Deudas
                  </Text>
                </View>
                {!exporting && <Text style={styles.exportArrow}>›</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.exportBtn, styles.importBtn, importing && styles.exportBtnDisabled]}
                onPress={handleImport}
                disabled={exporting || importing}
                activeOpacity={0.8}>
                {importing
                  ? <ActivityIndicator color={C.accent} size="small" />
                  : <Text style={styles.exportBtnIcon}>📥</Text>
                }
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportBtnLabel}>
                    {importing ? 'Importando...' : 'Importar JSON'}
                  </Text>
                  <Text style={styles.exportBtnSub}>
                    Reemplaza todos los datos actuales
                  </Text>
                </View>
                {!importing && <Text style={styles.exportArrow}>›</Text>}
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
  importBtn: { marginTop: 10 },
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
