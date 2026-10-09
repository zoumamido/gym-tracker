import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme';
import { IconName, T, Tap } from './ui';

export interface SheetAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  detail?: string;
}

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding">
          <Animated.View entering={SlideInDown.springify().damping(20).stiffness(180)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.handle} />
              {title ? (
                <T variant="h2" style={{ marginBottom: space.sm }}>
                  {title}
                </T>
              ) : null}
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((a) => (
        <Tap
          key={a.label}
          hapticKind="selection"
          scaleTo={0.99}
          onPress={() => {
            onClose();
            // Let the sheet close before running (avoids stacking modals).
            setTimeout(a.onPress, 180);
          }}
        >
          <View style={styles.action}>
            <View style={[styles.actionIcon, { backgroundColor: a.destructive ? colors.dangerSoft : colors.cardAlt }]}>
              <Ionicons name={a.icon} size={18} color={a.destructive ? colors.danger : colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyMedium" color={a.destructive ? colors.danger : colors.text}>
                {a.label}
              </T>
              {a.detail ? (
                <T variant="caption" color={colors.textMuted}>
                  {a.detail}
                </T>
              ) : null}
            </View>
          </View>
        </Tap>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.md, paddingTop: space.sm, borderWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
