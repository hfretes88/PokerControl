import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { C, Btn } from './UI';

export default function InfoModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.box}>
          {title && <Text style={styles.title}>{title}</Text>}
          <View style={styles.content}>{children}</View>
          <Btn label="Aceptar" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  box: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 24,
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: C.accent,
    marginBottom: 16,
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
  },
});
