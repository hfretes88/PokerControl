import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, StatusBar, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSessions } from '../storage/storage';
import { getSeasons, createSeason, deleteSeason, reopenSeason } from '../storage/seasons';
import type { Season } from '../storage/types';
import { Card, Btn } from '../components/UI';
import type { Colors } from '../components/UI';
import InfoModal from '../components/InfoModal';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';
import type { ScreenProps } from '../navigation/types';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultSeasonName(count: number): string {
  return `Temporada ${count + 1}`;
}

export default function SeasonsScreen({ navigation }: ScreenProps<'Seasons'>) {
  const insets = useSafeAreaInsets();
  const { C, isDark } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [aboutVisible, setAboutVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [seasonName, setSeasonName] = useState('');

  const load = useCallback(async () => {
    const [seasonList, sessions] = await Promise.all([getSeasons(), getSessions()]);
    setSeasons(seasonList);
    const counts: Record<string, number> = {};
    sessions.forEach(s => {
      if (!s.seasonId) return;
      counts[s.seasonId] = (counts[s.seasonId] || 0) + 1;
    });
    setSessionCounts(counts);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openModal() {
    setSeasonName(defaultSeasonName(seasons.length));
    setModalVisible(true);
  }

  function resetModal() {
    setModalVisible(false);
    setSeasonName('');
  }

  async function handleCreate() {
    const name = seasonName.trim() || defaultSeasonName(seasons.length);
    const newSeason = await createSeason(name);
    resetModal();
    navigation.navigate('SessionsList', { seasonId: newSeason.id, seasonName: newSeason.name });
  }

  function handleDeleteSeason(season: Season) {
    Alert.alert(
      'Borrar temporada',
      `¿Borrar "${season.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSeason(season.id);
              load();
            } catch (e) {
              Alert.alert('No se pudo borrar', getErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  function handleReopenSeason(season: Season) {
    Alert.alert(
      'Reabrir temporada',
      `"${season.name}" va a pasar a ser la temporada activa${activeSeason ? ` y se va a cerrar "${activeSeason.name}"` : ''}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reabrir',
          onPress: async () => {
            await reopenSeason(season.id);
            load();
          },
        },
      ]
    );
  }

  const activeSeason = seasons.find(s => s.status === 'active') || null;
  const headerPaddingTop = insets.top + 12;
  const fabBottom = insets.bottom + 20;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.card} />

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
            style={[styles.playersBtn, styles.mr8]}>
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
        data={seasons}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: fabBottom + 70 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>A</Text>
              <Text style={styles.emptyCardSuit}>♠</Text>
            </View>
            <Text style={styles.emptyText}>No hay temporadas aún</Text>
            <Text style={styles.emptyMuted}>Tocá + para crear la primera</Text>
          </View>
        }
        renderItem={({ item }) => {
          const count = sessionCounts[item.id] || 0;
          const closedLabel = item.closedAt
            ? new Date(item.closedAt).toLocaleDateString('es-AR')
            : 'en curso';
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('SessionsList', { seasonId: item.id, seasonName: item.name })}
              activeOpacity={0.75}>
              <Card>
                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={styles.sessionName}>{item.name}</Text>
                    <Text style={styles.sessionMeta}>
                      {new Date(item.createdAt).toLocaleDateString('es-AR')} – {closedLabel}
                      {'  ·  '}{count} partida{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <View style={[styles.statusBadge,
                      item.status === 'closed' ? styles.closedBadge : styles.activeBadge]}>
                      <Text style={[styles.statusText,
                        { color: item.status === 'closed' ? C.warning : C.green }]}>
                        {item.status === 'closed' ? 'Cerrada' : '● Activa'}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      {item.status === 'closed' && (
                        <TouchableOpacity
                          onPress={() => handleReopenSeason(item)}
                          hitSlop={8}
                          style={styles.rowActionBtn}>
                          <Text style={styles.rowActionIcon}>↺</Text>
                        </TouchableOpacity>
                      )}
                      {count === 0 && (
                        <TouchableOpacity
                          onPress={() => handleDeleteSeason(item)}
                          hitSlop={8}
                          style={styles.rowActionBtn}>
                          <Text style={styles.rowActionIconDanger}>🗑</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={openModal}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <InfoModal
        visible={aboutVisible}
        onClose={() => setAboutVisible(false)}
        onImported={load}
        title="♠ Poker Control"
      >
        <Text style={styles.aboutText}>
          Poker Control te permite organizar y registrar tus partidas de poker entre amigos.
        </Text>
        <Text style={styles.aboutText}>
          Agrupá tus partidas en temporadas: cada temporada arranca podio y estadísticas en cero. Las deudas pendientes siempre quedan visibles, sin importar la temporada.
        </Text>
      </InfoModal>

      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Nueva temporada</Text>

            <Text style={styles.fieldLabel}>NOMBRE</Text>
            <TextInput
              style={styles.input}
              value={seasonName}
              onChangeText={setSeasonName}
              placeholderTextColor={C.muted}
              selectTextOnFocus
              autoFocus
            />

            {activeSeason && (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  ⚠️ Esto va a cerrar "{activeSeason.name}" y arrancar podio y estadísticas en cero. Las deudas pendientes no se ven afectadas.
                </Text>
              </View>
            )}

            <View style={styles.modalBtns}>
              <Btn label="Cancelar" onPress={resetModal} color={C.muted} small />
              <Btn label="Crear temporada" onPress={handleCreate} small />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(C: Colors) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
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
    mr8: { marginRight: 8 },
    listContent: { padding: 16, flexGrow: 1 },
    flex1: { flex: 1 },

    sessionName: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 3 },
    sessionMeta: { fontSize: 13, color: C.gray },
    rowRight: { alignItems: 'flex-end', gap: 6 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    activeBadge: { backgroundColor: C.infoSoftBg },
    closedBadge: { backgroundColor: C.neutralSoftBg },
    statusText: { fontSize: 12, fontWeight: '700' },
    rowActions: { flexDirection: 'row', gap: 4 },
    rowActionBtn: { padding: 4 },
    rowActionIcon: { fontSize: 16, color: C.gray },
    rowActionIconDanger: { fontSize: 14, color: C.red },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyCard: {
      width: 72, height: 96, backgroundColor: C.card,
      borderRadius: 10, borderWidth: 2, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    emptyCardText: { fontSize: 31, fontWeight: '900', color: C.accent, lineHeight: 32 },
    emptyCardSuit: { fontSize: 20, color: C.accent },

    warnBox: {
      backgroundColor: C.warningSoftBg, borderRadius: 10, padding: 12, marginBottom: 16,
      borderWidth: 1, borderColor: C.warningSoftBorder,
    },
    warnText: { fontSize: 14, color: C.accent, lineHeight: 19 },

    aboutText: { fontSize: 16, color: C.gray, lineHeight: 22, marginBottom: 10 },
  }),
  };
}
