import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Field, IconButton, Row, Screen, Segmented, SectionHeader, T } from '../components/ui';
import { estimate1RM, percentOf1RM } from '../lib/strength';
import { formatNumber, kgToLb, lbToKg, parseDecimal } from '../lib/units';
import { plateLoadout, PLATES_KG, PLATES_LB, warmupSets } from '../lib/warmup';
import { useUnits } from '../store/useUnits';
import { colors, radius, space } from '../theme';

type Tab = 'orm' | 'plates' | 'warmup';

const PLATE_COLORS: Record<string, string> = {
  '25': '#EF4444',
  '20': '#3B82F6',
  '15': '#F59E0B',
  '10': '#22C55E',
  '5': '#E5E7EB',
  '2.5': '#64748B',
  '1.25': '#94A3B8',
  '45': '#3B82F6',
  '35': '#F59E0B',
};

export default function Tools() {
  const params = useLocalSearchParams<{ tab?: Tab; weightKg?: string }>();
  const u = useUnits();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'orm');
  const initial = params.weightKg ? formatNumber(u.toDisplay(Number(params.weightKg)), 2) : u.unit === 'kg' ? '100' : '225';
  return (
    <Screen>
      <Row style={{ marginTop: space.xs }}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <T variant="h2" style={{ flex: 1, textAlign: 'center', marginRight: 40 }}>
          Calculators
        </T>
      </Row>
      <View style={{ marginTop: space.md }}>
        <Segmented
          options={[
            { label: '1RM', value: 'orm' as Tab },
            { label: 'Plates', value: 'plates' as Tab },
            { label: 'Warm-up', value: 'warmup' as Tab },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'orm' ? <OneRm /> : tab === 'plates' ? <Plates initial={initial} /> : <Warmup initial={initial} />}
    </Screen>
  );
}

function OneRm() {
  const u = useUnits();
  const [w, setW] = useState(u.unit === 'kg' ? '80' : '185');
  const [r, setR] = useState('8');
  const [rpe, setRpe] = useState('');
  const weight = parseDecimal(w);
  const reps = parseInt(r, 10);
  const rpeVal = parseDecimal(rpe);
  const orm = weight > 0 && reps > 0 ? estimate1RM(weight, reps, Number.isFinite(rpeVal) ? rpeVal : null) : null;
  return (
    <>
      <Row gap={10} style={{ marginTop: space.lg }}>
        <Field label="Weight" value={w} onChangeText={setW} keyboardType="decimal-pad" suffix={u.unit} style={{ flex: 1 }} />
        <Field label="Reps" value={r} onChangeText={setR} keyboardType="number-pad" style={{ flex: 1 }} />
        <Field label="RPE (opt.)" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" placeholder="—" style={{ flex: 1 }} />
      </Row>
      {orm && orm.value > 0 ? (
        <>
          <Card style={{ marginTop: space.md, alignItems: 'center' }}>
            <T variant="overline" color={colors.textMuted}>
              Estimated 1-rep max
            </T>
            <T variant="display" color={colors.primaryText}>
              {formatNumber(orm.value, 1)} {u.unit}
            </T>
            <T variant="caption" color={orm.confidence === 'high' ? colors.success : orm.confidence === 'medium' ? colors.warning : colors.danger}>
              {orm.confidence === 'high' ? 'High accuracy (≤ 6 reps)' : orm.confidence === 'medium' ? 'Good accuracy (7–10 reps)' : 'Rough estimate — use sets of 10 or fewer reps'}
            </T>
          </Card>
          <SectionHeader title="Training loads" />
          <Card>
            {[1, 2, 3, 5, 6, 8, 10, 12].map((reps) => (
              <Row key={reps} style={styles.tableRow}>
                <T variant="bodyMedium" style={{ width: 70 }}>
                  {reps} rep{reps > 1 ? 's' : ''}
                </T>
                <T variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                  {Math.round(percentOf1RM(reps, 10) * 100)}% max · @RPE 8: {formatNumber(orm.value * percentOf1RM(reps, 8), 1)}
                </T>
                <T variant="h3">
                  {formatNumber(orm.value * percentOf1RM(reps, 10), 1)} {u.unit}
                </T>
              </Row>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Plates({ initial }: { initial: string }) {
  const u = useUnits();
  const [w, setW] = useState(initial);
  const [bar, setBar] = useState<number>(u.unit === 'kg' ? 20 : 45);
  const total = parseDecimal(w);
  const plates = u.unit === 'kg' ? PLATES_KG : PLATES_LB;
  const res = useMemo(() => (total > 0 ? plateLoadout(total, bar, plates) : null), [total, bar, plates]);
  return (
    <>
      <Field label="Target weight" value={w} onChangeText={setW} keyboardType="decimal-pad" suffix={u.unit} style={{ marginTop: space.lg }} />
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.md, marginBottom: 8 }}>
        Bar
      </T>
      <Segmented
        options={(u.unit === 'kg' ? [20, 15, 10] : [45, 35, 25]).map((b) => ({ label: `${b} ${u.unit}`, value: b }))}
        value={bar}
        onChange={setBar}
      />
      {res ? (
        <Card style={{ marginTop: space.md }}>
          <T variant="overline" color={colors.textMuted}>
            Each side
          </T>
          <View style={styles.barViz}>
            <View style={styles.sleeve} />
            {res.perSide.flatMap((p) =>
              Array.from({ length: p.count }, (_, i) => {
                const h = 30 + Math.min(1, p.plate / plates[0]) * 70;
                return <View key={`${p.plate}-${i}`} style={[styles.plate, { height: h, backgroundColor: PLATE_COLORS[String(p.plate)] ?? colors.textDim }]} />;
              }),
            )}
            <View style={styles.collar} />
          </View>
          {res.perSide.length === 0 ? (
            <T variant="body" color={colors.textDim}>
              Just the bar.
            </T>
          ) : (
            res.perSide.map((p) => (
              <Row key={p.plate} style={styles.tableRow}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: PLATE_COLORS[String(p.plate)] ?? colors.textDim, marginRight: 10 }} />
                <T variant="bodyMedium" style={{ flex: 1 }}>
                  {p.plate} {u.unit}
                </T>
                <T variant="h3">× {p.count}</T>
              </Row>
            ))
          )}
          {Math.abs(res.remainder) > 0.001 ? (
            <T variant="caption" color={colors.warning} style={{ marginTop: 8 }}>
              Closest loadable: {formatNumber(res.achieved, 2)} {u.unit} ({formatNumber(res.remainder, 2)} {u.unit} short)
            </T>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function Warmup({ initial }: { initial: string }) {
  const u = useUnits();
  const [w, setW] = useState(initial);
  const value = parseDecimal(w);
  const kg = u.unit === 'kg' ? value : lbToKg(value);
  const sets = value > 0 ? warmupSets(kg, { unit: u.unit, heavy: true }) : [];
  return (
    <>
      <Field label="Working weight" value={w} onChangeText={setW} keyboardType="decimal-pad" suffix={u.unit} style={{ marginTop: space.lg }} />
      <Card style={{ marginTop: space.md }}>
        {sets.length === 0 ? (
          <T variant="body" color={colors.textDim}>
            Enter a working weight heavier than the empty bar.
          </T>
        ) : (
          sets.map((s, i) => (
            <Row key={i} style={styles.tableRow}>
              <T variant="caption" color={colors.textMuted} style={{ width: 80 }}>
                {s.label}
              </T>
              <T variant="h3" style={{ flex: 1 }}>
                {formatNumber(u.unit === 'kg' ? s.weightKg : kgToLb(s.weightKg), 1)} {u.unit}
              </T>
              <T variant="bodyMedium" color={colors.textDim}>
                × {s.reps}
              </T>
            </Row>
          ))
        )}
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 8 }}>
          Rest 30–90 s between warm-ups and 2–3 min before your first working set. Warm-ups shouldn&apos;t tire you.
        </T>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  tableRow: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barViz: { flexDirection: 'row', alignItems: 'center', height: 110, marginVertical: space.sm },
  sleeve: { width: 40, height: 12, backgroundColor: colors.textMuted, borderRadius: 3 },
  plate: { width: 14, marginRight: 2, borderRadius: 3 },
  collar: { width: 10, height: 22, backgroundColor: colors.textDim, borderRadius: radius.xs },
});
