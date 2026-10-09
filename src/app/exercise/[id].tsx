import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { LineChart } from '../../components/charts';
import { Badge, Card, EmptyState, IconButton, ProgressBar, Row, Screen, SectionHeader, Stat, T } from '../../components/ui';
import { EQUIPMENT_LABEL } from '../../data/exercises';
import { MUSCLE_LABEL } from '../../data/muscles';
import { formatShortDate } from '../../lib/dates';
import { exerciseBests } from '../../lib/records';
import { e1rmSeries, exerciseHistory } from '../../lib/stats';
import { assessStrength, repMaxTable, STRENGTH_LEVELS } from '../../lib/strength';
import { formatNumber } from '../../lib/units';
import { useCurrentWeight, useExercise } from '../../store/selectors';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { colors, space } from '../../theme';

const LEVEL_LABEL: Record<(typeof STRENGTH_LEVELS)[number], string> = {
  untrained: 'Untrained',
  beginner: 'Beginner',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
};

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = useExercise(id);
  const workouts = useStore((s) => s.workouts);
  const sex = useStore((s) => s.profile?.sex ?? 'male');
  const bodyweight = useCurrentWeight();
  const u = useUnits();

  const series = useMemo(() => e1rmSeries(workouts, id), [workouts, id]);
  const history = useMemo(() => exerciseHistory(workouts, id).reverse(), [workouts, id]);
  const bests = useMemo(() => exerciseBests(workouts, id), [workouts, id]);
  const currentE1rm = series.length ? Math.max(...series.slice(-3).map((p) => p.e1rm)) : 0;
  const level = ex.standard && bodyweight && currentE1rm > 0 ? assessStrength(ex.standard, sex, currentE1rm, bodyweight) : null;
  const isStrength = ex.kind === 'strength';

  return (
    <Screen>
      <Row style={{ marginTop: space.xs }}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
      </Row>
      <T variant="title" style={{ marginTop: space.md }}>
        {ex.name}
      </T>
      <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.xs }}>
        {ex.primary.map((m) => (
          <Badge key={m} label={MUSCLE_LABEL[m]} color={colors.primaryText} />
        ))}
        {ex.secondary.map((m) => (
          <Badge key={m} label={MUSCLE_LABEL[m]} color={colors.textDim} bg={colors.cardAlt} />
        ))}
        <Badge label={EQUIPMENT_LABEL[ex.equipment]} color={colors.accent} />
      </Row>

      {isStrength ? (
        <Row gap={8} style={{ marginTop: space.lg }}>
          <Stat label="Est. 1RM" value={bests.e1rm ? u.load(bests.e1rm) : '—'} unit={bests.e1rm ? u.unit : undefined} color={colors.primaryText} />
          <Stat label="Heaviest" value={bests.weight ? u.load(bests.weight) : '—'} unit={bests.weight ? u.unit : undefined} />
          <Stat label="Sessions" value={String(bests.sessions)} />
        </Row>
      ) : (
        <Row gap={8} style={{ marginTop: space.lg }}>
          <Stat label="Sessions" value={String(bests.sessions)} />
          <Stat label={ex.kind === 'timed' ? 'Longest' : 'Longest'} value={bests.reps ? String(bests.reps) : '—'} unit={ex.kind === 'timed' ? 'sec' : 'min'} />
        </Row>
      )}

      {isStrength && series.length >= 2 ? (
        <>
          <SectionHeader title="Strength progress" />
          <Card>
            <T variant="caption" color={colors.textMuted} style={{ marginBottom: 8 }}>
              Estimated 1-rep max per session · touch to inspect
            </T>
            <LineChart
              series={[{ key: 'e1rm', label: 'Est. 1RM', color: colors.primary, area: true, points: series.map((p) => ({ x: p.date, y: u.toDisplay(p.e1rm) })) }]}
              formatY={(v) => formatNumber(v, 0)}
              formatX={(x) => formatShortDate(new Date(x))}
            />
          </Card>
        </>
      ) : null}

      {level ? (
        <>
          <SectionHeader title="Strength level" />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h2" color={colors.primaryText}>
                {LEVEL_LABEL[level.level]}
              </T>
              <T variant="caption" color={colors.textDim}>
                {formatNumber(level.ratio, 2)}× bodyweight
              </T>
            </Row>
            <View style={{ marginTop: space.sm }}>
              <ProgressBar value={level.progress} />
            </View>
            <T variant="small" color={colors.textDim} style={{ marginTop: 8 }}>
              {level.next && level.nextTargetKg
                ? `Next: ${LEVEL_LABEL[level.next]} at ${u.w(level.nextTargetKg, 0)} 1RM — ${u.w(Math.max(0, level.nextTargetKg - currentE1rm), 1)} to go.`
                : 'Top tier — elite strength for your bodyweight. 🏆'}
            </T>
          </Card>
        </>
      ) : null}

      {isStrength && currentE1rm > 0 ? (
        <>
          <SectionHeader title="Your rep maxes" />
          <Card>
            <T variant="caption" color={colors.textMuted} style={{ marginBottom: 8 }}>
              Estimated max weight for each rep count, from your current 1RM.
            </T>
            <Row style={{ flexWrap: 'wrap' }} gap={0}>
              {repMaxTable(currentE1rm).map((r) => (
                <View key={r.reps} style={{ width: '33.33%', paddingVertical: 8 }}>
                  <T variant="caption" color={colors.textMuted}>
                    {r.reps} rep{r.reps > 1 ? 's' : ''} · {Math.round(r.pct * 100)}%
                  </T>
                  <T variant="h3">
                    {u.load(r.weightKg)} {u.unit}
                  </T>
                </View>
              ))}
            </Row>
          </Card>
        </>
      ) : null}

      {ex.tips.length ? (
        <>
          <SectionHeader title="Technique tips" />
          <Card>
            {ex.tips.map((t, i) => (
              <Row key={i} gap={10} align="flex-start" style={{ paddingVertical: 6 }}>
                <T variant="bodyMedium" color={colors.primaryText}>
                  {i + 1}
                </T>
                <T variant="body" color={colors.textDim} style={{ flex: 1 }}>
                  {t}
                </T>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="History" />
      {history.length === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title="No sessions yet" detail="Log this exercise in a workout to see your history and progress." />
        </Card>
      ) : (
        <Card>
          {history.slice(0, 15).map((h, i) => (
            <View key={h.workoutId} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <T variant="caption" color={colors.textMuted}>
                {formatShortDate(new Date(h.date))}
              </T>
              <T variant="bodyMedium" style={{ marginTop: 2 }}>
                {h.sets.map((s) => (isStrength && s.weightKg ? `${u.load(s.weightKg)}×${s.reps}` : `${s.reps}`)).join('   ')}
              </T>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
