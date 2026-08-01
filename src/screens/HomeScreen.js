import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSessions, createSessionWithBuys, deleteSession, getPlayers } from '../storage/storage';
import { Card, Btn, formatMoney } from '../components/UI';
import InfoModal from '../components/InfoModal';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';

function defaultSessionName() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `Party ${dd}${mm}${yy}`;
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { C, isDark } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [sessions, setSessions] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState({});
  const [initialAmount, setInitialAmount] = useState('');

  useFocusEffect(
    useCallback(() => { loadSessions(); }, [])
  );

  async function openModal() {
    const players = await getPlayers();
    setAllPlayers(players);
    setSessionName(defaultSessionName());
    const init = {};
    players.forEach(p => { init[p.id] = false; });
    setSelectedIds(init);
    setInitialAmount('');
    setModalVisible(true);
  }

  function resetModal() {
    setModalVisible(false);
    setSessionName('');
    setSelectedIds({});
    setInitialAmount('');
    setAllPlayers([]);
  }

  function togglePlayer(playerId) {
    setSelectedIds(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  }

  function toggleAll() {
    const allSelected = allPlayers.every(p => selectedIds[p.id]);
    const next = {};
    allPlayers.forEach(p => { next[p.id] = !allSelected; });
    setSelectedIds(next);
  }

  async function handleCreate() {
    const name = sessionName.trim() || defaultSessionName();
    const amount = parseFloat((initialAmount || '0').replace(',', '.'));
    const selected = allPlayers.filter(p => selectedIds[p.id]);
    if (selected.length > 0 && (isNaN(amount) || amount <= 0)) {
      Alert.alert('Monto inválido', 'Ingresá el monto inicial por jugador.');
      return;
    }
    const entries = selected.map(p => ({ player: p, amount }));
    await createSessionWithBuys(name, entries);
    resetModal();
    loadSessions();
  }

  async function loadSessions() {
    const data = await getSessions();
    setSessions(data);
  }

  async function handleDelete(session) {
    Alert.alert('Eliminar partida', `¿Eliminar "${session.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await deleteSession(session.id); loadSessions(); }
      }
    ]);
  }

  function getSessionSummary(session) {
    const pot = session.participants.reduce((sum, p) =>
      sum + p.buys.reduce((s, b) => s + b.amount, 0), 0);
    return { pot, count: session.participants.length };
  }

  const selectedCount = allPlayers.filter(p => selectedIds[p.id]).length;
  const allSelected = allPlayers.length > 0 && allPlayers.every(p => selectedIds[p.id]);

  // Altura real del header respetando status bar
  const headerPaddingTop = insets.top + 12;
  // FAB separado de la navigation bar
  const fabBottom = insets.bottom + 20;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.card} />

      {/* Header custom que respeta status bar */}
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>♠</Text>
          <TouchableOpacity onPress={() => setAboutVisible(true)} activeOpacity={0.7}>
            <Text style={styles.title}>Poker Control</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Ranking')}
            style={[styles.playersBtn, { marginRight: 8 }]}>
            <Text style={styles.playersBtnText}>🏆</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Players')}
            style={styles.playersBtn}>
            <Text style={styles.playersBtnText}>👥  Jugadores</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: fabBottom + 70, // espacio para el FAB
          flexGrow: 1,
        }}
        ListEmptyComponent={
          // Empty state centrado verticalmente
          <View style={styles.empty}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>A</Text>
              <Text style={styles.emptyCardSuit}>♠</Text>
            </View>
            <Text style={styles.emptyText}>No hay partidas aún</Text>
            <Text style={styles.emptyMuted}>Tocá + para crear la primera</Text>
          </View>
        }
        renderItem={({ item }) => {
          const { pot, count } = getSessionSummary(item);
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('Session', { sessionId: item.id })}
              activeOpacity={0.75}>
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionName}>{item.name}</Text>
                    <Text style={styles.sessionMeta}>
                      {new Date(item.createdAt).toLocaleDateString('es-AR')}
                      {'  ·  '}{count} jugadores
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={styles.pot}>{formatMoney(pot)}</Text>
                    <View style={[styles.statusBadge,
                      item.status === 'closed' ? styles.closedBadge : styles.activeBadge]}>
                      <Text style={[styles.statusText,
                        { color: item.status === 'closed' ? C.warning : C.green }]}>
                        {item.status === 'closed' ? 'Cerrada' : '● Activa'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(item)} style={styles.delBtn}>
                    <Text style={styles.delText}>🗑</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* FAB respeta navigation bar */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={openModal}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <InfoModal
        visible={aboutVisible}
        onClose={() => setAboutVisible(false)}
        title="♠ Poker Control"
      >
        <Text style={styles.aboutText}>
          Poker Control te permite organizar y registrar tus partidas de poker entre amigos.
        </Text>
        <Text style={styles.aboutText}>
          Creá sesiones, sumá jugadores, registrá compras y finalizá partidas para llevar un historial completo de resultados, balances y estadísticas de cada jugador.
        </Text>
      </InfoModal>

      {/* Modal nueva partida */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Nueva partida</Text>

            <Text style={styles.fieldLabel}>NOMBRE</Text>
            <TextInput
              style={styles.input}
              value={sessionName}
              onChangeText={setSessionName}
              placeholderTextColor={C.muted}
              selectTextOnFocus
            />

            <Text style={styles.fieldLabel}>MONTO INICIAL POR JUGADOR</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ej: 20000"
              placeholderTextColor={C.muted}
              value={initialAmount}
              onChangeText={setInitialAmount}
              keyboardType="decimal-pad"
            />

            <View style={styles.playersHeader}>
              <Text style={styles.fieldLabel}>
                JUGADORES
                {selectedCount > 0 && (
                  <Text style={styles.fieldCount}> · {selectedCount}</Text>
                )}
              </Text>
              {allPlayers.length > 0 && (
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>
                    {allSelected ? 'Ninguno' : 'Todos'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {allPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>
                Creá jugadores en 👥 Jugadores primero.
              </Text>
            ) : (
              <ScrollView style={styles.playersList} showsVerticalScrollIndicator={false}>
                {allPlayers.map(p => {
                  const selected = !!selectedIds[p.id];
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.playerRow}
                      onPress={() => togglePlayer(p.id)}
                      activeOpacity={0.7}>
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={styles.playerAvatar}>
                        <Text style={styles.playerAvatarText}>{p.name[0].toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.playerRowName, !selected && styles.playerRowMuted]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {selectedCount > 0 && parseFloat(initialAmount) > 0 && (
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>
                  Total: {formatMoney(selectedCount * parseFloat(initialAmount || '0'))}
                  {'  '}({selectedCount} × {formatMoney(parseFloat(initialAmount || '0'))})
                </Text>
              </View>
            )}

            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={resetModal} color={C.muted} small />
              <Btn label="Crear partida" onPress={handleCreate} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(C) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
    // Header
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: C.card,
      borderBottomWidth: 1, borderBottomColor: C.cardBorder,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIcon: { fontSize: 20, color: C.accent, fontWeight: '900' },
    title: { fontSize: 20, fontWeight: '800', color: C.accent },
    headerBtns: { flexDirection: 'row', alignItems: 'center' },
    playersBtn: {
      backgroundColor: C.bg, paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder,
    },
    playersBtnText: { fontSize: 15, color: C.white, fontWeight: '600' },

    // Lista
    rightCol: { alignItems: 'flex-end', marginRight: 10 },
    sessionName: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 3 },
    sessionMeta: { fontSize: 13, color: C.gray },
    pot: { fontSize: 17, fontWeight: '700', color: C.accent, marginBottom: 4 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    activeBadge: { backgroundColor: C.infoSoftBg },
    closedBadge: { backgroundColor: C.neutralSoftBg },
    statusText: { fontSize: 12, fontWeight: '700' },

    // Empty state (override padding para pantalla con lista)
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyCard: {
      width: 72, height: 96, backgroundColor: C.card,
      borderRadius: 10, borderWidth: 2, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    emptyCardText: { fontSize: 31, fontWeight: '900', color: C.accent, lineHeight: 32 },
    emptyCardSuit: { fontSize: 20, color: C.accent },

    // Modal (modalBox override para maxHeight)
    modalBox: {
      backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, maxHeight: '90%',
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: C.white, marginBottom: 20 },
    fieldCount: { color: C.accent },
    playersHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
    },
    toggleAllText: { fontSize: 13, color: C.accent, fontWeight: '700' },
    noPlayersText: { fontSize: 15, color: C.muted, marginBottom: 16 },
    playersList: { maxHeight: 200, marginBottom: 12 },
    playerRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.muted,
      alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    checkboxSelected: { backgroundColor: C.accent, borderColor: C.accent },
    checkmark: { fontSize: 15, color: C.bg, fontWeight: '900' },
    playerAvatar: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: C.neutralSoftBg, alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    playerAvatarText: { fontSize: 15, fontWeight: '700', color: C.accent },
    playerRowName: { flex: 1, fontSize: 17, fontWeight: '600', color: C.white },
    playerRowMuted: { color: C.muted },
    previewBox: {
      backgroundColor: C.infoSoftBg, borderRadius: 10, padding: 12,
      marginBottom: 16, alignItems: 'center',
      borderWidth: 1, borderColor: C.infoSoftBorder,
    },
    previewText: { fontSize: 15, color: C.green, fontWeight: '700' },
    aboutText: { fontSize: 16, color: C.gray, lineHeight: 22, marginBottom: 10 },
  }),
  };
}
