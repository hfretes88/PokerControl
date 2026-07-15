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
import { GS } from '../components/GlobalStyles';

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
        ListHeaderComponent={
          <>
            <TouchableOpacity
              style={styles.rankingBtn}
              onPress={() => navigation.navigate('PendingDebts')}
              activeOpacity={0.8}>
              <Text style={styles.rankingBtnIcon}>💳</Text>
              <Text style={styles.rankingBtnText}>Ver deudas pendientes</Text>
              <Text style={styles.rankingBtnArrow}>›</Text>
            </TouchableOpacity>
          </>
        }
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

const styles = {
  ...GS,
  ...StyleSheet.create({
    statsBtn: {
      backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.cardBorder,
      paddingHorizontal: 10, paddingVertical: 5, marginRight: 8,
    },
    statsBtnText: { fontSize: 12, color: C.accent, fontWeight: '600' },
  }),
};
