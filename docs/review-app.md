# App-layer review (store / services / components / routes)

I checked every zustand selector for the "new object/array on every call" pattern (the cause of the zustand 5 "getSnapshot should be cached" loop). None of them have it: they return primitives or references already in the store, and `index.tsx:233` correctly uses the module-level `NO_ENTRIES`. Hooks are never called conditionally; every early return comes after the last hook. The expo-notifications trigger shapes (`DATE`/`TIME_INTERVAL` + `channelId`) and handler fields are correct for SDK 57.

Findings, most severe first:

1. **`app/(tabs)/profile.tsx:227` (+253, 287, 316): EditSheet `text` state is shared by all editors and never reset. This corrupts the profile.**
   Scenario: in *Body fat %*, type `35` and Save. Then open *Name* and tap Save without typing, and the name becomes "35". Or open *Goal weight* and tap Save, and `goalWeightKg` becomes 35 kg. If the leftover text is "Bob", Goal weight shows "Enter a valid weight" even though the field (defaultValue) looks fine.
   Fix: reset when the editor changes: `useEffect(() => setText(''), [k]);`. Better: seed it from the current value and render the field controlled (`value={text}`).

2. **`components/workout.tsx:229-236`: `pickRpe` passes 5 buttons to `Alert.alert`. Android shows at most 3.**
   RN keeps only `buttons.slice(0,3)`, so Android users get RPE 10/9/8 only. They can't pick RPE 7 and can't **Clear** an RPE.
   Fix: use the existing `ActionSheet` (an RPE 6–10 list plus Clear) instead of Alert.

3. **`store/useStore.ts:236-237` + `components/workout.tsx:184`: "Replace exercise" keeps the sets already marked done, along with their weights.**
   Scenario: log 3×100 kg on Bench, then replace Bench with Cable Fly. The finished workout stores 3×100 kg *Cable Fly*. That corrupts history, e1RM charts, PRs and progression suggestions, and Bench loses the session.
   Fix: if any set is done, keep the original entry and insert a new `WorkoutExercise` after it. Otherwise only allow replacing when nothing is done, or reset all sets.

4. **`app/workout.tsx:94-116`, `app/routine/[id].tsx:379-380`: names and notes are saved only in `onEndEditing`, so edits are lost.**
   On Android, tapping a Pressable (Finish, back chevron) doesn't blur the input. Scenario: type workout notes, tap **Finish** then **Finish**. `finishWorkout()` reads the old `notes`, the screen unmounts, and `onEndEditing` never fires (if it did, `activeWorkout` is already null). The same happens when you rename a routine and tap back.
   Fix: keep local state with `onChangeText` and commit it in `doFinish`/back, or call `setWorkoutNotes` from `onChangeText` (debounced).

5. **`services/useReminderSync.ts:41` + `app/(tabs)/profile.tsx:72-73`: "Reset all data" leaves every reminder scheduled.**
   After `resetAll()`, `onboarded` is false and the sync returns early (`if (!s.onboarded) return`). The next 7 days of water and workout notifications (~77) keep firing for a wiped profile. A pending rest notification also survives.
   Fix: when `!s.onboarded`, call `applyReminderPlan([])` and `cancelRestDone()`. Also, `resetAll()` makes `(tabs)/_layout.tsx:28` render `<Redirect href="/onboarding">` while `router.replace('/onboarding')` runs in the same tick, so it navigates twice. Drop the explicit replace and let the guard handle it.

6. **`app/summary/[id].tsx:43`: `router.replace('/')` on a fresh summary stacks a second `(tabs)` navigator.**
   The stack is `[(tabs), summary]`. REPLACE creates a new `(tabs)` route with a new key, giving `[(tabs), (tabs)']`. The old tabs tree stays mounted (double subscriptions), and Android back from Today shows another Today instead of exiting.
   Fix: `router.dismissTo('/')` (or `router.back()`, since summary replaced the modal).

7. **`services/notifications.ts:83-89` (plan from `lib/reminders.ts`, 7 days): the iOS limit of 64 pending notifications is exceeded with default settings.**
   Defaults (8–22h every 90 min) give about 10 water reminders a day × 7, plus up to 7 workout reminders, so roughly 77. A 60-min interval gives about 112. iOS silently keeps only the 64 soonest, so later days' **workout reminders are dropped**. Each sync also re-schedules the missing ones, because `getAllScheduledNotificationsAsync` never returns them.
   Fix: plan 2–3 days of water (`days`), schedule workout reminders first, and cap the total at about 60.

8. **`services/notifications.ts:18-23` + `app/workout.tsx:120`: when rest ends while the app is open outside the workout screen, nothing alerts the user.**
   The handler hides the banner and sound for `rest-timer` whenever the app is foregrounded, and `RestTimerBar` (the only in-app cue) is mounted only in `workout.tsx`. Scenario: minimise the workout, browse Progress, and the rest ends silently.
   Fix: suppress only while the workout route is focused (e.g. a module flag set in `useFocusEffect`), or mount the bar or a haptic watcher in the root layout.

9. **Keyboard covers inputs.**
   - (a) `workout.tsx:91`, `onboarding.tsx:107`, `log-weight.tsx:56` use `behavior={ios ? 'padding' : undefined}`. With SDK 57 / RN 0.86 the app is always edge-to-edge, so Android no longer resizes the window (adjustResize). The notes field, the lower set rows and the log-weight Save button end up under the keyboard. Use `behavior="padding"` on both platforms, or `react-native-keyboard-controller`.
   - (b) On iOS, `workout.tsx:91` sits under the safe-area top inset plus the header but sets no `keyboardVerticalOffset`, so it under-pads by about 100pt.
   - (c) `components/Sheet.tsx:20`: the `Modal` sheet has no keyboard handling. The `autoFocus` fields in Profile (name, goal weight, body fat) and "New exercise" (`exercises.tsx:165`) put their Save/Create button behind the keyboard, at least on iOS. Wrap the sheet in a `KeyboardAvoidingView behavior="padding"`.

10. **`store/useStore.ts:340-343` (+ `components/workout.tsx:332-351`): every keystroke rewrites the whole persisted store.**
    Each `updateSet` makes `persist` run `JSON.stringify` on all of `workouts`, `water` and the rest, then write to AsyncStorage. With months of history that is hundreds of KB per keystroke on the JS thread. Every keystroke also re-renders `WorkoutScreen`, every `ExerciseCard` and every `SetRow` (nothing is memoized, and the callbacks are inline).
    Fix: a debounced/throttled storage wrapper, or keep the in-progress text local to `SetRow` and commit on blur/complete. Add `React.memo(ExerciseCard)` with stable callbacks.

11. **`components/workout.tsx:270, 332-336`: the weight field is reformatted while typing.**
    The `useEffect` on `set.weightKg` rewrites `wText`. Scenario: the field shows `2.5`, you backspace to `2.`, `weightKg` changes 2.5→2, and the text snaps to `2`. Your next digit then makes `27` instead of `2.7`. Typing `82,5` also flips to `82.5` mid-edit.
    Fix: skip the sync while focused, or only sync when `parseDecimal(wText)` no longer matches the new value.

12. **`app/(tabs)/index.tsx:28` (+ the whole Today tab): the screen is stale after midnight.**
    The `doneToday` memo depends only on `[workouts]` (the `now` dependency is suppressed by an eslint-disable). The tab never re-renders at a day change, so the badge still says "Completed" and yesterday's routine and water remain until an unrelated store change. `ActivityTab` (`progress.tsx:302-312`) has the same problem.
    Fix: a `useToday()` hook driven by AppState and a midnight timeout, with the day key in the deps.

13. **`app/onboarding.tsx:65-66, 92-103`: onboarding back and double-tap problems.**
    Onboarding is reached via `<Redirect>` (a replace), so the Android hardware back button exits the app from any step and the draft is lost. Add a `BackHandler` that calls `back()` when `idx > 0`. Separately, "Start my journey" can be tapped again while the permission dialog is pending, which calls `completeOnboarding` and `router.replace` twice. Guard it with a `submitting` flag.

14. **`index.tsx:30-33`, `train.tsx:33`, `Tap` everywhere: double navigation.**
    A fast double tap on Start/Resume runs `router.push('/workout')` twice and stacks two workout modals. Debounce in `Tap`, or use `router.navigate`.

15. **`services/useReminderSync.ts:9-27`: reminder UX gaps.**
    - The workout reminder fires at 17:00 even if the user already trained that day. `workouts` isn't in the plan input or the subscription, so skip today when a finished workout exists.
    - If notification permission was denied at onboarding, the reminder switches still show "on" and nothing is scheduled (`applyReminderPlan` returns early). Show a hint when `hasPermission()` is false.

16. **Unit display mistakes for lb users.**
    - `progress.tsx:124` hardcodes "±1–2 kg".
    - `onboarding.tsx:447` shows water in L/ml instead of `formatWater` (oz).
    - `log-weight.tsx:85-92` has measurements only in cm.
    - `components/workout.tsx:69-70`: non-barbell warm-ups are rounded in kg (`toFixed(1)`), so the input shows values like `24.91` lb. Round with `displayLoad` in the user's unit.
    - `log-weight.tsx:73`: `kg - current === 0` is a float comparison, so re-entering the same lb value shows "+0 lb vs last entry". Compare the rounded display values instead.
    - `summary/[id].tsx:319`: the e1RM is shown without a unit.

17. **Android/iOS Alert copy.**
    - `train.tsx:33`: the single-button "Workout in progress" alert can't be dismissed on Android (not cancelable), which forces "Open it". Add a Cancel button.
    - `profile.tsx:159`: the text says "Android settings" on iOS too.

18. **`train.tsx:60-64`: an empty routine is created before editing.**
    "+ New" calls `upsertRoutine` with an empty routine before the editor opens. Backing out leaves orphan "New routine" entries with 0 exercises, which can be scheduled and started as an empty workout. Create it on first exercise add, or delete it on leave when it is still empty.

19. **Accessibility gaps.**
    - `ui.tsx:88-109`: `Tap` and `Button` set no `accessibilityRole="button"`, and disabled state isn't exposed (`accessibilityState={{ disabled }}`).
    - The set ✓ toggle (`workout.tsx:360`) and the set inputs have no labels; it should read e.g. "Complete set 2".
    - The `IconButton`s in `routine/[id].tsx:41-76`, `summary/[id].tsx:217-218`, `exercise/[id].tsx:45` and `tools.tsx:33` have no labels.
    - The `Mini` steppers (`routine/[id].tsx:103-111`) have 22×22 touch targets; add `hitSlop` or make them ≥44.

20. **`store/useStore.ts:337`: `importData` (not wired yet) is unsafe.**
    It shallow-merges `settings` (so a backup missing `settings.water` crashes `s.settings.water.goalOverrideMl`), skips validation, and restores `restTimer`. Reuse the `merge` logic from line 357 and validate the shape before wiring it to UI.
