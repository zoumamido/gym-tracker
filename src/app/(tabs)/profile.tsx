import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Share, Switch, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Button, Card, Divider, Field, ListRow, OptionCard, Row, Screen, SectionHeader, Segmented, Stepper, T } from '../../components/ui';
import { ACCESS_LABEL } from '../../data/exercises';
import { ACTIVITY_LABELS, ActivityLevel } from '../../lib/body';
import type { BodyGoal, Experience, Pace } from '../../lib/nutrition';
import { exercisesForMinutes, generateProgram } from '../../lib/program';
import type { EquipmentAccess, Profile, TrainingGoal } from '../../lib/types';
import { formatHeight, formatNumber, parseDecimal, WeightUnit } from '../../lib/units';
import { hasPermission, requestPermission, sendTestNotification } from '../../services/notifications';
import { useWaterGoal } from '../../store/selectors';
import { exportData, useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { colors, gradients, space } from '../../theme';

type EditKey = 'name' | 'age' | 'height' | 'goal' | 'goalWeight' | 'activity' | 'bodyFat' | 'experience' | 'focus' | 'days' | 'session' | 'equipment' | 'waterGoal' | 'waterWindow' | 'workoutTime';

const GOAL_LABEL: Record<BodyGoal, string> = { lose: 'Lose fat', maintain: 'Maintain & recomp', gain: 'Build muscle' };
const FOCUS_LABEL: Record<TrainingGoal, string> = { hypertrophy: 'Build muscle', strength: 'Get stronger', general: 'General fitness', endurance: 'Muscular endurance' };
const EXP_LABEL: Record<Experience, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const PACE_LABEL: Record<Pace, string> = { slow: 'Relaxed', moderate: 'Steady', fast: 'Aggressive' };
const pad = (n: number) => String(n).padStart(2, '0');

export default function ProfileScreen() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const { updateProfile, updateSettings, setProgram, resetAll } = useStore.getState();
  const waterGoal = useWaterGoal();
  const u = useUnits();
  const [edit, setEdit] = useState<EditKey | null>(null);
  const [trainingChanged, setTrainingChanged] = useState(false);
  if (!profile) return null;

  const patchTraining = (p: Partial<Profile>) => {
    updateProfile(p);
    setTrainingChanged(true);
  };

  const applyProgram = () => {
    const p = useStore.getState().profile!;
    Alert.alert('Rebuild your program?', 'Generates new routines and a schedule from your updated training settings. History is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Rebuild',
        onPress: () => {
          setProgram(generateProgram({ daysPerWeek: p.daysPerWeek, experience: p.experience, trainingGoal: p.trainingGoal, equipment: p.equipment, maxExercises: exercisesForMinutes(p.sessionMinutes) }));
          setTrainingChanged(false);
        },
      },
    ]);
  };

  const exportJson = async () => {
    try {
      await Share.share({ title: 'Gym Tracker backup', message: JSON.stringify(exportData()) });
    } catch {
      Alert.alert('Export failed');
    }
  };

  const reset = () =>
    Alert.alert('Reset everything?', 'Deletes your profile, workouts, weigh-ins and water logs from this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        // The tabs layout redirects to onboarding once `onboarded` is false.
        onPress: () => resetAll(),
      },
    ]);

  return (
    <Screen>
      <LinearGradient colors={gradients.hero} style={{ borderRadius: 22, padding: space.lg, marginTop: space.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
        <Row gap={14}>
          <LinearGradient colors={gradients.primary} style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="title" color="#fff">
              {(profile.name || '?').slice(0, 1).toUpperCase()}
            </T>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <T variant="h2">{profile.name || 'Athlete'}</T>
            <T variant="small" color={colors.textDim}>
              {profile.age} y · {formatHeight(profile.heightCm, u.unit)} · {GOAL_LABEL[profile.goal]}
            </T>
          </View>
        </Row>
      </LinearGradient>

      <SectionHeader title="Body & goals" />
      <Card padded={false} style={{ paddingHorizontal: space.md }}>
        <ListRow icon="person-outline" title="Name" detail={profile.name || '—'} onPress={() => setEdit('name')} />
        <Divider />
        <ListRow icon="calendar-outline" title="Age" detail={`${profile.age} years`} onPress={() => setEdit('age')} />
        <Divider />
        <ListRow icon="resize-outline" title="Height" detail={formatHeight(profile.heightCm, u.unit)} onPress={() => setEdit('height')} />
        <Divider />
        <ListRow icon="flag-outline" iconColor={colors.success} title="Goal" detail={`${GOAL_LABEL[profile.goal]}${profile.goal !== 'maintain' ? ` · ${PACE_LABEL[profile.pace]}` : ''}`} onPress={() => setEdit('goal')} />
        <Divider />
        <ListRow icon="trophy-outline" iconColor={colors.success} title="Goal weight" detail={profile.goalWeightKg ? u.w(profile.goalWeightKg) : 'Auto (suggested)'} onPress={() => setEdit('goalWeight')} />
        <Divider />
        <ListRow icon="walk-outline" iconColor={colors.orange} title="Activity level" detail={ACTIVITY_LABELS[profile.activity].title} onPress={() => setEdit('activity')} />
        <Divider />
        <ListRow icon="body-outline" iconColor={colors.orange} title="Body fat %" detail={profile.bodyFatPct ? `${formatNumber(profile.bodyFatPct, 1)}%` : 'Not set (estimated)'} onPress={() => setEdit('bodyFat')} />
        <Divider />
        <ListRow icon="scale-outline" iconColor={colors.orange} title="Log weight & measurements" onPress={() => router.push('/log-weight')} />
      </Card>

      <SectionHeader title="Training" />
      <Card padded={false} style={{ paddingHorizontal: space.md }}>
        <ListRow icon="school-outline" title="Experience" detail={EXP_LABEL[profile.experience]} onPress={() => setEdit('experience')} />
        <Divider />
        <ListRow icon="locate-outline" title="Focus" detail={FOCUS_LABEL[profile.trainingGoal]} onPress={() => setEdit('focus')} />
        <Divider />
        <ListRow icon="calendar-number-outline" title="Days per week" detail={`${profile.daysPerWeek} days`} onPress={() => setEdit('days')} />
        <Divider />
        <ListRow icon="time-outline" title="Session length" detail={`${profile.sessionMinutes} min`} onPress={() => setEdit('session')} />
        <Divider />
        <ListRow icon="business-outline" title="Equipment" detail={ACCESS_LABEL[profile.equipment].title} onPress={() => setEdit('equipment')} />
      </Card>
      {trainingChanged ? <Button title="Apply changes to my program" icon="refresh" onPress={applyProgram} style={{ marginTop: space.sm }} /> : null}

      <SectionHeader title="Reminders" />
      <PermissionHint />
      <Card padded={false} style={{ paddingHorizontal: space.md }}>
        <ListRow
          icon="water-outline"
          iconColor={colors.water}
          title="Water reminders"
          detail={settings.water.remindersEnabled ? `Every ${settings.water.intervalMin} min, ${pad(settings.water.startHour)}:00–${pad(settings.water.endHour)}:00` : 'Off'}
          right={<Switch value={settings.water.remindersEnabled} onValueChange={(v) => updateSettings({ water: { ...settings.water, remindersEnabled: v } })} trackColor={{ true: colors.primary, false: colors.cardAlt }} thumbColor="#fff" />}
        />
        <Divider />
        <ListRow icon="options-outline" iconColor={colors.water} title="Reminder schedule" detail="Start, end and frequency" onPress={() => setEdit('waterWindow')} />
        <Divider />
        <ListRow icon="beaker-outline" iconColor={colors.water} title="Daily water goal" detail={`${u.water(waterGoal)}${settings.water.goalOverrideMl ? ' (custom)' : ' (auto)'}`} onPress={() => setEdit('waterGoal')} />
        <Divider />
        <ListRow
          icon="barbell-outline"
          title="Workout reminder"
          detail={settings.workoutReminder.enabled ? `Training days at ${pad(settings.workoutReminder.hour)}:${pad(settings.workoutReminder.minute)}` : 'Off'}
          right={<Switch value={settings.workoutReminder.enabled} onValueChange={(v) => updateSettings({ workoutReminder: { ...settings.workoutReminder, enabled: v } })} trackColor={{ true: colors.primary, false: colors.cardAlt }} thumbColor="#fff" />}
        />
        <Divider />
        <ListRow icon="alarm-outline" title="Workout reminder time" onPress={() => setEdit('workoutTime')} />
        <Divider />
        <ListRow
          icon="notifications-outline"
          iconColor={colors.success}
          title="Send a test notification"
          detail="Arrives in 5 seconds"
          onPress={async () => {
            const ok = await sendTestNotification();
            if (!ok) Alert.alert('Notifications are off', "Enable notifications for Gym Tracker in your phone's settings to get reminders.");
          }}
        />
      </Card>

      <SectionHeader title="Preferences" />
      <Card padded={false} style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <T variant="overline" color={colors.textMuted} style={{ marginTop: 6, marginBottom: 8 }}>
          Units
        </T>
        <Segmented
          options={[
            { label: 'kg · cm · L', value: 'kg' as WeightUnit },
            { label: 'lb · ft · oz', value: 'lb' as WeightUnit },
          ]}
          value={settings.unit}
          onChange={(unit) => updateSettings({ unit })}
        />
        <ListRow
          icon="timer-outline"
          title="Auto-start rest timer"
          detail="When you tick a set"
          right={<Switch value={settings.restTimer.autoStart} onValueChange={(v) => updateSettings({ restTimer: { ...settings.restTimer, autoStart: v } })} trackColor={{ true: colors.primary, false: colors.cardAlt }} thumbColor="#fff" />}
        />
        <Divider />
        <ListRow
          icon="notifications-circle-outline"
          title="Rest timer notification"
          detail="Alert when rest is over (screen off)"
          right={<Switch value={settings.restTimer.notify} onValueChange={(v) => updateSettings({ restTimer: { ...settings.restTimer, notify: v } })} trackColor={{ true: colors.primary, false: colors.cardAlt }} thumbColor="#fff" />}
        />
        <Divider />
        <ListRow
          icon="phone-portrait-outline"
          title="Haptic feedback"
          right={<Switch value={settings.haptics} onValueChange={(v) => updateSettings({ haptics: v })} trackColor={{ true: colors.primary, false: colors.cardAlt }} thumbColor="#fff" />}
        />
      </Card>

      <SectionHeader title="Data" />
      <Card padded={false} style={{ paddingHorizontal: space.md }}>
        <ListRow icon="calculator-outline" iconColor={colors.accent} title="Calculators" detail="1RM, plates, warm-up, body fat" onPress={() => router.push('/tools')} />
        <Divider />
        <ListRow icon="share-outline" iconColor={colors.accent} title="Export backup" detail="Share all your data as JSON" onPress={exportJson} />
        <Divider />
        <ListRow icon="trash-outline" iconColor={colors.danger} title="Reset all data" onPress={reset} />
      </Card>
      <T variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: space.lg }}>
        Gym Tracker 1.0 · All data stays on your device
      </T>

      <EditSheet
        k={edit}
        onClose={() => setEdit(null)}
        profile={profile}
        unit={u.unit}
        onProfile={updateProfile}
        onTraining={patchTraining}
      />
    </Screen>
  );
}

/** Shown when notification permission is blocked, so reminder toggles don't silently do nothing. */
function PermissionHint() {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => hasPermission().then((g) => alive && setGranted(g));
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  if (granted !== false) return null;
  return (
    <Card style={{ marginBottom: space.sm, borderColor: colors.warning + '66' }}>
      <Row gap={10} align="flex-start">
        <Ionicons name="notifications-off" size={20} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <T variant="h3">Notifications are blocked</T>
          <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
            Water, workout and rest-timer reminders can&apos;t reach you until you allow them.
          </T>
          <Button
            title="Allow notifications"
            size="sm"
            full={false}
            style={{ marginTop: space.sm }}
            onPress={async () => {
              const ok = await requestPermission();
              setGranted(ok);
              if (!ok) Linking.openSettings();
            }}
          />
        </View>
      </Row>
    </Card>
  );
}

// Each text editor owns its state, seeded from the current value, so editors never leak input into each other.

function NameEditor({ initial, onSave, onClose }: { initial: string; onSave: (v: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <>
      <Field value={text} onChangeText={setText} autoFocus maxLength={30} />
      <Button
        title="Save"
        disabled={!text.trim()}
        style={{ marginTop: space.md }}
        onPress={() => {
          onSave(text.trim());
          onClose();
        }}
      />
    </>
  );
}

function GoalWeightEditor({ initial, onSave, onClose }: { initial: number | null; onSave: (kg: number | null) => void; onClose: () => void }) {
  const u = useUnits();
  const [text, setText] = useState(initial ? formatNumber(u.toDisplay(initial), 1) : '');
  const kg = u.fromDisplay(parseDecimal(text));
  const valid = text.trim() === '' || (kg >= 30 && kg <= 300);
  return (
    <>
      <Field keyboardType="decimal-pad" suffix={u.unit} placeholder="Empty = auto" value={text} onChangeText={setText} autoFocus />
      {!valid ? (
        <T variant="caption" color={colors.danger} style={{ marginTop: 6 }}>
          Enter a weight between {u.w(30, 0)} and {u.w(300, 0)}.
        </T>
      ) : null}
      <Row gap={10} style={{ marginTop: space.md }}>
        <Button
          title="Use suggestion"
          variant="secondary"
          full={false}
          style={{ flex: 1 }}
          onPress={() => {
            onSave(null);
            onClose();
          }}
        />
        <Button
          title="Save"
          full={false}
          style={{ flex: 1 }}
          disabled={!valid}
          onPress={() => {
            onSave(text.trim() === '' ? null : kg);
            onClose();
          }}
        />
      </Row>
    </>
  );
}

function BodyFatEditor({ initial, onSave, onClose }: { initial: number | null; onSave: (v: number | null) => void; onClose: () => void }) {
  const [text, setText] = useState(initial ? String(initial) : '');
  const v = parseDecimal(text);
  const valid = text.trim() === '' || (v >= 3 && v <= 60);
  return (
    <>
      <T variant="small" color={colors.textDim} style={{ marginBottom: space.sm }}>
        From a DEXA scan, smart scale or calipers. Leave empty to estimate from your measurements.
      </T>
      <Field keyboardType="decimal-pad" suffix="%" value={text} onChangeText={setText} autoFocus />
      {!valid ? (
        <T variant="caption" color={colors.danger} style={{ marginTop: 6 }}>
          Enter a value between 3 and 60%.
        </T>
      ) : null}
      <Button
        title="Save"
        disabled={!valid}
        style={{ marginTop: space.md }}
        onPress={() => {
          onSave(text.trim() === '' ? null : v);
          onClose();
        }}
      />
    </>
  );
}

function EditSheet({ k, onClose, profile, unit, onProfile, onTraining }: { k: EditKey | null; onClose: () => void; profile: Profile; unit: WeightUnit; onProfile: (p: Partial<Profile>) => void; onTraining: (p: Partial<Profile>) => void }) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const waterGoal = useWaterGoal();
  const u = useUnits();

  const titles: Record<EditKey, string> = {
    name: 'Name',
    age: 'Age',
    height: 'Height',
    goal: 'Goal',
    goalWeight: 'Goal weight',
    activity: 'Activity level',
    bodyFat: 'Body fat %',
    experience: 'Experience',
    focus: 'Training focus',
    days: 'Days per week',
    session: 'Session length',
    equipment: 'Equipment',
    waterGoal: 'Daily water goal',
    waterWindow: 'Water reminders',
    workoutTime: 'Workout reminder time',
  };

  const content = () => {
    switch (k) {
      case 'name':
        return <NameEditor initial={profile.name} onSave={(name) => onProfile({ name })} onClose={onClose} />;
      case 'age':
        return <Stepper value={profile.age} onChange={(v) => onProfile({ age: v })} min={14} max={90} label="years" />;
      case 'height':
        return <Stepper value={Math.round(profile.heightCm)} onChange={(v) => onProfile({ heightCm: v })} min={120} max={230} label={unit === 'kg' ? 'cm' : `cm · ${formatHeight(profile.heightCm, 'lb')}`} />;
      case 'goal':
        return (
          <View style={{ gap: 10 }}>
            {(['lose', 'gain', 'maintain'] as BodyGoal[]).map((g) => (
              <OptionCard key={g} title={GOAL_LABEL[g]} selected={profile.goal === g} onPress={() => onProfile({ goal: g })} />
            ))}
            {profile.goal !== 'maintain' ? (
              <>
                <T variant="overline" color={colors.textMuted} style={{ marginTop: 6 }}>
                  Pace
                </T>
                <Segmented options={(['slow', 'moderate', 'fast'] as Pace[]).map((p) => ({ label: PACE_LABEL[p], value: p }))} value={profile.pace} onChange={(pace) => onProfile({ pace })} />
              </>
            ) : null}
          </View>
        );
      case 'goalWeight':
        return <GoalWeightEditor initial={profile.goalWeightKg} onSave={(goalWeightKg) => onProfile({ goalWeightKg })} onClose={onClose} />;
      case 'activity':
        return (
          <View style={{ gap: 8 }}>
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
              <OptionCard key={a} title={ACTIVITY_LABELS[a].title} detail={ACTIVITY_LABELS[a].detail} selected={profile.activity === a} onPress={() => onProfile({ activity: a })} />
            ))}
          </View>
        );
      case 'bodyFat':
        return <BodyFatEditor initial={profile.bodyFatPct} onSave={(bodyFatPct) => onProfile({ bodyFatPct })} onClose={onClose} />;
      case 'experience':
        return (
          <View style={{ gap: 10 }}>
            {(['beginner', 'intermediate', 'advanced'] as Experience[]).map((e) => (
              <OptionCard key={e} title={EXP_LABEL[e]} selected={profile.experience === e} onPress={() => onTraining({ experience: e })} />
            ))}
          </View>
        );
      case 'focus':
        return (
          <View style={{ gap: 10 }}>
            {(Object.keys(FOCUS_LABEL) as TrainingGoal[]).map((g) => (
              <OptionCard key={g} title={FOCUS_LABEL[g]} selected={profile.trainingGoal === g} onPress={() => onTraining({ trainingGoal: g })} />
            ))}
          </View>
        );
      case 'days':
        return <Stepper value={profile.daysPerWeek} onChange={(v) => onTraining({ daysPerWeek: v })} min={2} max={6} label="days per week" />;
      case 'session':
        return <Segmented options={[30, 45, 60, 90].map((m) => ({ label: `${m} min`, value: m }))} value={profile.sessionMinutes} onChange={(m) => onTraining({ sessionMinutes: m })} />;
      case 'equipment':
        return (
          <View style={{ gap: 10 }}>
            {(Object.keys(ACCESS_LABEL) as EquipmentAccess[]).map((e) => (
              <OptionCard key={e} title={ACCESS_LABEL[e].title} detail={ACCESS_LABEL[e].detail} selected={profile.equipment === e} onPress={() => onTraining({ equipment: e })} />
            ))}
          </View>
        );
      case 'waterGoal':
        return (
          <>
            <Stepper value={waterGoal} onChange={(v) => updateSettings({ water: { ...settings.water, goalOverrideMl: v } })} min={1000} max={6000} step={250} format={(v) => u.water(v)} label="per day" />
            <Button title="Use automatic goal" variant="secondary" style={{ marginTop: space.md }} onPress={() => { updateSettings({ water: { ...settings.water, goalOverrideMl: null } }); onClose(); }} />
          </>
        );
      case 'waterWindow':
        return (
          <View style={{ gap: 10 }}>
            <Stepper value={settings.water.startHour} onChange={(v) => updateSettings({ water: { ...settings.water, startHour: Math.min(v, settings.water.endHour - 1) } })} min={4} max={14} format={(v) => `${pad(v)}:00`} label="first reminder" />
            <Stepper value={settings.water.endHour} onChange={(v) => updateSettings({ water: { ...settings.water, endHour: Math.max(v, settings.water.startHour + 1) } })} min={15} max={23} format={(v) => `${pad(v)}:00`} label="last reminder" />
            <T variant="overline" color={colors.textMuted} style={{ marginTop: 6 }}>
              Every
            </T>
            <Segmented options={[60, 90, 120, 180].map((m) => ({ label: m < 120 ? `${m}m` : `${m / 60}h`, value: m }))} value={settings.water.intervalMin} onChange={(m) => updateSettings({ water: { ...settings.water, intervalMin: m } })} />
          </View>
        );
      case 'workoutTime':
        return (
          <View style={{ gap: 10 }}>
            <Stepper value={settings.workoutReminder.hour} onChange={(v) => updateSettings({ workoutReminder: { ...settings.workoutReminder, hour: v } })} min={0} max={23} format={(v) => `${pad(v)}:${pad(settings.workoutReminder.minute)}`} label="hour" />
            <Segmented options={[0, 15, 30, 45].map((m) => ({ label: `:${pad(m)}`, value: m }))} value={settings.workoutReminder.minute} onChange={(m) => updateSettings({ workoutReminder: { ...settings.workoutReminder, minute: m } })} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Sheet visible={k != null} onClose={onClose} title={k ? titles[k] : ''}>
      {content()}
      {k && !['name', 'goalWeight', 'bodyFat', 'waterGoal'].includes(k) ? <Button title="Done" variant="secondary" style={{ marginTop: space.md }} onPress={onClose} /> : null}
      <Row gap={6} style={{ marginTop: 10, justifyContent: 'center' }}>
        <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
        <T variant="caption" color={colors.textMuted}>
          Targets update instantly
        </T>
      </Row>
    </Sheet>
  );
}
