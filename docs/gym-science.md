# Gym Science Reference (for app logic)

Units: kg, cm, years, kcal unless stated. `sex`: M/F. `ln` = natural log, `log10` = base-10 log.
All numbers are population estimates. Show them as estimates in the UI and let the user override them with measured data (e.g., observed TDEE from logged intake and weight trend).

---

## 1. BMR and TDEE

**Mifflin-St Jeor (1990).** This is the default BMR equation; ADA/AND found it the most accurate in non-obese and obese adults.
- Male: `BMR = 10*W + 6.25*H - 5*A + 5`
- Female: `BMR = 10*W + 6.25*H - 5*A - 161`
- Source: https://pubmed.ncbi.nlm.nih.gov/2305711/

**Katch-McArdle.** Use it when body fat % is known, because it is better for lean or muscular users.
- `BMR = 370 + 21.6 * LBM_kg`, where `LBM = W * (1 - BF%/100)`
- (Cunningham variant: `RMR = 500 + 22 * LBM`)
- Source: McArdle, Katch & Katch, *Exercise Physiology*; summary at https://www.ncbi.nlm.nih.gov/books/NBK278991/ (Endotext, "Assessment of Energy Expenditure")

**TDEE = BMR x activity factor** (standard Harris-Benedict/McArdle multipliers):

| Level | Description | Factor |
|---|---|---|
| Sedentary | desk job, little/no exercise | 1.2 |
| Lightly active | light exercise 1-3 d/wk | 1.375 |
| Moderately active | moderate exercise 3-5 d/wk | 1.55 |
| Very active | hard exercise 6-7 d/wk | 1.725 |
| Extra active | hard daily training plus physical job | 1.9 |

App tip: after 2-3 weeks of logging, replace the formula with **adaptive TDEE**: `TDEE ≈ avg_intake - (Δtrend_weight_kg * 7700 / days)`. This is the MacroFactor-style approach. Clamp the change to about ±100 kcal per weekly update.

---

## 2. BMI, ideal body weight, healthy range

`BMI = W / (H_m)^2`. WHO adult categories (https://www.who.int/europe/news-room/fact-sheets/item/a-healthy-lifestyle---who-recommendations):

| BMI | Category |
|---|---|
| < 16.0 | Severe thinness |
| 16.0-16.9 | Moderate thinness |
| 17.0-18.4 | Mild thinness |
| **< 18.5** | **Underweight** |
| **18.5-24.9** | **Normal** |
| **25.0-29.9** | **Pre-obese / overweight** |
| 30.0-34.9 | Obese class I |
| 35.0-39.9 | Obese class II |
| ≥ 40.0 | Obese class III |

- WHO Asian action points: 23 = increased risk, 27.5 = high risk (WHO Expert Consultation, Lancet 2004, https://pubmed.ncbi.nlm.nih.gov/14726171/).
- BMI misclassifies muscular lifters. Show FFMI and BF% next to it.
- **Healthy weight range** = `18.5*H_m^2` to `24.9*H_m^2`.

**Ideal body weight.** `in` = inches over 5 ft = `(H_cm/2.54) - 60`. Clamp at 0 for short users, because the formulas are unreliable below 152 cm.

| Formula | Male | Female |
|---|---|---|
| Devine (1974) | 50.0 + 2.3*in | 45.5 + 2.3*in |
| Robinson (1983) | 52.0 + 1.9*in | 49.0 + 1.7*in |
| Miller (1983) | 56.2 + 1.41*in | 53.1 + 1.36*in |
| Hamwi (1964) | 48.0 + 2.7*in | 45.5 + 2.2*in |

Source review: Pai & Paloucek, Ann Pharmacother 2000, https://pubmed.ncbi.nlm.nih.gov/10981254/

---

## 3. Body fat estimation

**US Navy circumference method (Hodgdon & Beckett 1984), metric (cm).**
- Male: `BF% = 495 / (1.0324 - 0.19077*log10(waist - neck) + 0.15456*log10(height)) - 450`
- Female: `BF% = 495 / (1.29579 - 0.35004*log10(waist + hip - neck) + 0.22100*log10(height)) - 450`
- Measurements: waist at the navel for men and at the narrowest point for women; neck below the larynx; hip at the widest point. SEE is about ±3-4%.
- Source: https://apps.dtic.mil/sti/citations/ADA143890 (NHRC Report 84-29)

**Deurenberg (1991), BMI-based, adults.**
- `BF% = 1.20*BMI + 0.23*Age - 10.8*S - 5.4` (S = 1 male, 0 female). SEE is about 4%.
- Source: https://pubmed.ncbi.nlm.nih.gov/2043597/

**ACE body fat categories (%):**

| Category | Men | Women |
|---|---|---|
| Essential fat | 2-5 | 10-13 |
| Athletes | 6-13 | 14-20 |
| Fitness | 14-17 | 21-24 |
| Average | 18-24 | 25-31 |
| Obese | ≥ 25 | ≥ 32 |

Source: https://www.acefitness.org/resources/everyone/tools-calculators/percent-body-fat-calculator/

---

## 4. Lean body mass and FFMI

**Boer (1984) LBM:**
- Male: `LBM = 0.407*W + 0.267*H - 19.2`
- Female: `LBM = 0.252*W + 0.473*H - 48.3`
- Prefer `W*(1-BF/100)` when BF% is known.
- Source: Boer P., Am J Physiol 1984; cited in https://pubmed.ncbi.nlm.nih.gov/6496691/

**FFMI (Kouri et al., 1995):**
- `FFMI = LBM / H_m^2`
- `normalized FFMI = FFMI + 6.1 * (1.8 - H_m)` (adjusts to 1.80 m height)
- Drug-free bodybuilders in the study did not exceed a normalized FFMI of about 25, so treat 25 as the practical natural ceiling (men).
- Rough men's bands: <18 below average, 18-20 average, 20-22 above average, 22-23 excellent, 23-25 near the natural limit. For women, subtract about 3-4.
- Source: https://pubmed.ncbi.nlm.nih.gov/7496846/

---

## 5. Weight change modelling

- **Static rule:** about 7700 kcal per kg (≈3500 kcal/lb). This is fine for short projections of 4-8 weeks or less. It **overestimates** long-term loss because expenditure falls as weight drops.
- **Hall dynamic model (Lancet 2011):** a sustained change of 100 kJ/day (≈24 kcal/day) leads to an eventual change of about **1 kg**. About **half** of the change happens in about 1 year, and about 95% in about 3 years.
  - Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/ and the NIH Body Weight Planner https://www.niddk.nih.gov/bwp
- **Simple projection with adaptation.** Recommended for the app; run it on a daily loop:
  ```
  for each day:
    TDEE_d = BMR(W_d) * activity          // recompute from current weight
    TDEE_d *= (1 - adapt)                 // adaptive thermogenesis: adapt ≈ 0.05 during sustained deficit (0 in surplus/maintenance)
    W_{d+1} = W_d + (intake - TDEE_d) / 7700
  ```
  Recomputing TDEE from current weight already captures most of the slowdown. Adaptive thermogenesis in the literature is roughly 5-15% of TDEE beyond what mass loss predicts (Rosenbaum & Leibel, https://pubmed.ncbi.nlm.nih.gov/20935667/). Use about 5% as a conservative default.
- **Recommended loss rate:** **0.5-1.0% BW/week**. 0.7%/wk preserved LBM and strength better than 1.4%/wk (Garthe 2011, https://pubmed.ncbi.nlm.nih.gov/21558571/). For lean users, approach 0.5%/wk (Helms 2014, https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/).
- **Lean-bulk gain rate** (Aragon/Helms model; off-season review by Iraki 2019, https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/, recommends about 0.25-0.5% BW/week and a surplus of about 10-20% / 350-500 kcal):

| Experience | Gain rate |
|---|---|
| Beginner (<1 yr) | 1.0-1.5% BW/month (~0.25-0.35%/wk) |
| Intermediate (1-3 yr) | 0.5-1.0% BW/month |
| Advanced (3+ yr) | 0.25-0.5% BW/month |

- **Calorie floors.** NIH/NHLBI: 1000-1200 kcal/day for women and 1200-1600 kcal/day for men are low-calorie diets. <800 kcal is a VLCD and needs medical supervision. App rule: never plan below **1200 (F) / 1500 (M)** or below BMR*1.0 without a warning. Source: https://www.ncbi.nlm.nih.gov/books/NBK2003/
- Cap the deficit at about 25% of TDEE (about 500-750 kcal/day) for general users.

---

## 6. Macros

| Nutrient | Guidance | Source |
|---|---|---|
| Protein (general training) | **1.4-2.0 g/kg/day**. Per-meal dose 0.25 g/kg or 20-40 g, every 3-4 h | ISSN 2017 https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/ |
| Protein plateau | Gains plateau at about **1.6 g/kg** (95% CI up to 2.2) | Morton 2018 BJSM https://pubmed.ncbi.nlm.nih.gov/28698222/ |
| Protein when cutting | **2.3-3.1 g/kg LBM** (ISSN; Helms 2014). App default about 2.0-2.4 g/kg BW | ISSN / Helms |
| Protein when bulking | **1.6-2.2 g/kg** | Iraki 2019 |
| Fat | AMDR **20-35% kcal**. Floor about **0.5 g/kg** (bulk 0.5-1.5 g/kg). Cutting 15-30% kcal (keep ≥20% where possible for hormones) | NAM DRI https://nap.edu/catalog/10490 ; Helms 2014 |
| Carbs | Remainder of calories. AMDR 45-65%. Strength athletes about 3-5 g/kg; high-volume training 5-7 g/kg | ISSN nutrient timing https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/ |
| Fiber | **14 g per 1000 kcal** (≈25 g F / 38 g M; 21/30 g if age >50) | DGA 2020-2025 https://www.dietaryguidelines.gov/ |

Calculation order: protein (g/kg) → fat (g/kg or %) → carbs = (target - 4*P - 9*F)/4. Use 4/4/9 kcal per gram (and alcohol 7).

---

## 7. Water

- **Total water (all sources, including about 20-30% from food):**
  - EFSA 2010: **2.5 L/day men, 2.0 L/day women**. https://www.efsa.europa.eu/en/efsajournal/pub/1459
  - NAM 2004 AI: **3.7 L men, 2.7 L women**. https://nap.nationalacademies.org/catalog/10925
- **Per-kg heuristic for drinks:** **30-35 ml/kg/day** baseline (e.g., 70 kg → 2.1-2.5 L). Clamp to ≥1.5 L and ≤4 L.
- **Exercise:** sweat rates are about 0.3-2.4 L/h. Add **~0.5-0.75 L per hour** of training (more in heat). Aim to keep BW loss from sweat under 2%. Post-exercise, drink 1.25-1.5 L per kg lost (ACSM 2007, https://pubmed.ncbi.nlm.nih.gov/17277604/).
- **Reminder cadence:** spread intake over waking hours. Remind about every **90-120 min** with about 250 ml. Suppress reminders during sleep, and add a pre-, intra- and post-workout nudge. Self-check: pale-yellow urine.

---

## 8. Strength: 1RM and RPE

w = weight lifted, r = reps (to failure). Source comparison: LeSuer et al., JSCR 1997;11(4):211-213 (https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx).

| Formula | 1RM = | Best range |
|---|---|---|
| Epley | w * (1 + r/30) | 2-10 reps (overestimates at low r; return w when r=1) |
| Brzycki | w * 36 / (37 - r) | ≤10 reps (breaks down >12; undefined at 37) |
| Lombardi | w * r^0.10 | 1-10 |
| O'Conner | w * (1 + 0.025*r) | ≤10 |
| Mayhew | 100*w / (52.2 + 41.9*e^(-0.055*r)) | ≤10-15 (most accurate for bench in LeSuer) |
| Wathan | 100*w / (48.8 + 53.8*e^(-0.075*r)) | ≤10-15 (best for squat/DL in LeSuer) |
| Lander | 100*w / (101.3 - 2.67123*r) | ≤10 |

App rule: compute e1RM only for r ≤ 10 (show "low confidence" for 11-15). With RPE, use `effective_reps = r + RIR` in the table below.

**RIR-based RPE** (Zourdos/Helms 2016, https://pmc.ncbi.nlm.nih.gov/articles/PMC4961270/): RPE 10 = 0 RIR, 9 = 1, 8 = 2, 7 = 3, 6 = 4, 5-6 = 4-6, 1-4 = very light. Half points such as 9.5 mean "maybe 1 more rep, or more load possible".

**%1RM by reps x RPE** (Tuchscherer/RTS chart, widely used by Helms and others; https://fitnessvolt.com/rpe-training/guides/tuchscherer-chart-explained):

| Reps | RPE 10 | 9.5 | 9 | 8.5 | 8 | 7.5 | 7 | 6.5 |
|---|---|---|---|---|---|---|---|---|
| 1 | 100 | 97.8 | 95.5 | 93.9 | 92.2 | 90.7 | 89.2 | 87.8 |
| 2 | 95.5 | 93.9 | 92.2 | 90.7 | 89.2 | 87.8 | 86.3 | 85.0 |
| 3 | 92.2 | 90.7 | 89.2 | 87.8 | 86.3 | 85.0 | 83.7 | 82.4 |
| 4 | 89.2 | 87.8 | 86.3 | 85.0 | 83.7 | 82.4 | 81.1 | 79.9 |
| 5 | 86.3 | 85.0 | 83.7 | 82.4 | 81.1 | 79.9 | 78.6 | 77.4 |
| 6 | 83.7 | 82.4 | 81.1 | 79.9 | 78.6 | 77.4 | 76.2 | 75.1 |
| 7 | 81.1 | 79.9 | 78.6 | 77.4 | 76.2 | 75.1 | 73.9 | 72.3 |
| 8 | 78.6 | 77.4 | 76.2 | 75.1 | 73.9 | 72.3 | 70.7 | 69.4 |
| 9 | 76.2 | 75.1 | 73.9 | 72.3 | 70.7 | 69.4 | 68.0 | 66.7 |
| 10 | 73.9 | 72.3 | 70.7 | 69.4 | 68.0 | 66.7 | 65.3 | 64.0 |

Use: `e1RM = w / pct(reps, rpe)`. Also, the target load for the next set is `e1RM * pct(targetReps, targetRPE)`. Step from one cell to the next is about 1.5-1.7%. You can extrapolate: one row down is the same as 0.5 RPE lower × 2.

---

## 9. Strength standards (1RM ÷ bodyweight)

Source: Strength Level crowd-sourced standards (https://strengthlevel.com/strength-standards/squat/kg, etc.). Tiers follow the Kilgore/Rippetoe untrained→elite framework.
- Beginner ≈ 5th percentile of lifters (or about 1 month of training)
- Novice ≈ 20th (about 6 months)
- Intermediate ≈ 50th (about 2 yr)
- Advanced ≈ 80th (about 5 yr)
- Elite ≈ 95th (5+ yr competitive)

| Lift | Sex | Beginner | Novice | Intermediate | Advanced | Elite |
|---|---|---|---|---|---|---|
| Squat | M | 0.75 | 1.25 | 1.75 | 2.25 | 2.75 |
| Squat | F | 0.50 | 0.75 | 1.25 | 1.75 | 2.25 |
| Bench press | M | 0.50 | 1.00 | 1.25 | 1.50 | 2.00 |
| Bench press | F | 0.30 | 0.50 | 0.75 | 1.10 | 1.45 |
| Deadlift | M | 1.00 | 1.50 | 2.00 | 2.50 | 3.25 |
| Deadlift | F | 0.75 | 1.00 | 1.50 | 2.00 | 2.50 |
| Overhead press | M | 0.35 | 0.55 | 0.80 | 1.05 | 1.35 |
| Overhead press | F | 0.20 | 0.35 | 0.50 | 0.70 | 0.95 |

Caveat: bodyweight ratios favour lighter lifters. For fairer cross-weight comparison use allometric scaling (DOTS/Wilks/IPF GL points).

---

## 10. Hypertrophy volume, frequency, reps, rest

- **Dose-response:** <5 sets/wk ES 0.31… → **10+ hard sets/muscle/week ES 0.60** (Schoenfeld, Ogborn & Krieger 2017, https://pubmed.ncbi.nlm.nih.gov/27433992/). The practical sweet spot is **10-20 sets/muscle/week**, with diminishing returns above about 20. A "hard set" is taken to about 0-3 RIR.
- **Volume landmarks** (Israetel / RP, https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth). These are typical sets/week and vary by muscle:
  - MV (maintenance) ~ 6 (0-6 for some muscles)
  - MEV ~ 8-10 (back/quads ~8-10; side delts/biceps ~6-8)
  - MAV ~ 12-20
  - MRV ~ 20-25+ (lower for quads/hamstrings, higher for delts/calves)
  - Mesocycle pattern: start near MEV, add 1-2 sets/muscle/week, deload near MRV.
- **Frequency:** train each muscle **≥2x/week** when volume is equated. This is superior to 1x (Schoenfeld 2016 meta, https://pubmed.ncbi.nlm.nih.gov/27102172/). Cap at about 10 sets per muscle per session and split the rest.
- **Rep ranges and rest** (ACSM 2009 Position Stand, https://pubmed.ncbi.nlm.nih.gov/19204579/; Schoenfeld 2016 rest study, https://pubmed.ncbi.nlm.nih.gov/26605807/):

| Goal | Reps | %1RM | Rest |
|---|---|---|---|
| Strength | 1-6 | ≥80-85% | 2-5 min (compounds 3-5) |
| Hypertrophy | 6-12 (5-30 works if near failure) | 60-80% | 1-3 min. ≥2 min on compounds gives more growth than 1 min |
| Muscular endurance | 12-20+ | <60-67% | 30-90 s |
| Novice general | 8-12 | 60-70% | 1-2 min |

---

## 11. Progression and deloads

- **Novice linear progression** (Rippetoe, *Starting Strength*; ACSM 2009):
  - Add load **every session**. Lower body (squat, DL): **+2.5-5 kg**. Upper body (bench, OHP, row): **+1-2.5 kg** (use microplates of 0.5-1.25 kg).
  - After the first weeks, deadlift +2.5-5 kg and squat +2.5 kg.
  - **Stall rule:** missing target reps in **2-3 consecutive sessions** → reset that lift by **10%** and rebuild. After 2-3 resets, move to intermediate (weekly) progression.
- **ACSM 2-for-2 rule:** when the user completes **2 reps over target on 2 consecutive sessions**, raise the load by **2-10%**. Use the smaller step for small or upper-body muscles and the larger for big lower-body muscles.
- **Double progression** (best for accessories and hypertrophy): set a rep range such as 3x8-12. Same load until **all sets** reach the top of the range, then add the smallest increment (about 2.5-5%; dumbbells +1-2 kg per hand) and restart at the bottom.
- **RPE-based (autoregulated):** target e.g. 3x5 @ RPE 8. If the RPE comes in ≥1 below target, add ~2-5%. If it is ≥1 above, reduce ~2-5%.
- **When to deload:**
  - every **4-8 weeks** (typical about every 5-6 weeks for intermediates)
  - or reactively: ≥2 weeks of stalled or declining e1RM on several lifts
  - persistent soreness or joint pain, poor sleep or motivation
  - session RPE creeping up at the same loads
- **Deload protocol:** 1 week. Cut **volume (sets) ~30-50%**. Keep load moderately high (about 85-90% of normal working weight) or drop intensity about 10%. Stay ≥2-3 RIR. Source: Bell et al., "Integrating deloading into strength and physique sports training programmes: an international Delphi consensus", Sports Med Open 2023, https://doi.org/10.1186/s40798-023-00633-0

---

## 12. Program templates (pick by days/week)

| Days | Split | Day structure (example exercises) |
|---|---|---|
| 2 | Full body A/B | A: Squat, Bench, Row, RDL, Plank. B: Deadlift, OHP, Lat pulldown/Chin-up, Leg press/Lunge, Curls |
| 3 | Full body A/B/A or A/B/C | A: Squat 3x5, Bench 3x5, Barbell row. B: Deadlift 1x5 / RDL, OHP, Pull-ups. C: Front squat / Leg press, Incline DB press, Cable row, Hip thrust. Add 1-2 arms/core accessories per day |
| 4 | Upper/Lower x2 | Upper 1 (strength): Bench, Row, OHP, Pull-up, Triceps. Lower 1: Squat, RDL, Leg curl, Calf raise, Abs. Upper 2 (hypertrophy): Incline DB press, Lat pulldown, Seated row, Lateral raise, Curls. Lower 2: Deadlift/Hack squat, Bulgarian split squat, Leg extension, Leg curl, Calves |
| 5 | Upper/Lower + PPL hybrid (U/L/Push/Pull/Legs) | as below |
| 6 | PPL x2 | Push: Bench/OHP, Incline DB press, Lateral raise, Triceps pushdown, Overhead triceps ext. Pull: Deadlift or Row, Pull-up/Lat pulldown, Cable row, Face pull/Rear delt, Curls (barbell + hammer). Legs: Squat, RDL, Leg press, Leg curl, Leg ext, Calves |

Rules:
- 4-8 exercises per session, compounds first.
- About 45-75 min per session.
- Each muscle should get ≥2 exposures/week and 10-20 sets/week (counting compounds as 1 set for prime movers and 0.5 for synergists).
- Beginners: 2-3 full-body days. Intermediates: 4 days U/L. Advanced or high recovery capacity: 5-6 days.

---

## 13. Warm-up sets for heavy compounds

General: 5 min of light cardio plus dynamic mobility. Then ramp. Warm-ups are not fatiguing: low reps, falling as load rises. Rest 30-90 s between warm-up sets, then 2-3 min before the first working set.

| Step | % of working weight | Reps |
|---|---|---|
| 1 | Empty bar (20 kg) | 2 x 5-10 |
| 2 | ~40% | 5 |
| 3 | ~60% | 3 |
| 4 | ~80% | 2 |
| 5 | ~90% (only if working ≥ ~85% 1RM) | 1 |

App logic: round to plate increments, skip duplicate steps when the working weight is light (<~60 kg), and do only 1-2 warm-ups for the second compound that uses the same muscles. Source: NSCA *Essentials of Strength Training & Conditioning* (4th ed.), warm-up chapter; Rippetoe *Starting Strength* warm-up tables.

---

## 14. Weight trend smoothing

Hacker's Diet exponentially smoothed moving average (John Walker, https://www.fourmilab.ch/hackdiet/e4/signalnoise.html):
```
trend_0 = first weight
trend_t = trend_{t-1} + α * (weight_t - trend_{t-1}),  α = 0.1   (10% smoothing)
```
- Missing days: carry the trend forward, or interpolate the weight linearly between readings.
- Weekly rate = slope of a linear regression on the last 14-21 days of trend values. Report it as kg/wk and as %BW/wk.
- α = 0.1 gives an effective window of about 19 days. Use α of about 0.15-0.25 if the user wants faster response.

---

## 15. Cardio: METs and heart rate

**Calories:** `kcal = MET * kg * hours`. That is gross. For **net** calories to add on top of TDEE, use `(MET - 1) * kg * hours` to avoid double-counting resting expenditure.

Values from the Compendium of Physical Activities (Ainsworth 2011 / Herrmann 2024 update, https://pacompendium.com/):

| Activity | MET |
|---|---|
| Walking 3.0 mph (4.8 km/h), level | 3.5 |
| Walking 3.5 mph (5.6 km/h), brisk | 4.3 |
| Hiking, cross-country | 6.0 |
| Running 5 mph (8 km/h) | 8.3 |
| Running 6 mph (9.7 km/h) | 9.8 |
| Running 7.5 mph (12 km/h) | 11.8 |
| Cycling 12-13.9 mph, moderate | 8.0 |
| Stationary bike, moderate (~100 W) | 6.8 |
| Elliptical, moderate | 5.0 |
| Rowing machine, moderate (~100 W) | 7.0 |
| Stair-climber | 9.0 |
| Swimming freestyle, moderate | 5.8 (vigorous 9.8) |
| Jump rope, moderate | 11.8 |
| Resistance training, moderate | 3.5 |
| Resistance training, vigorous (powerlifting/bodybuilding) | 5.0-6.0 |
| Circuit training / HIIT-style | 8.0 |
| Yoga (Hatha) | 2.5 |
| Basketball (game) | 8.0 |
| Soccer, casual | 7.0 |

**HRmax:**
- Tanaka: `HRmax = 208 - 0.7*age` (https://pubmed.ncbi.nlm.nih.gov/11153730/). Prefer it over `220 - age`.
- Gellish alternative: 207 - 0.7*age.

**Karvonen (heart-rate reserve):** `targetHR = (HRmax - HRrest) * intensity + HRrest`.
- ACSM: moderate = 40-59% HRR, vigorous = 60-89% HRR (ACSM Guidelines 11th ed., https://www.acsm.org/education-resources/books/guidelines-exercise-testing-prescription).

**5-zone model (% HRmax):**

| Zone | % HRmax |
|---|---|
| Z1 recovery | 50-60 |
| Z2 aerobic base | 60-70 |
| Z3 tempo | 70-80 |
| Z4 threshold | 80-90 |
| Z5 VO2max | 90-100 |

**Activity guidelines (WHO 2020):** 150-300 min/wk moderate or 75-150 min/wk vigorous aerobic, plus muscle-strengthening on ≥2 days/wk. https://www.who.int/publications/i/item/9789240015128

---

## 16. Sleep and recovery

- **Adults: ≥7 h/night** (AASM/SRS consensus, Watson 2015, https://pubmed.ncbi.nlm.nih.gov/25979105/). Teens 13-18: 8-10 h. Athletes often benefit from 8-9+ h.
- Sleep restriction while dieting shifts loss from fat toward lean mass (Nedeltcheva 2010, https://pubmed.ncbi.nlm.nih.gov/20921542/).
- **Muscle recovery:** allow about 48-72 h before hard training of the same muscle again. MPS stays elevated for about 24-48 h after a session.
- Signals to flag in the app: resting HR ≥5-10 bpm above baseline, HRV down, sleep <6 h, high soreness. When these appear, suggest reducing volume or RPE for the day.
- Pre-sleep protein (about 40 g casein) may support overnight MPS (ISSN 2017).

---

## 17. UX patterns from top apps

**Logging flow (Strong, Hevy):**
- Start an empty workout or a routine.
- Each exercise is a card with set rows: `Set | Previous | kg | Reps | ✓`.
- Tapping ✓ completes the set and starts the rest timer automatically.
- Large numeric keypad, with +/- steppers for plate increments.
- Swipe left to delete a set. Long-press to reorder exercises.
- Supersets are shown with a coloured bracket.
- Set types: Warm-up (W), Drop (D), Failure (F). Optional RPE column.

**Ghost/previous values:**
- The "Previous" column shows last session's `80 kg x 8` in grey.
- Empty inputs are pre-filled with placeholder values, and one tap copies them.
- Show a suggested progression next to it (e.g., "+2.5 kg").

**Rest timer:**
- Per-exercise default, e.g., 3 min for compounds and 90 s for isolation.
- Starts automatically on set completion and shows a countdown in a sticky bar.
- ±15 s buttons. Vibrate and sound at 0 and 10 s before. Lock-screen live activity / notification.

**PR celebrations:**
- Detect weight, rep, volume and e1RM PRs at set-completion time.
- Show a trophy/medal badge on the set and confetti in the workout summary.
- A "PRs this week" feed.

**Workout summary:** duration, total volume, sets, PRs, a muscles-worked heatmap, a share card, and a comparison vs last time.

**Muscle heatmap:**
- Front/back body SVG, with each muscle coloured by sets in the last 7 days. Fitbod uses a "muscle recovery %" freshness map instead.
- Use primary = 1.0 and secondary = 0.5 set weighting.

**Smart generation (Fitbod):**
- Picks exercises from equipment, goal, muscle recovery and history.
- Shows recommended weight and reps per set.
- Lets the user swap an exercise for a similar one.

**Adaptive nutrition (MacroFactor):**
- Expenditure is estimated from the trend weight plus logged intake, not from formulas.
- Weekly check-in adjusts macros.
- "Trend weight" line over noisy scale dots, with goal-rate targets in %BW/wk.
- Logging is fast: barcode scanning, recent and frequent foods.

**Library and history (JEFIT):**
- Large exercise database with animations or videos and muscle tags.
- Per-exercise history charts for e1RM, best set and volume.
- Calendar with streaks, body measurements and progress photos.

**General:**
- Offline-first, so a workout is never lost.
- An active-workout banner persists across tabs.
- Home-screen and watch widgets.
- Plate calculator.
- Unit toggle (kg/lb).
- Dark mode.
- Haptic feedback on set completion.
- Minimal taps per set: 1 tap if the values match the previous session.
