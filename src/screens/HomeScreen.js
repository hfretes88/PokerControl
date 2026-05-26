import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, Modal, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSessions, createSessionWithBuys, deleteSession, getPlayers } from '../storage/storage';
import { C, Card, Btn, formatMoney } from '../components/UI';

function defaultSessionName() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `Party ${dd}${mm}${yy}`;
}

export default function HomeScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);

  const [sessionName, setSessionName] = useState('');
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState({});    // { [playerId]: bool }
  const [initialAmount, setInitialAmount] = useState(''); // monto único para todos

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
      Alert.alert('Monto inválido', 'Ingresá el monto inicial de buy-in para todos los jugadores.');
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🃏 Poker Control</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Players')} style={styles.playersBtn}>
          <Text style={styles.playersBtnText}>👥 Jugadores</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🂠</Text>
            <Text style={styles.emptyText}>No hay partidas aún</Text>
            <Text style={styles.emptyMuted}>Tocá + para crear la primera</Text>
          </View>
        }
        renderItem={({ item }) => {
          const { pot, count } = getSessionSummary(item);
          return (
            <TouchableOpacity onPress={() => navigation.navigate('Session', { sessionId: item.id })}>
              <Card>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionName}>{item.name}</Text>
                    <Text style={styles.sessionMeta}>
                      {new Date(item.createdAt).toLocaleDateString('es-AR')}  ·  {count} jugadores
                    </Text>
                  </View>
                  <View style={styles.rightCol}>
                    <Text style={styles.pot}>{formatMoney(pot)}</Text>
                    <View style={[styles.statusBadge,
                      item.status === 'closed' ? styles.closedBadge : styles.activeBadge]}>
                      <Text style={styles.statusText}>
                        {item.status === 'closed' ? 'Cerrada' : 'Activa'}
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

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nueva partida</Text>

            {/* Nombre */}
            <Text style={styles.fieldLabel}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={sessionName}
              onChangeText={setSessionName}
              placeholderTextColor={C.muted}
              selectTextOnFocus
            />

            {/* Buy-in único */}
            <Text style={styles.fieldLabel}>Monto inicial por jugador ($)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="Ej: 20000"
              placeholderTextColor={C.muted}
              value={initialAmount}
              onChangeText={setInitialAmount}
              keyboardType="decimal-pad"
            />

            {/* Jugadores */}
            <View style={styles.playersHeader}>
              <Text style={styles.fieldLabel}>
                Jugadores
                {selectedCount > 0 && (
                  <Text style={styles.fieldCount}> · {selectedCount} seleccionados</Text>
                )}
              </Text>
              {allPlayers.length > 0 && (
                <TouchableOpacity onPress={toggleAll}>
                  <Text style={styles.toggleAllText}>
                    {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {allPlayers.length === 0 ? (
              <Text style={styles.noPlayersText}>
                No hay jugadores creados. Creá jugadores en la sección 👥 Jugadores primero.
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

            {/* Preview del pozo */}
            {selectedCount > 0 && initialAmount > 0 && (
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>
                  Total a recaudar: {formatMoney(selectedCount * parseFloat(initialAmount || '0'))}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: C.accent },
  playersBtn: {
    backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
  },
  playersBtnText: { fontSize: 13, color: C.accent, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rightCol: { alignItems: 'flex-end', marginRight: 12 },
  sessionName: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 4 },
  sessionMeta: { fontSize: 12, color: C.gray },
  pot: { fontSize: 16, fontWeight: '700', color: C.accent, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeBadge: { backgroundColor: '#1a3a2a' },
  closedBadge: { backgroundColor: '#2a2a1a' },
  statusText: { fontSize: 11, fontWeight: '600', color: C.gray },
  delBtn: { padding: 6 },
  delText: { fontSize: 16 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted: { fontSize: 13, color: C.gray },
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    backgroundColor: C.accent, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabText: { fontSize: 32, color: '#0f1923', fontWeight: '300', lineHeight: 38 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.gray, letterSpacing: 0.8, marginBottom: 8 },
  fieldCount: { color: C.accent },
  input: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 15, marginBottom: 16,
  },
  amountInput: { fontSize: 20, fontWeight: '700' },
  playersHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  toggleAllText: { fontSize: 12, color: C.accent, fontWeight: '600' },
  noPlayersText: { fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 18 },
  playersList: { maxHeight: 200, marginBottom: 12 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.muted,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  checkboxSelected: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { fontSize: 13, color: '#0f1923', fontWeight: '800' },
  playerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1a3a4a', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  playerAvatarText: { fontSize: 13, fontWeight: '700', color: C.accent },
  playerRowName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.white },
  playerRowMuted: { color: C.muted },
  previewBox: {
    backgroundColor: '#1a3a2a', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center',
  },
  previewText: { fontSize: 13, color: C.green, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
