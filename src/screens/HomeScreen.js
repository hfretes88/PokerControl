import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, Alert, Modal, SafeAreaView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSessions, createSession, deleteSession } from '../storage/storage';
import { C, Card, Btn, formatMoney } from '../components/UI';

export default function HomeScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  useFocusEffect(
    useCallback(() => { loadSessions(); }, [])
  );

  async function loadSessions() {
    const data = await getSessions();
    setSessions(data);
  }

  async function handleCreate() {
    const name = newName.trim() || `Partida ${new Date().toLocaleDateString('es-AR')}`;
    await createSession(name);
    setNewName('');
    setModalVisible(false);
    loadSessions();
  }

  async function handleDelete(session) {
    Alert.alert(
      'Eliminar partida',
      `¿Eliminar "${session.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => { await deleteSession(session.id); loadSessions(); }
        }
      ]
    );
  }

  function getSessionSummary(session) {
    const pot = session.participants.reduce((sum, p) =>
      sum + p.buys.reduce((s, b) => s + b.amount, 0), 0);
    return { pot, count: session.participants.length };
  }

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

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nueva partida</Text>
            <TextInput
              style={styles.input}
              placeholder={`Partida ${new Date().toLocaleDateString('es-AR')}`}
              placeholderTextColor={C.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => { setModalVisible(false); setNewName(''); }}
                color={C.muted} small />
              <Btn label="Crear" onPress={handleCreate} small />
            </View>
          </View>
        </View>
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
    elevation: 8,
    shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabText: { fontSize: 32, color: '#0f1923', fontWeight: '300', lineHeight: 38 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 16 },
  input: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 15, marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
