import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { ActivityHeatmap, HBar, LineChart, MiniBars, Series } from '../../components/charts';
import { Button, Card, Chip, EmptyState, Row, Screen, Segmented, SectionHeader, Stat, T, Tap } from '../../components/ui';
import { MUSCLE_LABEL, MUSCLES, VOLUME_LANDMARKS } from '../../data/muscles';
import { addDays, dayKey, formatLongDate, formatShortDate, parseDayKey, startOfDay, startOfWeek, WEEKDAY_SHORT } from '../../lib/dates';
import { e1rmSeries, finishedWorkouts, totalStats, workoutsByDay, workoutVolume } from '../../lib/stats';
import { assessStrength, STANDARD_LIFT_LABEL, StandardLift } from '../../lib/strength';
import { trendSeries } from '../../lib/projection';
import { formatInt, formatNumber } from '../../lib/units';
import { setsPerMuscle, volumeStatus, VOLUME_STATUS_LABEL, VolumeStatus } from '../../lib/volume';
import { useCoachReport, useCurrentWeight, useExerciseLookup, useWaterGoal } from '../../store/selectors';
import { useToday } from '../../hooks/time';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { colors, space } from '../../theme';

type Tab = 'body' | 'strength' | 'activity';

export default function Progress() {
  const [tab, setTab] = useState<Tab>('body');
  return (
    <Screen>
      <T variant="title" style={{ marginTop: space.sm, marginBottom: space.md }}>
        Progress
      </T>
      <Segmented
        options={[
          { label: 'Body', value: 'body' as Tab },
          { label: 'Strength', value: 'strength' as Tab },
          { label: 'Activity', value: 'activity' as Tab },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'body' ? <BodyTab /> : tab === 'strength' ? <StrengthTab /> : <ActivityTab />}
    </Screen>
  );
}

// ---------------- Body ----------------

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'All', days: 100000 },
];

function BodyTab() {
  const weighIns = useStore((s) => s.weighIns);
  const deleteWeighIn = useStore((s) => s.deleteWeighIn);
  const report = useCoachReport();
  const u = useUnits();
  const [range, setRange] = useState(90);

  const trend = useMemo(() => trendSeries(weighIns), [weighIns]);
  const cutoff = dayKey(addDays(new Date(), -range));
  const visible = trend.filter((p) => p.date >= cutoff);

  const series: Series[] = useMemo(() => {
    const toX = (k: string) => parseDayKey(k)!.getTime();
    const out: Series[] = [
      { key: 'raw', label: 'Scale', color: colors.textDim, style: 'dots', points: visible.map((p) => ({ x: toX(p.date), y: u.toDisplay(p.weightKg) })) },
      { key: 'trend', label: 'Trend', color: colors.primary, area: true, points: visible.map((p) => ({ x: toX(p.date), y: u.toDisplay(p.trend) })) },
    ];
    if (report && report.projection.points.length > 1 && visible.length) {
      const last = visible[visible.length - 1];
      const base = toX(last.date);
      const horizon = Math.min(report.projection.goalDay ?? 120, 120);
      const pts = report.projection.points.filter((p) => p.day <= horizon);
      const offset = (last.trend ?? report.weightKg) - report.projection.points[0].weightKg;
      out.push({ key: 'proj', label: 'Forecast', color: colors.accent, style: 'dashed', points: pts.map((p) => ({ x: base + p.day * 86_400_000, y: u.toDisplay(p.weightKg + offset) })) });
    }
    return out;
  }, [visible, report, u]);

  if (!report) return null;
  const rate = report.weeklyRateKg;
  const goalDate = report.trendGoalDate ?? report.projection.goalDate;

  return (
    <View>
      <Row gap={8} style={{ marginTop: space.md }}>
        <Stat label="Trend" value={formatNumber(u.toDisplay(report.trendWeightKg ?? report.weightKg), 1)} unit={u.unit} color={colors.primaryText} />
        <Stat label="Per week" value={rate == null ? '—' : `${rate > 0 ? '+' : ''}${formatNumber(u.toDisplay(rate), 2)}`} unit={rate == null ? undefined : u.unit} />
        <Stat label="Goal" value={report.goalWeightKg ? formatNumber(u.toDisplay(report.goalWeightKg), 1) : '—'} unit={report.goalWeightKg ? u.unit : undefined} color={colors.success} />
      </Row>

      <Card style={{ marginTop: space.sm }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="h3">Bodyweight</T>
          <Row gap={6}>
            {RANGES.map((r) => (
              <Chip key={r.label} label={r.label} active={range === r.days} onPress={() => setRange(r.days)} />
            ))}
          </Row>
        </Row>
        {visible.length === 0 ? (
          <EmptyState icon="scale-outline" title="No weigh-ins yet" detail="Log your weight in the morning to see your trend and forecast." />
        ) : (
          <LineChart
            series={series}
            height={220}
            formatY={(v) => formatNumber(v, 1)}
            formatX={(x) => formatShortDate(new Date(x))}
            reference={report.goalWeightKg ? { y: u.toDisplay(report.goalWeightKg), label: 'Goal', color: colors.success } : undefined}
          />
        )}
        {goalDate ? (
          <Row gap={8} style={{ marginTop: space.sm }}>
            <Ionicons name="flag" size={16} color={colors.success} />
            <T variant="small" color={colors.textDim} style={{ flex: 1 }}>
              {report.trendGoalDate ? 'At your current rate' : 'Following your plan'}, you&apos;ll reach {u.w(report.goalWeightKg!)} around{' '}
              <T variant="small" color={colors.text}>
                {formatLongDate(parseDayKey(goalDate)!)}
              </T>
              .
            </T>
          </Row>
        ) : null}
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 8 }}>
          The trend line smooths out water and food swings (±{u.unit === 'kg' ? '1–2 kg' : '2–4 lb'} day to day is normal).
        </T>
      </Card>

      <Button title="Log weight" icon="add" onPress={() => router.push('/log-weight')} style={{ marginTop: space.md }} />

      {trend.length ? (
        <>
          <SectionHeader title="Weigh-ins" />
          <Card padded={false}>
            {[...trend]
              .reverse()
              .slice(0, 30)
              .map((p, i, arr) => {
                const prev = arr[i + 1];
                const diff = prev ? p.weightKg - prev.weightKg : 0;
                return (
                  <Tap
                    key={p.date}
                    hapticKind={null}
                    scaleTo={0.99}
                    onLongPress={() =>
                      Alert.alert('Delete weigh-in?', `${formatLongDate(parseDayKey(p.date)!)} · ${u.w(p.weightKg)}`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteWeighIn(p.date) },
                      ])
                    }
                  >
                    <Row style={{ paddingHorizontal: space.md, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                      <T variant="bodyMedium" style={{ flex: 1 }}>
                        {formatShortDate(parseDayKey(p.date)!)}
                      </T>
                      {prev ? (
                        <T variant="caption" color={diff > 0 ? colors.orange : diff < 0 ? colors.success : colors.textMuted} style={{ marginRight: 12 }}>
                          {diff > 0 ? '▲' : diff < 0 ? '▼' : '•'} {formatNumber(Math.abs(u.toDisplay(diff)), 1)}
                        </T>
                      ) : null}
                      <T variant="bodyMedium">{u.w(p.weightKg)}</T>
                    </Row>
                  </Tap>
                );
              })}
          </Card>
          <T variant="caption" color={colors.textMuted} style={{ marginTop: 6, textAlign: 'center' }}>
            Long-press an entry to delete it
          </T>
        </>
      ) : null}
    </View>
  );
}

// ---------------- Strength ----------------

const KEY_LIFTS: { lift: StandardLift; id: string }[] = [
  { lift: 'squat', id: 'squat' },
  { lift: 'bench', id: 'bench_press' },
  { lift: 'deadlift', id: 'deadlift' },
  { lift: 'ohp', id: 'ohp' },
];

function StrengthTab() {
  const workouts = useStore((s) => s.workouts);
  const sex = useStore((s) => s.profile?.sex ?? 'male');
  const bw = useCurrentWeight();
  const lookup = useExerciseLookup();
  const u = useUnits();

  const trained = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of finishedWorkouts(workouts)) for (const e of w.exercises) if (lookup(e.exerciseId)?.kind === 'strength') counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [workouts, lookup]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? trained[0] ?? null;
  const series = useMemo(() => (current ? e1rmSeries(workouts, current) : []), [workouts, current]);

  if (!trained.length) {
    return (
      <Card style={{ marginTop: space.md }}>
        <EmptyState icon="trending-up" title="No strength data yet" detail="Finish a workout and your estimated 1-rep maxes will be charted here." />
      </Card>
    );
  }

  return (
    <View>
      <FlatList
        horizontal
        data={trained}
        keyExtractor={(id) => id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: space.md }}
        renderItem={({ item }) => <Chip label={lookup(item)?.name ?? item} active={item === current} onPress={() => setSelected(item)} />}
      />
      {current ? (
        <Card onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: current } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">{lookup(current)?.name}</T>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
          {series.length ? (
            <>
              <Row gap={6} align="flex-end" style={{ marginTop: 6, marginBottom: space.sm }}>
                <T variant="number">{u.load(series[series.length - 1].e1rm)}</T>
                <T variant="caption" color={colors.textMuted} style={{ marginBottom: 6 }}>
                  {u.unit} est. 1RM
                </T>
                {series.length > 1 ? (
                  <T variant="caption" color={series[series.length - 1].e1rm >= series[0].e1rm ? colors.success : colors.warning} style={{ marginBottom: 6, marginLeft: 6 }}>
                    {series[series.length - 1].e1rm >= series[0].e1rm ? '▲' : '▼'} {u.load(Math.abs(series[series.length - 1].e1rm - series[0].e1rm))} since start
                  </T>
                ) : null}
              </Row>
              {series.length > 1 ? (
                <LineChart series={[{ key: 'e', label: 'Est. 1RM', color: colors.primary, area: true, points: series.map((p) => ({ x: p.date, y: u.toDisplay(p.e1rm) })) }]} formatY={(v) => formatNumber(v, 0)} formatX={(x) => formatShortDate(new Date(x))} />
              ) : (
                <T variant="small" color={colors.textDim}>
                  Log another session to see the trend.
                </T>
              )}
            </>
          ) : null}
        </Card>
      ) : null}

      <SectionHeader title="Big lifts vs standards" />
      <Card>
        {KEY_LIFTS.map(({ lift, id }) => {
          const s = e1rmSeries(workouts, id);
          const e1rm = s.length ? Math.max(...s.slice(-3).map((p) => p.e1rm)) : 0;
          const a = bw && e1rm ? assessStrength(lift, sex, e1rm, bw) : null;
          return (
            <View key={lift} style={{ marginBottom: 12 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <T variant="small">{STANDARD_LIFT_LABEL[lift]}</T>
                <T variant="caption" color={a ? colors.primaryText : colors.textMuted}>
                  {a ? `${a.level[0].toUpperCase()}${a.level.slice(1)} · ${formatNumber(a.ratio, 2)}× BW` : 'Not logged yet'}
                </T>
              </Row>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {['beginner', 'novice', 'intermediate', 'advanced', 'elite'].map((lv, i) => {
                  const idx = a ? ['untrained', 'beginner', 'novice', 'intermediate', 'advanced', 'elite'].indexOf(a.level) : 0;
                  return <View key={lv} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < idx ? colors.primary : colors.cardAlt }} />;
                })}
              </View>
            </View>
          );
        })}
        <T variant="caption" color={colors.textMuted}>
          Levels: beginner → novice → intermediate → advanced → elite, based on 1RM ÷ bodyweight.
        </T>
      </Card>
    </View>
  );
}

// ---------------- Activity ----------------

const STATUS_COLOR: Record<VolumeStatus, string> = {
  none: colors.cardAlt,
  low: colors.danger,
  maintenance: colors.warning,
  optimal: colors.success,
  high: colors.accent,
  excessive: colors.pink,
};

function ActivityTab() {
  const workouts = useStore((s) => s.workouts);
  const water = useStore((s) => s.water);
  const waterGoal = useWaterGoal();
  const lookup = useExerciseLookup();
  const u = useUnits();
  const now = useToday();
  const byDay = useMemo(() => workoutsByDay(workouts), [workouts]);
  const totals = useMemo(() => totalStats(workouts), [workouts]);

  const weekly = useMemo(() => {
    const start = startOfWeek(now);
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(start, -(7 - i) * 7);
      const to = addDays(from, 7);
      const vol = workouts.filter((w) => w.endedAt && w.startedAt >= from.getTime() && w.startedAt < to.getTime()).reduce((s, w) => s + workoutVolume(w), 0);
      return { label: formatShortDate(from).split(' ')[1], vol };
    });
  }, [workouts, now]);

  // Window ends at the end of today so workouts logged later today still count.
  const muscles = useMemo(() => {
    const end = addDays(startOfDay(now), 1).getTime();
    return setsPerMuscle(workouts, lookup, end - 8 * 86_400_000, end);
  }, [workouts, lookup, now]);

  const waterWeek = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(now, i - 6);
    const ml = (water[dayKey(d)] ?? []).reduce((s, e) => s + e.ml, 0);
    return { label: WEEKDAY_SHORT[d.getDay()].slice(0, 2), ml };
  });
  const waterDaysHit = waterWeek.filter((d) => d.ml >= waterGoal).length;

  return (
    <View>
      <Row gap={8} style={{ marginTop: space.md }}>
        <Stat label="Workouts" value={String(totals.count)} icon="barbell-outline" />
        <Stat label="Hours" value={formatNumber(totals.minutes / 60, 1)} icon="time-outline" />
        <Stat label="Volume" value={totals.volumeKg >= 10000 ? `${formatNumber(u.toDisplay(totals.volumeKg) / 1000, 1)}k` : formatInt(u.toDisplay(totals.volumeKg))} unit={u.unit} icon="layers-outline" />
      </Row>

      <SectionHeader title="Consistency" />
      <Card>
        <ActivityHeatmap weeks={16} today={now} countFor={(d) => byDay.get(dayKey(d)) ?? 0} color={colors.success} />
      </Card>

      <SectionHeader title="Weekly volume" />
      <Card>
        <MiniBars values={weekly.map((w) => u.toDisplay(w.vol))} labels={weekly.map((w) => w.label)} format={(v) => (v >= 1000 ? `${formatNumber(v / 1000, 1)}k` : formatInt(v))} />
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          Total {u.unit} lifted per week (weight × reps). Last 8 weeks, labelled by week start.
        </T>
      </Card>

      <SectionHeader title="Sets per muscle · 7 days" />
      <Card>
        {MUSCLES.map((m) => {
          const l = VOLUME_LANDMARKS[m];
          const st = volumeStatus(m, muscles[m]);
          return (
            <HBar key={m} label={MUSCLE_LABEL[m]} value={muscles[m]} max={Math.max(l.mrv, muscles[m])} color={STATUS_COLOR[st]} marker={{ from: l.mav[0], to: l.mav[1] }} right={`${formatNumber(muscles[m], 1)} · ${VOLUME_STATUS_LABEL[st]}`} />
          );
        })}
        <T variant="caption" color={colors.textMuted}>
          Shaded zone = optimal weekly sets for growth. Primary muscles count 1 set, secondary 0.5.
        </T>
      </Card>

      <SectionHeader title="Water · 7 days" />
      <Card>
        <MiniBars values={waterWeek.map((d) => d.ml)} labels={waterWeek.map((d) => d.label)} color={colors.water} format={(v) => u.water(v)} />
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          Goal hit on {waterDaysHit} of 7 days · goal {u.water(waterGoal)}
        </T>
      </Card>
    </View>
  );
}
