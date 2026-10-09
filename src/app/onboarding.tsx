import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, OptionCard, ProgressBar, Row, Segmented, Stat, Stepper, T, Tap } from '../components/ui';
import { ACCESS_LABEL, EXERCISE_MAP } from '../data/exercises';
import { ACTIVITY_LABELS, ActivityLevel, Sex } from '../lib/body';
import { buildCoachReport } from '../lib/coach';
import { formatLongDate, parseDayKey } from '../lib/dates';
import type { BodyGoal, Experience, Pace } from '../lib/nutrition';
import { exercisesForMinutes, generateProgram, recommendedDays } from '../lib/program';
import type { EquipmentAccess, Profile, TrainingGoal } from '../lib/types';
import { cmToFeetInches, feetInchesToCm, formatNumber, formatWater, fromDisplayWeight, parseDecimal, toDisplayWeight, WeightUnit } from '../lib/units';
import { requestPermission } from '../services/notifications';
import { useStore } from '../store/useStore';
import { colors, gradients, space } from '../theme';

type Step = 'welcome' | 'basics' | 'body' | 'goal' | 'activity' | 'training' | 'schedule' | 'plan';
const STEPS: Step[] = ['welcome', 'basics', 'body', 'goal', 'activity', 'training', 'schedule', 'plan'];

interface Draft {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: BodyGoal;
  goalWeightKg: number | null;
  pace: Pace;
  activity: ActivityLevel;
  experience: Experience;
  trainingGoal: TrainingGoal;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: EquipmentAccess;
}

export default function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const updateSettings = useStore((s) => s.updateSettings);
  const unit = useStore((s) => s.settings.unit);
  const [step, setStep] = useState<Step>('welcome');
  const [d, setD] = useState<Draft>({
    name: '',
    sex: 'male',
    age: 25,
    heightCm: 175,
    weightKg: 75,
    goal: 'lose',
    goalWeightKg: null,
    pace: 'moderate',
    activity: 'moderate',
    experience: 'beginner',
    trainingGoal: 'hypertrophy',
    daysPerWeek: 3,
    sessionMinutes: 60,
    equipment: 'gym',
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const idx = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)]);
  const back = () => setStep(STEPS[Math.max(0, idx - 1)]);
  const [submitting, setSubmitting] = useState(false);

  // Android hardware back steps backwards through onboarding instead of exiting the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (idx > 0) {
        setStep(STEPS[idx - 1]);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [idx]);

  const profile: Profile = useMemo(
    () => ({
      name: d.name.trim(),
      sex: d.sex,
      age: d.age,
      heightCm: d.heightCm,
      weightKg: d.weightKg,
      goalWeightKg: d.goal === 'maintain' ? null : d.goalWeightKg,
      bodyFatPct: null,
      waistCm: null,
      neckCm: null,
      hipCm: null,
      activity: d.activity,
      goal: d.goal,
      pace: d.pace,
      experience: d.experience,
      trainingGoal: d.trainingGoal,
      daysPerWeek: d.daysPerWeek,
      equipment: d.equipment,
      sessionMinutes: d.sessionMinutes,
    }),
    [d],
  );

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    const program = generateProgram({
      daysPerWeek: d.daysPerWeek,
      experience: d.experience,
      trainingGoal: d.trainingGoal,
      equipment: d.equipment,
      maxExercises: exercisesForMinutes(d.sessionMinutes),
    });
    // Ask for notification permission first, then commit (the tabs guard redirects once onboarded).
    await requestPermission().catch(() => false);
    completeOnboarding(profile, program);
    router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {step !== 'welcome' ? (
          <View style={styles.header}>
            <Tap onPress={back} hapticKind="selection" style={styles.back}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Tap>
            <View style={{ flex: 1 }}>
              <ProgressBar value={idx / (STEPS.length - 1)} height={6} />
            </View>
            <T variant="caption" color={colors.textMuted} style={{ width: 36, textAlign: 'right' }}>
              {idx}/{STEPS.length - 1}
            </T>
          </View>
        ) : null}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={FadeInRight.duration(280)}>
            {step === 'welcome' && <Welcome />}
            {step === 'basics' && <Basics d={d} set={set} />}
            {step === 'body' && <Body d={d} set={set} unit={unit} setUnit={(u) => updateSettings({ unit: u })} />}
            {step === 'goal' && <Goal d={d} set={set} unit={unit} />}
            {step === 'activity' && <Activity d={d} set={set} />}
            {step === 'training' && <Training d={d} set={set} />}
            {step === 'schedule' && <Schedule d={d} set={set} />}
            {step === 'plan' && <Plan profile={profile} unit={unit} />}
          </Animated.View>
        </ScrollView>
        <View style={styles.footer}>
          {step === 'plan' ? (
            <Button title="Start my journey" icon="flash" onPress={finish} loading={submitting} />
          ) : (
            <Button title={step === 'welcome' ? "Let's get started" : 'Continue'} icon={step === 'welcome' ? 'arrow-forward' : undefined} onPress={next} disabled={step === 'basics' && d.name.trim().length === 0} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type StepProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void };

function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <T variant="title">{title}</T>
      {subtitle ? (
        <T variant="body" color={colors.textDim} style={{ marginTop: 6 }}>
          {subtitle}
        </T>
      ) : null}
    </View>
  );
}

function Welcome() {
  const features: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string; color: string }[] = [
    { icon: 'barbell', title: 'Smart workout plan', detail: 'Built from your goal, schedule and equipment', color: colors.primary },
    { icon: 'trending-up', title: 'Progressive overload', detail: 'Tells you exactly what weight to lift next', color: colors.success },
    { icon: 'analytics', title: 'Weight prediction', detail: 'See when you will reach your goal', color: colors.orange },
    { icon: 'water', title: 'Hydration reminders', detail: 'Personal water target with smart nudges', color: colors.water },
  ];
  return (
    <View style={{ paddingTop: space.xl }}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
        <Ionicons name="barbell" size={40} color="#fff" />
      </LinearGradient>
      <T variant="display" style={{ marginTop: space.lg }}>
        Your personal{'\n'}gym coach.
      </T>
      <T variant="body" color={colors.textDim} style={{ marginTop: space.sm, marginBottom: space.xl }}>
        Answer a few questions and get a science-based plan for training, nutrition and hydration — then track every rep.
      </T>
      {features.map((f, i) => (
        <Animated.View key={f.title} entering={FadeInDown.delay(120 + i * 90).duration(400)}>
          <Row gap={14} style={{ marginBottom: space.md }}>
            <View style={[styles.featureIcon, { backgroundColor: f.color + '22' }]}>
              <Ionicons name={f.icon} size={22} color={f.color} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">{f.title}</T>
              <T variant="small" color={colors.textDim}>
                {f.detail}
              </T>
            </View>
          </Row>
        </Animated.View>
      ))}
    </View>
  );
}

function Basics({ d, set }: StepProps) {
  return (
    <View>
      <Title title="Let's get to know you" subtitle="Used to personalise your calorie, water and strength targets." />
      <Field label="Your name" placeholder="e.g. Ahmed" value={d.name} onChangeText={(t) => set('name', t)} autoFocus maxLength={30} />
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Sex
      </T>
      <View style={{ gap: 10 }}>
        <OptionCard title="Male" emoji="♂️" selected={d.sex === 'male'} onPress={() => set('sex', 'male')} />
        <OptionCard title="Female" emoji="♀️" selected={d.sex === 'female'} onPress={() => set('sex', 'female')} />
      </View>
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Age
      </T>
      <Stepper value={d.age} onChange={(v) => set('age', v)} min={14} max={90} label="years" />
    </View>
  );
}

function Body({ d, set, unit, setUnit }: StepProps & { unit: WeightUnit; setUnit: (u: WeightUnit) => void }) {
  const { feet, inches } = cmToFeetInches(d.heightCm);
  const [weightText, setWeightText] = useState(formatNumber(toDisplayWeight(d.weightKg, unit), 1));
  const onUnit = (u: WeightUnit) => {
    setUnit(u);
    setWeightText(formatNumber(toDisplayWeight(d.weightKg, u), 1));
  };
  return (
    <View>
      <Title title="Your body" subtitle="Height and weight drive BMR, calorie and water targets." />
      <Segmented
        options={[
          { label: 'Metric (kg, cm)', value: 'kg' as WeightUnit },
          { label: 'Imperial (lb, ft)', value: 'lb' as WeightUnit },
        ]}
        value={unit}
        onChange={onUnit}
      />
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Height
      </T>
      {unit === 'kg' ? (
        <Stepper value={Math.round(d.heightCm)} onChange={(v) => set('heightCm', v)} min={120} max={230} label="cm" />
      ) : (
        <View style={{ gap: 10 }}>
          <Stepper value={feet} onChange={(v) => set('heightCm', feetInchesToCm(v, inches))} min={4} max={7} label="feet" />
          <Stepper value={inches} onChange={(v) => set('heightCm', feetInchesToCm(feet, v))} min={0} max={11} label="inches" />
        </View>
      )}
      <Field
        label="Current weight"
        style={{ marginTop: space.lg }}
        keyboardType="decimal-pad"
        value={weightText}
        suffix={unit}
        onChangeText={(t) => {
          setWeightText(t);
          const v = parseDecimal(t);
          const kg = fromDisplayWeight(v, unit);
          if (kg >= 30 && kg <= 300) set('weightKg', kg);
        }}
      />
      <T variant="caption" color={colors.textMuted} style={{ marginTop: 8 }}>
        Tip: weigh yourself in the morning, after the bathroom, before eating.
      </T>
    </View>
  );
}

function Goal({ d, set, unit }: StepProps & { unit: WeightUnit }) {
  const [goalText, setGoalText] = useState(d.goalWeightKg ? formatNumber(toDisplayWeight(d.goalWeightKg, unit), 1) : '');
  return (
    <View>
      <Title title="What's your main goal?" subtitle="We'll set calories and the rate of change to protect your muscle." />
      <View style={{ gap: 10 }}>
        <OptionCard title="Lose fat" detail="Get leaner while keeping muscle" icon="flame" selected={d.goal === 'lose'} onPress={() => set('goal', 'lose')} />
        <OptionCard title="Build muscle" detail="Lean bulk with a small surplus" icon="barbell" selected={d.goal === 'gain'} onPress={() => set('goal', 'gain')} />
        <OptionCard title="Maintain & recomp" detail="Same weight, better body composition" icon="sync" selected={d.goal === 'maintain'} onPress={() => set('goal', 'maintain')} />
      </View>
      {d.goal !== 'maintain' ? (
        <>
          <Field
            label={`Goal weight (optional)`}
            style={{ marginTop: space.lg }}
            keyboardType="decimal-pad"
            placeholder="Leave empty and we'll suggest one"
            value={goalText}
            suffix={unit}
            onChangeText={(t) => {
              setGoalText(t);
              const kg = fromDisplayWeight(parseDecimal(t), unit);
              set('goalWeightKg', kg >= 30 && kg <= 300 ? kg : null);
            }}
          />
          <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
            Pace
          </T>
          <Segmented
            options={[
              { label: 'Relaxed', value: 'slow' as Pace },
              { label: 'Steady', value: 'moderate' as Pace },
              { label: 'Aggressive', value: 'fast' as Pace },
            ]}
            value={d.pace}
            onChange={(v) => set('pace', v)}
          />
          <T variant="caption" color={colors.textMuted} style={{ marginTop: 8 }}>
            {d.goal === 'lose'
              ? d.pace === 'slow'
                ? '~0.5% of bodyweight per week — easiest to sustain, best muscle retention.'
                : d.pace === 'moderate'
                  ? '~0.75% of bodyweight per week — the sweet spot for most people.'
                  : '~1% of bodyweight per week — faster, but harder and riskier for muscle.'
              : 'Slower gains = more muscle, less fat. Rate is tuned to your training experience.'}
          </T>
        </>
      ) : null}
    </View>
  );
}

function Activity({ d, set }: StepProps) {
  const icons: Record<ActivityLevel, React.ComponentProps<typeof Ionicons>['name']> = {
    sedentary: 'desktop-outline',
    light: 'walk-outline',
    moderate: 'bicycle-outline',
    very: 'flame-outline',
    extra: 'construct-outline',
  };
  return (
    <View>
      <Title title="How active are you?" subtitle="Include your training and your daily job / steps." />
      <View style={{ gap: 10 }}>
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
          <OptionCard key={a} title={ACTIVITY_LABELS[a].title} detail={ACTIVITY_LABELS[a].detail} icon={icons[a]} selected={d.activity === a} onPress={() => set('activity', a)} />
        ))}
      </View>
    </View>
  );
}

function Training({ d, set }: StepProps) {
  return (
    <View>
      <Title title="Your training" subtitle="This shapes your split, rep ranges and how fast weights go up." />
      <T variant="overline" color={colors.textMuted} style={{ marginBottom: 8 }}>
        Experience
      </T>
      <View style={{ gap: 10 }}>
        <OptionCard title="Beginner" detail="Less than 1 year of consistent lifting" emoji="🌱" selected={d.experience === 'beginner'} onPress={() => { set('experience', 'beginner'); set('daysPerWeek', recommendedDays('beginner')); }} />
        <OptionCard title="Intermediate" detail="1–3 years, know the main lifts" emoji="💪" selected={d.experience === 'intermediate'} onPress={() => { set('experience', 'intermediate'); set('daysPerWeek', recommendedDays('intermediate')); }} />
        <OptionCard title="Advanced" detail="3+ years, progress has slowed" emoji="🏆" selected={d.experience === 'advanced'} onPress={() => { set('experience', 'advanced'); set('daysPerWeek', recommendedDays('advanced')); }} />
      </View>
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Training focus
      </T>
      <View style={{ gap: 10 }}>
        <OptionCard title="Build muscle" detail="6–12 reps · hypertrophy" icon="body" selected={d.trainingGoal === 'hypertrophy'} onPress={() => set('trainingGoal', 'hypertrophy')} />
        <OptionCard title="Get stronger" detail="3–6 reps on the big lifts" icon="barbell" selected={d.trainingGoal === 'strength'} onPress={() => set('trainingGoal', 'strength')} />
        <OptionCard title="General fitness" detail="Balanced strength & conditioning" icon="heart" selected={d.trainingGoal === 'general'} onPress={() => set('trainingGoal', 'general')} />
        <OptionCard title="Muscular endurance" detail="12–20 reps, short rests" icon="timer" selected={d.trainingGoal === 'endurance'} onPress={() => set('trainingGoal', 'endurance')} />
      </View>
    </View>
  );
}

function Schedule({ d, set }: StepProps) {
  const rec = recommendedDays(d.experience);
  return (
    <View>
      <Title title="Your schedule" subtitle={`We recommend ${rec} days/week for your level.`} />
      <T variant="overline" color={colors.textMuted} style={{ marginBottom: 8 }}>
        Days per week
      </T>
      <Row gap={8}>
        {[2, 3, 4, 5, 6].map((n) => (
          <Tap key={n} onPress={() => set('daysPerWeek', n)} hapticKind="selection" style={{ flex: 1 }}>
            <View style={[styles.dayBox, d.daysPerWeek === n && styles.dayBoxActive]}>
              <T variant="h2" color={d.daysPerWeek === n ? '#fff' : colors.text}>
                {n}
              </T>
              {n === rec ? (
                <T variant="caption" color={d.daysPerWeek === n ? '#fff' : colors.success} style={{ fontSize: 10 }}>
                  ideal
                </T>
              ) : null}
            </View>
          </Tap>
        ))}
      </Row>
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Session length
      </T>
      <Segmented
        options={[
          { label: '30 min', value: 30 },
          { label: '45 min', value: 45 },
          { label: '60 min', value: 60 },
          { label: '90 min', value: 90 },
        ]}
        value={d.sessionMinutes}
        onChange={(v) => set('sessionMinutes', v)}
      />
      <T variant="overline" color={colors.textMuted} style={{ marginTop: space.lg, marginBottom: 8 }}>
        Equipment
      </T>
      <View style={{ gap: 10 }}>
        {(Object.keys(ACCESS_LABEL) as EquipmentAccess[]).map((k) => (
          <OptionCard key={k} title={ACCESS_LABEL[k].title} detail={ACCESS_LABEL[k].detail} icon={k === 'gym' ? 'business' : k === 'home' ? 'home' : 'body'} selected={d.equipment === k} onPress={() => set('equipment', k)} />
        ))}
      </View>
    </View>
  );
}

function Plan({ profile, unit }: { profile: Profile; unit: WeightUnit }) {
  const report = useMemo(
    () => buildCoachReport({ profile, weighIns: [], workouts: [], lookup: (id) => EXERCISE_MAP[id], unit }),
    [profile, unit],
  );
  const program = useMemo(
    () => generateProgram({ daysPerWeek: profile.daysPerWeek, experience: profile.experience, trainingGoal: profile.trainingGoal, equipment: profile.equipment, maxExercises: exercisesForMinutes(profile.sessionMinutes) }),
    [profile],
  );
  const fw = (kg: number) => `${formatNumber(toDisplayWeight(kg, unit), 1)} ${unit}`;
  const goalDate = report.projection.goalDate ? parseDayKey(report.projection.goalDate) : null;
  return (
    <View>
      <Title title={`Your plan${profile.name ? `, ${profile.name}` : ''} 🎯`} subtitle="Built from sports-science formulas. It adapts as you log." />
      <Card gradient={gradients.hero}>
        <T variant="overline" color={colors.primaryText}>
          Daily target
        </T>
        <Row align="flex-end" gap={6} style={{ marginTop: 4 }}>
          <T variant="display">{formatNumber(report.target.calories, 0)}</T>
          <T variant="bodyMedium" color={colors.textDim} style={{ marginBottom: 6 }}>
            kcal
          </T>
        </Row>
        <Row gap={8} style={{ marginTop: space.sm }}>
          <Stat label="Protein" value={`${report.macros.proteinG}`} unit="g" color={colors.orange} />
          <Stat label="Carbs" value={`${report.macros.carbsG}`} unit="g" color={colors.accent} />
          <Stat label="Fat" value={`${report.macros.fatG}`} unit="g" color={colors.pink} />
        </Row>
        {report.target.warnings.map((w) => (
          <T key={w} variant="caption" color={colors.warning} style={{ marginTop: 8 }}>
            ⚠️ {w}
          </T>
        ))}
      </Card>
      <Row gap={10} style={{ marginTop: space.sm }}>
        <Stat label="Water" value={formatWater(report.waterGoalMl, unit)} unit="/day" color={colors.water} icon="water" />
        <Stat label="BMI" value={formatNumber(report.bmi.value, 1)} icon="body" />
        <Stat label="TDEE" value={formatNumber(report.tdee, 0)} unit="kcal" icon="flame" />
      </Row>
      {report.goalWeightKg != null && profile.goal !== 'maintain' ? (
        <Card style={{ marginTop: space.sm }}>
          <Row gap={12}>
            <View style={[styles.featureIcon, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="flag" size={20} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="h3">
                {fw(report.weightKg)} → {fw(report.goalWeightKg)}
                {report.goalIsSuggested ? ' (suggested)' : ''}
              </T>
              <T variant="small" color={colors.textDim}>
                {goalDate ? `Projected by ${formatLongDate(goalDate)} at ~${fw(Math.abs(report.target.weeklyChangeKg))}/week` : 'Projection needs more than a year at this pace — that is OK, progress is progress.'}
              </T>
            </View>
          </Row>
        </Card>
      ) : null}
      <Card style={{ marginTop: space.sm }}>
        <Row gap={12}>
          <View style={[styles.featureIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="barbell" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="h3">{program.name}</T>
            <T variant="small" color={colors.textDim}>
              {program.description}
            </T>
          </View>
        </Row>
        <View style={{ marginTop: space.sm, gap: 6 }}>
          {program.routines.map((r) => (
            <Row key={r.id} gap={8}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
              <T variant="small" color={colors.text} style={{ flex: 1 }}>
                {r.name}
              </T>
              <T variant="caption" color={colors.textMuted}>
                {r.exercises.length} exercises
              </T>
            </Row>
          ))}
        </View>
      </Card>
      <T variant="caption" color={colors.textMuted} style={{ marginTop: space.md, textAlign: 'center' }}>
        We&apos;ll ask permission to send water & workout reminders.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.md, paddingBottom: space.xl },
  footer: { paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: space.sm },
  logo: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  featureIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayBox: { height: 64, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dayBoxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
