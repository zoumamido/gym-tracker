import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Field, haptic, Row, T } from '../components/ui';
import { addDays, dayKey, formatShortDate } from '../lib/dates';
import { bodyFatNavy } from '../lib/body';
import { CM_PER_INCH, formatNumber, parseDecimal } from '../lib/units';
import { useCurrentWeight } from '../store/selectors';
import { useStore } from '../store/useStore';
import { useUnits } from '../store/useUnits';
import { colors, radius, space } from '../theme';

export default function LogWeight() {
  const insets = useSafeAreaInsets();
  const current = useCurrentWeight();
  const profile = useStore((s) => s.profile);
  const { logWeight, addMeasurement } = useStore.getState();
  const u = useUnits();
  const [text, setText] = useState(current ? formatNumber(u.toDisplay(current), 1) : '');
  const [dayOffset, setDayOffset] = useState(0);
  const [showMeasure, setShowMeasure] = useState(false);
  // Tape measurements: cm for metric users, inches for imperial (stored as cm).
  const lenUnit = u.unit === 'kg' ? 'cm' : 'in';
  const toLen = (cm: number | null | undefined) => (cm ? formatNumber(u.unit === 'kg' ? cm : cm / CM_PER_INCH, 1) : '');
  const fromLen = (t: string) => {
    const v = parseDecimal(t);
    return v > 0 ? (u.unit === 'kg' ? v : v * CM_PER_INCH) : NaN;
  };
  const [waist, setWaist] = useState(toLen(profile?.waistCm));
  const [neck, setNeck] = useState(toLen(profile?.neckCm));
  const [hip, setHip] = useState(toLen(profile?.hipCm));

  const kg = u.fromDisplay(parseDecimal(text));
  const valid = kg >= 25 && kg <= 400;
  const date = dayKey(addDays(new Date(), -dayOffset));
  const w = fromLen(waist);
  const n = fromLen(neck);
  const h = fromLen(hip);
  const diffDisplay = current && valid ? Number((u.toDisplay(kg) - u.toDisplay(current)).toFixed(1)) : 0;
  const navy = profile && w > 0 && n > 0 ? bodyFatNavy({ sex: profile.sex, heightCm: profile.heightCm, waistCm: w, neckCm: n, hipCm: h > 0 ? h : null }) : null;

  const save = () => {
    if (!valid) return;
    logWeight(kg, date);
    if (showMeasure && (w > 0 || n > 0 || h > 0)) {
      addMeasurement({ date, waistCm: w > 0 ? w : null, neckCm: n > 0 ? n : null, hipCm: h > 0 ? h : null });
    }
    haptic('success');
    router.back();
  };

  const nudge = (delta: number) => {
    const v = parseDecimal(text);
    const base = Number.isFinite(v) ? v : current ? u.toDisplay(current) : 70;
    setText(formatNumber(Math.max(0, base + delta), 1));
    haptic('selection');
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} />
      <KeyboardAvoidingView behavior="padding">
        <Animated.View entering={SlideInDown.springify().damping(20)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.handle} />
            <T variant="h2">Log weight</T>
            <Row gap={8} style={{ marginTop: space.sm }}>
              {[0, 1, 2].map((o) => (
                <Chip key={o} label={o === 0 ? 'Today' : o === 1 ? 'Yesterday' : formatShortDate(addDays(new Date(), -o))} active={dayOffset === o} onPress={() => setDayOffset(o)} />
              ))}
            </Row>
            <Row gap={10} style={{ marginTop: space.md }}>
              <Button title="−0.1" variant="secondary" size="md" full={false} onPress={() => nudge(-0.1)} />
              <Field value={text} onChangeText={setText} keyboardType="decimal-pad" suffix={u.unit} autoFocus style={{ flex: 1 }} inputStyle={{ fontSize: 24, textAlign: 'center' }} selectTextOnFocus />
              <Button title="+0.1" variant="secondary" size="md" full={false} onPress={() => nudge(0.1)} />
            </Row>
            {current && valid ? (
              <T variant="caption" color={colors.textMuted} style={{ marginTop: 8, textAlign: 'center' }}>
                {diffDisplay === 0 ? 'Same as last entry' : `${diffDisplay > 0 ? '+' : '−'}${formatNumber(Math.abs(diffDisplay), 1)} ${u.unit} vs last entry`}
              </T>
            ) : null}

            <Pressable onPress={() => setShowMeasure((s) => !s)} style={{ marginTop: space.md }}>
              <T variant="bodyMedium" color={colors.primaryText}>
                {showMeasure ? '− Hide measurements' : '+ Add body measurements (for body fat %)'}
              </T>
            </Pressable>
            {showMeasure ? (
              <View style={{ gap: 10, marginTop: space.sm }}>
                <Row gap={10}>
                  <Field label="Waist (navel)" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" suffix={lenUnit} style={{ flex: 1 }} />
                  <Field label="Neck" value={neck} onChangeText={setNeck} keyboardType="decimal-pad" suffix={lenUnit} style={{ flex: 1 }} />
                </Row>
                {profile?.sex === 'female' ? <Field label="Hips (widest)" value={hip} onChangeText={setHip} keyboardType="decimal-pad" suffix={lenUnit} /> : null}
                {navy != null ? (
                  <View style={styles.result}>
                    <T variant="caption" color={colors.textDim}>
                      Estimated body fat (US Navy)
                    </T>
                    <T variant="h2" color={colors.orange}>
                      {formatNumber(navy, 1)}%
                    </T>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Button title="Save" icon="checkmark" onPress={save} disabled={!valid} style={{ marginTop: space.lg }} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.md, paddingTop: space.sm, borderWidth: 1, borderColor: colors.border, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.md },
  result: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
});
