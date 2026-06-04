import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, Alert, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPlayers, savePlayer, deletePlayer } from '../storage/storage';
import { C, Card, Btn } from '../components/UI';

export default function PlayersScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [players, setPlayers] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');

  useFocusEffect(
    useCallback(() => { load(); }, [])
  );

  async function load() {
    const data = await getPlayers();
    setPlayers(data);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    await savePlayer(newName);
    setNewName('');
    setModalVisible(false);
    load();
  }

  async function handleDelete(player) {
    Alert.alert('Eliminar jugador', `¿Eliminar a ${player.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await deletePlayer(player.id); load(); }
      }
    ]);
  }

  const fabBottom = insets.bottom + 20;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={players}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottom + 70, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyText}>No hay jugadores</Text>
            <Text style={styles.emptyMuted}>Tocá + para agregar jugadores del grupo</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>{item.name}</Text>
              <TouchableOpacity
                style={styles.statsBtn}
                onPress={() => navigation.navigate('Stats', { playerId: item.id, playerName: item.name })}>
                <Text style={styles.statsBtnText}>📊 Stats</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.delBtn}>
                <Text style={styles.delText}>🗑</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Agregar jugador</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre del jugador"
              placeholderTextColor={C.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              onSubmitEditing={handleAdd}
            />
            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={() => { setModalVisible(false); setNewName(''); }}
                color={C.muted} small />
              <Btn label="Agregar" onPress={handleAdd} small disabled={!newName.trim()} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0d2240', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: C.accent },
  playerName: { flex: 1, fontSize: 16, fontWeight: '600', color: C.white },
  statsBtn: {
    backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.cardBorder,
    paddingHorizontal: 10, paddingVertical: 5, marginRight: 8,
  },
  statsBtnText: { fontSize: 12, color: C.accent, fontWeight: '600' },
  delBtn: { padding: 8 },
  delText: { fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 50, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted: { fontSize: 13, color: C.gray },
  fab: {
    position: 'absolute', right: 20,
    backgroundColor: C.accent, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 12,
  },
  fabText: { fontSize: 34, color: '#080e1a', fontWeight: '300', lineHeight: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 16 },
  input: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 15, marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
