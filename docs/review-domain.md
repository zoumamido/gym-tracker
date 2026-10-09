# Domain-logic review (src/lib, src/data)

Checked against docs/gym-science.md. The scenarios below were reproduced by running the real modules under Node 24 from a scratch copy, with no source edits. These all match the reference: BMR, Katch, Navy, Deurenberg, Boer, IBW, FFMI, activity factors, the strength-standard table, the RPE chart indexing, Tanaka HRmax and the 7700 kcal/kg constant. Every exercise id that program.ts references exists, and there are no duplicate ids.

1. **projection.ts:126 - the 5% adaptation is all-or-nothing, so a small deficit (or rounding) projects weight GAIN.**
   `if (dailyCalories < expenditure) expenditure *= 1 - adaptation;` cuts TDEE by 5% even when intake is only 1 kcal below it.
   - Male, 30 y, 180 cm, 80 kg, moderate: TDEE is 2759. Eating 2700 ("small cut") gives a projection of **81.6 kg after 180 days**.
   - The "maintain" goal hits the same bug through calorieTarget's rounding to 10 kcal. For 70 kg / 178 cm, TDEE is 2584.6 and the target is 2580, so the projection shows **74.25 kg after one year** (+4.25 kg). At 73 kg it shows +4.45 kg. Whether the user sees this depends on which way the rounding goes.
   - Fix: scale adaptation with the deficit and never let it flip the sign, e.g.
     `const deficit = expenditure - dailyCalories; if (deficit > 0) expenditure -= Math.min(deficit, expenditure * adaptation);`
     The better option is to apply it only when the deficit is at least about 10% of TDEE.

2. **coach.ts:127-153 together with projection.ts:124 - the target and the projection use different TDEE models.**
   When BF% is known, the calorie target comes from the Katch-McArdle TDEE, but projectWeight always recomputes Mifflin.
   - Male, 25 y, 180 cm, 90 kg, 10% BF, moderate, lose/slow: Katch TDEE is 3285 and Mifflin TDEE is 2953. The target is 2790 kcal and the UI promises -0.45 kg/wk, but the projection after 28 days is 89.95 kg, which is flat. The goal date is never reached.
   - Fix: pass the BMR function (or a `tdeeAt(w)` callback, or `bmrMethod` plus `bodyFatPct`) into ProjectionInput so the simulation uses the same model. With Katch, hold BF% constant or hold LBM constant and let fat change.

3. **nutrition.ts:58-72 and coach.ts:98-105 - an underweight user gets a weight-loss plan.**
   There is no BMI guard, and suggestedGoalWeight returns a goal *above* the current weight.
   - Female, 22 y, 168 cm, 48 kg (BMI 17.0), goal lose/fast: the coach's top "high" action is "Eat about 1300 kcal", a -431 kcal/day deficit. The suggested goal is 52 kg (healthy-range minimum), which is higher than the current 48 kg, so the projection never reaches it. The only safety message is a `low`-priority "Consider a check-up" sorted to the bottom.
   - Fix: when `bmi < 18.5` and the goal is `lose`, force the goal to maintain (or skip the deficit), add a warning, and raise `health-check` to high priority. suggestedGoalWeight should return null when `weightKg <= range.min`.

4. **nutrition.ts:64-68 - the calorie floor is "applied" but not met, and the warning is false.**
   `delta = Math.min(0, floor - tdee)` sets delta to 0 when TDEE is already below the floor.
   - Male, TDEE 1400, lose: the result is calories 1400 and dailyDelta 0, yet the warning says "Calories kept at the safe minimum of 1500 kcal/day." The UI also shows "0 kcal above maintenance", and the lose goal silently becomes maintenance.
   - Fix: change the wording when `tdee < floor`, e.g. "Your maintenance is already below 1500 kcal - increase activity instead of eating less". Keep `calories = tdee`. Also look at weeklyChangeKg: in coach.ts:193, a 0 delta shows as "above maintenance".

5. **program.ts (generator) together with data/muscles.ts and coach.ts:168 - the generated programs fall below the app's own MEV, so the coach permanently tells the user to add sets.**
   Weekly sets per muscle (primary = 1, secondary = 0.5) for the gym/hypertrophy programs:

   | Days | Chest | Side delts | Calves |
   |---|---|---|---|
   | 2 | 3 | 4.5 | 0 |
   | 3 | 6 | 4.5 | 0 |
   | 4 (U/L) | 6 | 4.5 | 6 |
   | 5 | 9 | 6 | 6 |
   | 6 | 15 | 9 | 6 |

   The MEV values are chest 8, side delts 8 and calves 8. A user who follows the generated plan exactly gets "Some muscles need more sets: Chest, Side delts, Calves". On the 2-day plan, chest is trained only once a week (FULL_B has no chest slot), which breaks the doc rule "≥2 exposures/week, 10-20 sets". In bodyweight mode the 5- and 6-day plans have sessions with only 2-3 exercises and 0 side-delt sets.
   - Fix: add a chest slot to FULL_B and a calf slot to the full-body days, give UPPER_A/UPPER_B 4 sets on chest, and raise accessory sets for side delts and calves. Alternatively, lower the coach threshold to MV (~6) for the "low" warning. Add a unit test asserting that each generated program reaches at least MEV for every major muscle.

6. **progression.ts:113 - deload and decrease loads are not rounded to loadable increments.**
   `fmt(top * 0.9)` rounds to 0.25 kg.
   - Barbell 62.5 kg gives **56.25 kg**, which cannot be loaded with 1.25 kg plates (18.125 per side).
   - Dumbbell 22 kg gives **19.75 kg**, which does not exist.
   - lb user at 135 lb gives 55 kg, which is **121.25 lb**.
   - Fix: `const w = Math.max(inc, Math.round((top * 0.9) / inc) * inc);`. Use the same snapping for 'increase' and 'decrease' when `top` was not on the grid (for example after a unit switch).

7. **stats.ts:103-114 (e1rmSeries/latestE1rm) vs records.ts:42 - e1RM is computed from any rep count in stats but only up to 12 reps in records.**
   strength.ts:64 also extrapolates Wathan up to 30 reps, while the doc says r ≤ 10 (low confidence 11-15, none above).
   - 60 kg × 25 reps gives an e1RM of **105 kg**, which beats 85 kg × 5 (97.4 kg). The chart and latestE1rm jump, while "Best est. 1RM" in records ignores the set.
   - Timed exercises store seconds in `reps`, so a weighted plank (10 kg × 60 s) also produces an e1RM.
   - Fix: in estimate1RM, return `{ value: 0 }` for r > 15 (or > 12). Filter with the same rule in e1rmSeries/bestsOf, and skip `kind !== 'strength'` exercises.

8. **coach.ts:254-263 - the "Plan a deload week" action can never be cleared.**
   `streakWeeks >= 8` counts any week with ≥1 workout, and a deload week still contains workouts, so once the streak hits 8 the high-visibility deload card stays forever.
   - Fix: track the last deload (a flag on the workout or program, or a week whose volume is ≤60% of the 4-week average) and count weeks since it. Alternatively, use the stalled-lifts signal only.

9. **nutrition.ts:110-114 - the protein reference weight caps every BMI>25 user at the weight for BMI 25, which under-doses muscular lifters.**
   - 100 kg, 180 cm, lean lifter, maintain: ref is 81 kg and protein is **146 g = 1.46 g/kg**. That is below the doc's 1.6 g/kg plateau and 1.4-2.0 range. When cutting, the doc asks for 2.3-3.1 g/kg LBM.
   - Fix: when BF% (measured or Navy) is known, use LBM-based protein (e.g. 2.3-2.6 g/kg LBM when cutting). Otherwise apply the BMI-25 cap only above BMI 30, or use `max(capped, 1.6*weightKg)` for users with training experience.

10. **reminders.ts:53-64 - today's per-reminder serving ignores how much is left.**
    `serving` is goal ÷ all reminders of the day, including ones already past.
    - 19:30, goal 3 L, 500 ml drunk, reminders 08-22 every 120 min: the reminders say "2.5 L to go. Have **400 ml** now", but only 2 reminders remain (800 ml total, so 1.7 L short).
    - Fix: for today, `servingPerReminder(left, remainingTimes.length)`, still clamped to 750.

11. **warmup.ts:30,38 - the empty bar defaults to 20 kg in lb mode.**
    135 lb gives a ramp of **44.1 lb**, 55, 80, 110. An imperial bar is 45 lb, so the displayed warm-up is wrong and the gap checks are off by 0.4 lb.
    - Fix: `const bar = opts.barKg ?? (unit === 'lb' ? lbToKg(45) : 20);`

12. **nutrition.ts:15-16 - the "fast" gain pace exceeds the doc's beginner ceiling.**
    The beginner rate is 0.3 %/wk × 1.25 = 0.375 %/wk, against a doc maximum of ~0.35 %/wk (1-1.5 %/month). Intermediate fast is 0.25 %/wk (doc: 0.12-0.23). Meanwhile coach.ts:306 flags anything above 0.6 %/wk as too fast, so the planner and the feedback disagree.
    - Fix: cap at the doc ranges (beginner 0.35, intermediate 0.23, advanced 0.12) and derive the "too fast" threshold from `targetWeeklyChangeKg × 1.5`.

13. **strength.ts:57-58 - the RPE path labels 11-12 reps as `medium` confidence.**
    The doc says low confidence for 11-15. It also requires RPE ≥ 6 while the chart is only defined for RPE ≥ 6.5, and RPE 5-5.5 silently falls back to rep-only formulas, which are RPE-10 estimates and therefore *over*-estimate.
    - Fix: `confidence: r <= 6 ? 'high' : r <= 10 ? 'medium' : 'low'`. For RPE < 6.5, either extrapolate via percentOf1RM (it already clamps to 5) or skip e1RM.

14. **body.ts:189-192 vs body.ts:116 - the BF% acceptance ranges are inconsistent.**
    estimateBodyFat accepts a measured 0 < BF < 75, while bmr() only uses 3-60.
    - An entered BF of 1% yields LBM = 0.99·W, so the FFMI for 80 kg / 180 cm is 24.4, labelled "Near natural limit". Meanwhile BMR silently falls back to Mifflin.
    - Fix: share one plausibility range (e.g. 3-60) in both places.

15. **coach.ts:215 vs water.ts:7 - the text and the constant disagree.**
    The text says "Add ~500 ml for every hour of hard training" but WATER_ML_PER_TRAINING_HOUR is 600. Use a template from the constant.

16. **volume.ts:38 together with the label map - MEV ≤ sets < MAV[0] is labelled "Maintenance".**
    Example: chest at 8-11 sets is above the minimum effective volume but is shown as maintenance. Rename the status to e.g. "Effective" / "Growing", or label MV < sets < MEV as maintenance.

17. **units.ts:60-62 - the comment says "0.5 kg / 1 lb resolution" but the code rounds to 0.25 kg / 0.5 lb.** Fix whichever one is wrong.

18. **coach.ts:174-179 - stalled-lift rep ranges come from the *oldest* workout among the last 30.**
    The first occurrence wins, so if the user later changes an exercise's rep range, stall detection uses the old range. `finished` is also not sorted (it relies on store insertion order).
    - Fix: iterate `finishedWorkouts(input.workouts)` from newest to oldest when collecting `ranges`.
