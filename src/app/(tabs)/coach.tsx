import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LineChart } from '../../components/charts';
import { Badge, Card, Row, Screen, SectionHeader, Stat, T, Tap } from '../../components/ui';
import { MUSCLE_LABEL } from '../../data/muscles';
import { ACTIVITY_LABELS, BMI_CATEGORY_LABEL, BODY_FAT_CATEGORY_LABEL, FFMI_CATEGORY_LABEL } from '../../lib/body';
import type { CoachAction } from '../../lib/coach';
import { addDays, formatLongDate, formatShortDate, parseDayKey } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { useCoachReport } from '../../store/selectors';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { categoryColor, colors, fonts, gradients, radius, space } from '../../theme';

const CATEGORY_ICON: Record<CoachAction['category'], React.ComponentProps<typeof Ionicons>['name']> = {
  nutrition: 'restaurant',
  training: 'barbell',
  hydration: 'water',
  recovery: 'moon',
  tracking: 'analytics',
  health: 'medkit',
};

export default function Coach() {
  const report = useCoachReport();
  const profile = useStore((s) => s.profile);
  const u = useUnits();
  if (!report || !profile) return null;

  const goalDate = report.projection.goalDate ? parseDayKey(report.projection.goalDate) : null;
  const projPoints = report.projection.points;
  const today = new Date();

  return (
    <Screen>
      <T variant="title" style={{ marginTop: space.sm }}>
        Your coach
      </T>
      <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
        A personalised plan built from your body data, goal and training log.
      </T>

      {/* Action plan */}
      <SectionHeader title="What to do now" />
      <View style={{ gap: 10 }}>
        {report.actions.map((a, i) => (
          <Animated.View key={a.id} entering={FadeInDown.delay(i * 50).duration(350)}>
            <Card>
              <Row gap={12} align="flex-start">
                <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: categoryColor[a.category] + '22' }}>
                  <Ionicons name={CATEGORY_ICON[a.category]} size={18} color={categoryColor[a.category]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    <T variant="h3" style={{ flexShrink: 1 }}>
                      {a.title}
                    </T>
                    {a.priority === 'high' ? <Badge label="Priority" color={colors.orange} /> : null}
                  </Row>
                  <T variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
                    {a.detail}
                  </T>
                </View>
              </Row>
            </Card>
          </Animated.View>
        ))}
      </View>

      {/* Forecast */}
      {report.goalWeightKg != null && projPoints.length > 1 ? (
        <>
          <SectionHeader title="Weight forecast" />
          <Card gradient={gradients.card}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T variant="overline" color={colors.textMuted}>
                  Now
                </T>
                <T variant="h2">{u.w(report.trendWeightKg ?? report.weightKg)}</T>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.textMuted} />
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="overline" color={colors.textMuted}>
                  {report.goalIsSuggested ? 'Suggested goal' : 'Goal'}
                </T>
                <T variant="h2" color={colors.success}>
                  {u.w(report.goalWeightKg)}
                </T>
              </View>
            </Row>
            <View style={{ marginTop: space.md }}>
              <LineChart
                series={[{ key: 'p', label: 'Projected weight', color: colors.accent, area: true, points: projPoints.map((p) => ({ x: addDays(today, p.day).getTime(), y: u.toDisplay(p.weightKg) })) }]}
                reference={{ y: u.toDisplay(report.goalWeightKg), label: 'Goal', color: colors.success }}
                formatY={(v) => formatNumber(v, 1)}
                formatX={(x) => formatShortDate(new Date(x))}
                height={170}
              />
            </View>
            <T variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
              {goalDate
                ? `Eating ~${formatNumber(report.target.calories, 0)} kcal/day, you're projected to reach your goal by ${formatLongDate(goalDate)} (${Math.round(report.projection.goalDay! / 7)} weeks).`
                : 'At this pace the goal is more than a year away. A sustainable pace still gets you there — consider a closer milestone.'}
            </T>
            {report.trendGoalDate ? (
              <T variant="caption" color={colors.textMuted} style={{ marginTop: 6 }}>
                Based on your actual weigh-in trend: {formatLongDate(parseDayKey(report.trendGoalDate)!)}.
              </T>
            ) : null}
            <T variant="caption" color={colors.textMuted} style={{ marginTop: 6 }}>
              Model: daily energy balance (7,700 kcal ≈ 1 kg), metabolism recalculated as weight changes, with adaptive slowdown.
            </T>
          </Card>
        </>
      ) : null}

      {/* Body analysis */}
      <SectionHeader title="Body analysis" />
      <Card>
        <BmiScale bmi={report.bmi.value} />
        <T variant="small" color={colors.textDim} style={{ marginTop: space.sm }}>
          BMI {formatNumber(report.bmi.value, 1)} · {report.bmi.category ? BMI_CATEGORY_LABEL[report.bmi.category] : '—'}. Healthy range for your height: {u.w(report.healthyRange.min, 0)} – {u.w(report.healthyRange.max, 0)}.
        </T>
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
          {"BMI can't tell muscle from fat — muscular lifters often read \"overweight\". Body fat % is more meaningful."}
        </T>
      </Card>
      <Row gap={8} style={{ marginTop: space.sm }}>
        <Stat label="Body fat" value={report.bodyFat ? `${formatNumber(report.bodyFat.value, 1)}%` : '—'} color={colors.orange} />
        <Stat label="Lean mass" value={Number.isFinite(report.leanMassKg) ? formatNumber(u.toDisplay(report.leanMassKg), 1) : '—'} unit={u.unit} />
        <Stat label="FFMI" value={Number.isFinite(report.ffmi.normalized) ? formatNumber(report.ffmi.normalized, 1) : '—'} color={colors.primaryText} />
      </Row>
      <Card style={{ marginTop: space.sm }}>
        <InfoRow label="Body fat level" value={report.bodyFat?.category ? BODY_FAT_CATEGORY_LABEL[report.bodyFat.category] : '—'} hint={report.bodyFat ? (report.bodyFat.method === 'navy' ? 'US Navy tape method' : report.bodyFat.method === 'measured' ? 'Your measurement' : 'Estimated from BMI & age (±4%) — add waist & neck for accuracy') : undefined} />
        <InfoRow label="Muscularity (FFMI)" value={report.ffmi.category ? FFMI_CATEGORY_LABEL[report.ffmi.category] : '—'} hint="Fat-free mass index, normalised to 1.80 m. ~25 is the natural limit for men." />
        <InfoRow label="Ideal weight (formulas)" value={u.w(report.idealWeight.average, 0)} hint={`Devine ${u.w(report.idealWeight.devine, 0)} · Robinson ${u.w(report.idealWeight.robinson, 0)} · Miller ${u.w(report.idealWeight.miller, 0)} — for sedentary people; lifters can be heavier.`} last />
        <Tap onPress={() => router.push('/log-weight')} hapticKind="selection" style={{ marginTop: space.sm }}>
          <Row gap={6}>
            <Ionicons name="resize-outline" size={16} color={colors.primaryText} />
            <T variant="caption" color={colors.primaryText} style={{ fontFamily: fonts.semibold }}>
              Add body measurements
            </T>
          </Row>
        </Tap>
      </Card>

      {/* Energy */}
      <SectionHeader title="Energy & nutrition" />
      <Card>
        <EnergyBar label="BMR" detail={`Calories burned at rest (${report.bmr.method === 'katch' ? 'Katch-McArdle' : 'Mifflin-St Jeor'})`} value={report.bmr.value} max={report.tdee * 1.15} color={colors.textDim} />
        <EnergyBar label="Maintenance (TDEE)" detail={`BMR × ${ACTIVITY_LABELS[profile.activity].title.toLowerCase()} activity`} value={report.tdee} max={report.tdee * 1.15} color={colors.accent} />
        <EnergyBar label="Your target" detail={profile.goal === 'lose' ? 'Deficit for fat loss' : profile.goal === 'gain' ? 'Surplus for lean gains' : 'Maintenance'} value={report.target.calories} max={report.tdee * 1.15} color={colors.primary} />
        {report.target.warnings.map((w) => (
          <Row key={w} gap={6} align="flex-start" style={{ marginTop: 6 }}>
            <Ionicons name="warning" size={14} color={colors.warning} />
            <T variant="caption" color={colors.warning} style={{ flex: 1 }}>
              {w}
            </T>
          </Row>
        ))}
      </Card>
      <Row gap={8} style={{ marginTop: space.sm }}>
        <Stat label="Protein" value={String(report.macros.proteinG)} unit="g" color={colors.orange} />
        <Stat label="Carbs" value={String(report.macros.carbsG)} unit="g" color={colors.accent} />
        <Stat label="Fat" value={String(report.macros.fatG)} unit="g" color={colors.pink} />
      </Row>
      <Card style={{ marginTop: space.sm }}>
        <InfoRow label="Protein per meal" value={`${report.proteinPerMeal} g × 4`} hint="Even protein spread maximises muscle protein synthesis." />
        <InfoRow label="Fiber" value={`${report.macros.fiberG} g`} hint="14 g per 1,000 kcal — keeps you full on a diet." />
        <InfoRow label="Water" value={u.water(report.waterGoalMl)} hint="~35 ml per kg bodyweight + extra on training days." last />
      </Card>

      {/* Training */}
      <SectionHeader title="Training guidance" />
      <Card>
        <InfoRow label="Recommended frequency" value={`${report.training.recommendedDays} days / week`} hint={`For a ${profile.experience} lifter. Train each muscle at least twice per week.`} />
        <InfoRow label="This week" value={`${report.training.doneThisWeek} / ${report.training.plannedThisWeek} sessions`} hint={report.training.streakWeeks > 0 ? `🔥 ${report.training.streakWeeks}-week streak` : 'Start your streak this week'} />
        <InfoRow label="Volume target" value="10–20 sets / muscle / week" hint="Hard sets taken within 0–3 reps of failure. More isn't always better." />
        <InfoRow
          label="Rep ranges"
          value={profile.trainingGoal === 'strength' ? '3–6 main · 6–12 accessories' : profile.trainingGoal === 'endurance' ? '12–20 reps' : '6–12 reps'}
          hint={profile.trainingGoal === 'strength' ? 'Rest 3–5 min on heavy compounds.' : 'Rest 2–3 min on compounds, 60–90 s on isolations.'}
        />
        <InfoRow label="Progression" value="Double progression" hint="Hit the top of the rep range on every set → add the smallest weight jump. The app suggests it for you each session." last />
        {report.training.lowVolumeMuscles.length ? (
          <T variant="caption" color={colors.warning} style={{ marginTop: 8 }}>
            Under-trained this week: {report.training.lowVolumeMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}
          </T>
        ) : null}
      </Card>

      {/* Cardio */}
      <SectionHeader title="Cardio zones" />
      <Card>
        {report.heartRateZones.map((z) => (
          <Row key={z.zone} style={{ paddingVertical: 6 }}>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: [colors.textMuted, colors.success, colors.warning, colors.orange, colors.danger][z.zone - 1] + '33', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <T variant="caption" style={{ fontFamily: fonts.bold }}>
                {z.zone}
              </T>
            </View>
            <T variant="bodyMedium" style={{ flex: 1 }}>
              {z.name}
            </T>
            <T variant="bodyMedium" color={colors.textDim}>
              {z.min}–{z.max} bpm
            </T>
          </Row>
        ))}
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 6 }}>
          Max HR ≈ 208 − 0.7 × age (Tanaka). Aim for 150+ min/week of zone 2 for heart health; it barely affects muscle recovery.
        </T>
      </Card>

      <Disclaimer />
    </Screen>
  );
}

function BmiScale({ bmi }: { bmi: number }) {
  const min = 15;
  const max = 40;
  const pos = Number.isFinite(bmi) ? Math.min(1, Math.max(0, (bmi - min) / (max - min))) : 0;
  const segs = [
    { to: 18.5, color: colors.water, label: 'Under' },
    { to: 25, color: colors.success, label: 'Healthy' },
    { to: 30, color: colors.warning, label: 'Over' },
    { to: 40, color: colors.danger, label: 'Obese' },
  ];
  let from = min;
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
        {segs.map((s) => {
          const w = (s.to - from) / (max - min);
          from = s.to;
          return <View key={s.label} style={{ flex: w, backgroundColor: s.color, opacity: 0.85 }} />;
        })}
      </View>
      <View style={{ position: 'absolute', left: `${pos * 100}%`, top: -4, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.card }} />
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        {segs.map((s) => (
          <T key={s.label} variant="caption" color={colors.textMuted} style={{ fontSize: 10 }}>
            {s.label}
          </T>
        ))}
      </Row>
    </View>
  );
}

function EnergyBar({ label, detail, value, max, color }: { label: string; detail: string; value: number; max: number; color: string }) {
  const pct = max > 0 && Number.isFinite(value) ? Math.min(1, value / max) : 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="bodyMedium">{label}</T>
        <T variant="h3">{formatNumber(value, 0)} kcal</T>
      </Row>
      <T variant="caption" color={colors.textMuted} style={{ marginBottom: 6 }}>
        {detail}
      </T>
      <View style={{ height: 8, backgroundColor: colors.cardAlt, borderRadius: radius.pill }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: color, borderRadius: radius.pill }} />
      </View>
    </View>
  );
}

function InfoRow({ label, value, hint, last }: { label: string; value: string; hint?: string; last?: boolean }) {
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Row style={{ justifyContent: 'space-between' }} gap={12}>
        <T variant="small" color={colors.textDim}>
          {label}
        </T>
        <T variant="bodyMedium" style={{ flexShrink: 1, textAlign: 'right' }}>
          {value}
        </T>
      </Row>
      {hint ? (
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 3 }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

function Disclaimer() {
  const [open, setOpen] = useState(false);
  return (
    <Tap onPress={() => setOpen((o) => !o)} hapticKind="selection" style={{ marginTop: space.xl }}>
      <Row gap={6} style={{ justifyContent: 'center' }}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <T variant="caption" color={colors.textMuted}>
          How these numbers are calculated
        </T>
      </Row>
      {open ? (
        <T variant="caption" color={colors.textMuted} style={{ marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
          BMR: Mifflin-St Jeor (or Katch-McArdle with known body fat). Body fat: US Navy or Deurenberg. Protein: ISSN 1.6–2.2 g/kg. Fat loss 0.5–1% BW/week (Garthe 2011). Volume: Schoenfeld 2017 dose-response. Strength standards: bodyweight ratios. Estimates only — not medical advice.
        </T>
      ) : null}
    </Tap>
  );
}
