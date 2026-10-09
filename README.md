# Gym Tracker

A personal gym coach for Android and iOS (Expo SDK 57, React Native, TypeScript). It logs workouts, tells you what weight to lift next, predicts your bodyweight, and reminds you to drink water and to train.

## Run it on your Android phone

1. Install **Expo Go** from the Play Store.
2. In this folder, run:
   ```bash
   npm install      # first time only
   npx expo start
   ```
3. Scan the QR code with Expo Go. Your phone and PC need to be on the same Wi-Fi. If they're on different networks, use `npx expo start --tunnel`.

Notes:
- Code changes reload on the phone instantly.
- Local reminders (water, workouts, rest timer) work in Expo Go.
- To install a standalone app instead, run `npx eas-cli@latest build -p android --profile preview` (needs a free Expo account) and install the APK it produces.

## Features

| Area | What it does |
|---|---|
| **Onboarding** | Collects your body data, goal, activity level, experience, schedule and equipment, then generates your plan |
| **Today** | Today's workout, week strip, water ring with quick-add, calorie/macro targets, top coach actions |
| **Workout logger** | Strong/Hevy-style set table: previous values, one-tap ✓ (fills in the suggested values), auto rest timer with notification, warm-up generator, set types (W/D/F), RPE, PR trophies, replace or reorder exercises |
| **Progressive overload** | Double progression: suggests the next weight and reps, deloads after 3 stalled sessions, snaps loads to real plate and dumbbell steps |
| **Programs** | Auto-generated Full Body / Upper-Lower / PPL from days per week, goal, experience and equipment. Editable routines and weekly schedule |
| **Progress** | Weight trend (Hacker's Diet EMA) with forecast and goal line, e1RM charts, strength level against standards, 16-week consistency heatmap, weekly volume, sets per muscle against MEV/MAV/MRV landmarks, water history |
| **Coach** | A prioritised "what to do now" plan. BMI, body fat (US Navy / Deurenberg), FFMI, ideal weight, BMR/TDEE, calorie target with safety floors, macros, weight forecast to your goal date, training guidance, heart-rate zones |
| **Reminders** | Water every N minutes in your waking window (shows your progress, stops once you hit the goal), training-day reminders (skipped if you already trained) |
| **Tools** | 1RM calculator with RPE, plate calculator, warm-up calculator |
| **Settings** | kg/lb, reminder schedule, rest-timer options, haptics, JSON backup export, reset |

Everything is stored on the device. Nothing is uploaded.

## The science

Every formula and constant comes from a source listed in [docs/gym-science.md](docs/gym-science.md): Mifflin-St Jeor, Katch-McArdle, US Navy body fat, the ISSN protein position stand, Schoenfeld's volume dose-response, Garthe's loss rates, the Tuchscherer RPE chart, Hall's energy model, Strength Level standards, and others.

## Project layout

```
src/
  app/          screens (expo-router): (tabs)/, workout, summary/[id], exercise/[id], routine/[id], exercises, log-weight, tools, onboarding
  components/   UI kit (ui.tsx), charts (SVG), workout logger, bottom sheets
  lib/          pure domain logic, fully unit-tested: body, nutrition, projection, strength, progression, program, volume, records, reminders, coach…
  data/         exercise library (75+ exercises), muscles & volume landmarks
  store/        zustand store persisted to AsyncStorage (debounced writes), selectors
  services/     notifications, reminder sync, rest timer
  hooks/        time hooks (midnight-aware "today")
docs/           science reference + code review reports
```

## Quality checks

```bash
npm test            # Jest: domain logic, store, services
npm run typecheck   # TypeScript strict
npm run lint        # ESLint (expo config)
```
