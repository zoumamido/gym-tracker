import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { ReactNode, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { colors, fonts, gradients, radius, space, type, TypeVariant } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- Haptics ----------

export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' | 'selection' = 'light') {
  if (Platform.OS === 'web' || !useStore.getState().settings.haptics) return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (kind === 'selection') Haptics.selectionAsync();
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // haptics unavailable
  }
}

// ---------- Text ----------

export function T({ variant = 'body', color, style, ...rest }: TextProps & { variant?: TypeVariant; color?: string }) {
  return <Text {...rest} style={[type[variant] as TextStyle, { color: color ?? colors.text }, style]} />;
}

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  ...rest
}: { children: ReactNode; scroll?: boolean; edges?: Edge[]; contentStyle?: StyleProp<ViewStyle> } & ScrollViewProps) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          {...rest}
          contentContainerStyle={[styles.screenContent, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, { flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({ children, gap = space.sm, style, align = 'center' }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; align?: ViewStyle['alignItems'] }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Spacer({ size = space.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

// ---------- Pressable with spring scale ----------

const APressable = Animated.createAnimatedComponent(Pressable);

/** Presses closer together than this are treated as an accidental double tap. */
const DOUBLE_TAP_MS = 450;

export function Tap({ children, style, onPress, scaleTo = 0.97, hapticKind = 'light', disabled, guard = true, ...rest }: PressableProps & { scaleTo?: number; hapticKind?: Parameters<typeof haptic>[0] | null; style?: StyleProp<ViewStyle>; /** Ignore accidental double taps (default true). */ guard?: boolean }) {
  const scale = useSharedValue(1);
  const lastPress = useRef(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <APressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 15, stiffness: 300 }));
      }}
      onPress={(e) => {
        const t = e.nativeEvent.timestamp || Date.now();
        if (guard && t - lastPress.current < DOUBLE_TAP_MS) return;
        lastPress.current = t;
        if (hapticKind) haptic(hapticKind);
        onPress?.(e);
      }}
      style={[style, anim, disabled && { opacity: 0.45 }]}
    >
      {children as ReactNode}
    </APressable>
  );
}

// ---------- Card ----------

export function Card({ children, style, onPress, gradient, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; gradient?: readonly [string, string, ...string[]]; padded?: boolean }) {
  const inner = gradient ? (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, padded && styles.cardPad, { borderColor: 'rgba(255,255,255,0.06)' }, style]}>
      {children}
    </LinearGradient>
  ) : (
    <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>
  );
  if (!onPress) return inner;
  return (
    <Tap onPress={onPress} scaleTo={0.985}>
      {inner}
    </Tap>
  );
}

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'water';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  size = 'lg',
  disabled,
  loading,
  style,
  full = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const h = size === 'lg' ? 56 : size === 'md' ? 46 : 36;
  const textColor = variant === 'secondary' || variant === 'ghost' ? colors.text : variant === 'danger' ? colors.danger : '#fff';
  const content = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={textColor} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={textColor} /> : null}
      <T variant={size === 'sm' ? 'caption' : 'h3'} color={textColor} numberOfLines={1} style={size === 'sm' ? { fontFamily: fonts.semibold, fontSize: 13 } : undefined}>
        {title}
      </T>
    </Row>
  );
  const base: ViewStyle = { height: h, borderRadius: size === 'sm' ? radius.sm : radius.md, justifyContent: 'center', paddingHorizontal: size === 'sm' ? 14 : 20, alignSelf: full ? 'stretch' : 'flex-start' };
  const grad = variant === 'primary' ? gradients.primary : variant === 'success' ? gradients.success : variant === 'water' ? gradients.water : null;
  return (
    <Tap onPress={onPress} disabled={disabled || loading} style={style} hapticKind={variant === 'primary' || variant === 'success' ? 'medium' : 'light'}>
      {grad ? (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[base, styles.glow]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            base,
            variant === 'secondary' && { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
            variant === 'danger' && { backgroundColor: colors.dangerSoft },
            variant === 'ghost' && { backgroundColor: 'transparent' },
          ]}
        >
          {content}
        </View>
      )}
    </Tap>
  );
}

export function IconButton({ icon, onPress, color = colors.text, bg = colors.cardAlt, size = 40, iconSize = 20, style, accessibilityLabel, guard = true }: { icon: IconName; onPress?: () => void; color?: string; bg?: string; size?: number; iconSize?: number; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; guard?: boolean }) {
  return (
    <Tap onPress={onPress} guard={guard} accessibilityLabel={accessibilityLabel ?? icon.replace(/-outline$/, '').replace(/-/g, ' ')} hitSlop={size < 44 ? (44 - size) / 2 : undefined} scaleTo={0.9} style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={icon} size={iconSize} color={color} />
    </Tap>
  );
}

// ---------- Chips / segmented ----------

export function Chip({ label, active, onPress, icon, color = colors.primary }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName; color?: string }) {
  return (
    <Tap onPress={onPress} hapticKind="selection" scaleTo={0.95}>
      <View style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}>
        {icon ? <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textDim} /> : null}
        <T variant="caption" color={active ? '#fff' : colors.textDim} style={{ fontFamily: fonts.semibold }}>
          {label}
        </T>
      </View>
    </Tap>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange }: { options: { label: string; value: V }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              haptic('selection');
              onChange(o.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <T variant="caption" color={active ? colors.text : colors.textMuted} style={{ fontFamily: fonts.semibold, fontSize: 13 }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Large selectable option card (onboarding / settings). */
export function OptionCard({ title, detail, selected, onPress, icon, emoji }: { title: string; detail?: string; selected: boolean; onPress: () => void; icon?: IconName; emoji?: string }) {
  return (
    <Tap onPress={onPress} hapticKind="selection" scaleTo={0.98}>
      <View style={[styles.option, selected && styles.optionSelected]}>
        {emoji ? (
          <T style={{ fontSize: 26 }}>{emoji}</T>
        ) : icon ? (
          <View style={[styles.optionIcon, selected && { backgroundColor: colors.primary }]}>
            <Ionicons name={icon} size={20} color={selected ? '#fff' : colors.textDim} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <T variant="h3">{title}</T>
          {detail ? (
            <T variant="small" color={colors.textDim}>
              {detail}
            </T>
          ) : null}
        </View>
        <View style={[styles.radio, selected && { borderColor: colors.primary }]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      </View>
    </Tap>
  );
}

// ---------- Inputs ----------

export function Field({ label, suffix, style, inputStyle, ...rest }: TextInputProps & { label?: string; suffix?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={style}>
      {label ? (
        <T variant="overline" color={colors.textMuted} style={{ marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View style={styles.field}>
        <TextInput placeholderTextColor={colors.textMuted} selectionColor={colors.primary} {...rest} style={[styles.fieldInput, inputStyle]} />
        {suffix ? (
          <T variant="bodyMedium" color={colors.textMuted}>
            {suffix}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, format = (v: number) => String(v), label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string; label?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number(v.toFixed(3)))));
  return (
    <View style={styles.stepper}>
      <IconButton icon="remove" onPress={() => set(value - step)} size={44} guard={false} accessibilityLabel={`Decrease`} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <T variant="number">{format(value)}</T>
        {label ? (
          <T variant="caption" color={colors.textMuted}>
            {label}
          </T>
        ) : null}
      </View>
      <IconButton icon="add" onPress={() => set(value + step)} size={44} guard={false} accessibilityLabel={`Increase`} />
    </View>
  );
}

// ---------- Misc ----------

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Row style={[{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }, style]}>
      <T variant="h2">{title}</T>
      {action ? (
        <Tap onPress={onAction} hapticKind="selection">
          <T variant="caption" color={colors.primaryText} style={{ fontFamily: fonts.semibold, fontSize: 13 }}>
            {action}
          </T>
        </Tap>
      ) : null}
    </Row>
  );
}

export function Badge({ label, color = colors.primary, bg, icon }: { label: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? color + '24' }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <T variant="caption" color={color} style={{ fontFamily: fonts.semibold }}>
        {label}
      </T>
    </View>
  );
}

export function Stat({ label, value, unit, color, icon, style }: { label: string; value: string; unit?: string; color?: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stat, style]}>
      <Row gap={6}>
        {icon ? <Ionicons name={icon} size={14} color={color ?? colors.textMuted} /> : null}
        <T variant="overline" color={colors.textMuted}>
          {label}
        </T>
      </Row>
      <Row gap={4} align="flex-end" style={{ marginTop: 6 }}>
        <T variant="h2" color={color ?? colors.text} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
        {unit ? (
          <T variant="caption" color={colors.textMuted} style={{ marginBottom: 3 }}>
            {unit}
          </T>
        ) : null}
      </Row>
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, height = 8, track = colors.cardAlt }: { value: number; color?: string; height?: number; track?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ height, backgroundColor: track, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function EmptyState({ icon, title, detail, action, onAction }: { icon: IconName; title: string; detail?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xl, gap: 8 }}>
      <View style={[styles.optionIcon, { width: 56, height: 56, borderRadius: 28 }]}>
        <Ionicons name={icon} size={26} color={colors.textDim} />
      </View>
      <T variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {detail ? (
        <T variant="small" color={colors.textDim} style={{ textAlign: 'center', maxWidth: 280 }}>
          {detail}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} size="md" full={false} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

export function ListRow({ icon, iconColor = colors.primary, title, detail, right, onPress }: { icon?: IconName; iconColor?: string; title: string; detail?: string; right?: ReactNode; onPress?: () => void }) {
  const body = (
    <Row style={{ paddingVertical: 12 }} gap={12}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: iconColor + '22' }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="bodyMedium">{title}</T>
        {detail ? (
          <T variant="small" color={colors.textDim}>
            {detail}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Row>
  );
  return onPress ? (
    <Tap onPress={onPress} scaleTo={0.99} hapticKind="selection">
      {body}
    </Tap>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { paddingHorizontal: space.md, paddingBottom: 120, paddingTop: space.xs },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardPad: { padding: space.md },
  glow: Platform.select({
    android: { elevation: 6 },
    default: { shadowColor: '#6D5BFF', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  }) as ViewStyle,
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.sm, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs },
  segmentActive: { backgroundColor: colors.elevated },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 52 },
  fieldInput: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 17, height: '100%' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, borderWidth: 1, borderColor: colors.border },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.sm, borderWidth: 1, borderColor: colors.border },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
