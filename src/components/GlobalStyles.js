import { StyleSheet } from 'react-native';
import { C } from './UI';

export const GS = StyleSheet.create({
  // ─── Layout ──────────────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },

  // ─── Tipografía ──────────────────────────────────────────────────────────────
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 10 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: C.gray, letterSpacing: 1.2, marginBottom: 8 },
  loading: { color: C.gray, textAlign: 'center', marginTop: 40, fontSize: 16 },
  playerName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.white },

  // ─── Avatar ───────────────────────────────────────────────────────────────────
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#0d2240', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarSm: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#0d2240', alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: C.accent },
  avatarTextSm: { fontSize: 13, fontWeight: '700', color: C.accent },

  // ─── Empty state ─────────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 50, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '700', color: C.white, marginBottom: 6 },
  emptyMuted: { fontSize: 13, color: C.gray, textAlign: 'center' },

  // ─── Modal ────────────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 16 },
  modalSub: { fontSize: 13, color: C.gray, marginBottom: 14 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },

  // ─── Formulario ──────────────────────────────────────────────────────────────
  input: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder,
    padding: 13, color: C.white, fontSize: 15, marginBottom: 16,
  },
  amountInput: { fontSize: 22, fontWeight: '700', color: C.accent },

  // ─── FAB ─────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', right: 20,
    backgroundColor: C.accent, width: 58, height: 58,
    borderRadius: 29, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: C.accent, shadowOpacity: 0.5, shadowRadius: 12,
  },
  fabText: { fontSize: 34, color: '#080e1a', fontWeight: '300', lineHeight: 40 },

  // ─── Botón eliminar ──────────────────────────────────────────────────────────
  delBtn: { padding: 8 },
  delText: { fontSize: 16 },
});
