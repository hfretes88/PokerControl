import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, ScrollView, KeyboardAvoidingView,
  Platform, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSessions, createSessionWithBuys, deleteSession, getPlayers } from '../storage/storage';
import { C, Card, Btn, formatMoney } from '../components/UI';
import InfoModal from '../components/InfoModal';

function defaultSessionName() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `Party ${dd}${mm}${yy}`;
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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
      <StatusBar barStyle="light-content" backgroundColor={C.card} />

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
                        { color: item.status === 'closed' ? '#a0a000' : C.green }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 22, color: C.accent, fontWeight: '900' },
  title: { fontSize: 20, fontWeight: '800', color: C.accent },
  headerBtns: { flexDirection: 'row', alignItems: 'center' },
  playersBtn: {
    backgroundColor: C.bg, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder,
  },
  playersBtnText: { fontSize: 13, color: C.white, fontWeight: '600' },

  // Lista
  row: { flexDirection: 'row', alignItems: 'center' },
  rightCol: { alignItems: 'flex-end', marginRight: 10 },
  sessionName: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 3 },
  sessionMeta: { fontSize: 12, color: C.gray },
  pot: { fontSize: 15, fontWeight: '700', color: C.accent, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadge: { backgroundColor: '#0a1e40' },
  closedBadge: { backgroundColor: '#1a2540' },
  statusText: { fontSize: 11, fontWeight: '700' },
  delBtn: { padding: 8 },
  delText: { fontSize: 16 },

  // Empty state
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80,
  },
  emptyCard: {
    width: 72, height: 96, backgroundColor: C.card,
    borderRadius: 10, borderWidth: 2, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyCardText: { fontSize: 28, fontWeight: '900', color: C.accent, lineHeight: 32 },
  emptyCardSuit: { fontSize: 18, color: C.accent },
  emptyText: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted: { fontSize: 13, color: C.gray },

  // FAB
  fab: {
    position: 'absolute', right: 20,
    backgroundColor: C.accent, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 12,
  },
  fabText: { fontSize: 34, color: '#080e1a', fontWeight: '300', lineHeight: 40 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 20 },
  fieldLabel: {
    fontSize: 10, fontWeight: '700', color: C.gray,
    letterSpacing: 1.2, marginBottom: 8,
  },
  fieldCount: { color: C.accent },
  input: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 15, marginBottom: 16,
  },
  amountInput: { fontSize: 22, fontWeight: '700', color: C.accent },
  playersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  toggleAllText: { fontSize: 12, color: C.accent, fontWeight: '700' },
  noPlayersText: { fontSize: 13, color: C.muted, marginBottom: 16 },
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
  checkmark: { fontSize: 13, color: '#080e1a', fontWeight: '900' },
  playerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#0d2240', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  playerAvatarText: { fontSize: 13, fontWeight: '700', color: C.accent },
  playerRowName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.white },
  playerRowMuted: { color: C.muted },
  previewBox: {
    backgroundColor: '#0a1e40', borderRadius: 10, padding: 12,
    marginBottom: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#1a3a5a',
  },
  previewText: { fontSize: 13, color: C.green, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  aboutText: { fontSize: 14, color: C.gray, lineHeight: 22, marginBottom: 10 },
});
