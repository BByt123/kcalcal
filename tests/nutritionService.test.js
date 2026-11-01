import test from "node:test";
import assert from "node:assert/strict";
import { calculateGoals, applyGoalOverrides } from "../src/services/nutritionService.js";

test("uses the youth energy estimate for a six-year-old", () => {
  const goals = calculateGoals({ age: 6, sex: "female", heightCm: 115, weightKg: 20, activity: "sedentary", goal: "maintain" });

  assert.equal(goals.calories, 1250);
  assert.equal(goals.protein, 19);
});

test("does not apply weight-loss or weight-gain adjustments to youth", () => {
  const profile = { age: 17, sex: "male", heightCm: 175, weightKg: 65, activity: "moderate" };
  const losing = calculateGoals({ ...profile, goal: "lose" });
  const gaining = calculateGoals({ ...profile, goal: "gain" });

  assert.equal(losing.calories, gaining.calories);
});

test("retains the adult maintenance formula and goal adjustment", () => {
  const profile = { age: 30, sex: "male", heightCm: 175, weightKg: 70, activity: "moderate" };

  assert.equal(calculateGoals({ ...profile, goal: "maintain" }).calories, 2550);
  assert.equal(calculateGoals({ ...profile, goal: "lose" }).calories, 2200);
});

test("applies independent daily targets without recalculating other nutrients", () => {
  const suggested = { calories: 2200, protein: 130, carbohydrates: 260, fat: 70, maintenance: 2550 };
  const result = applyGoalOverrides(suggested, { calories: "2055", protein: "125.5", carbohydrates: "0", fat: "68" });

  assert.deepEqual(result, { calories: 2055, protein: 125.5, carbohydrates: 0, fat: 68, maintenance: 2550 });
  assert.equal(suggested.calories, 2200);
  assert.deepEqual(applyGoalOverrides(suggested, { calories: 1800 }), { ...suggested, calories: 1800 });
});

test("keeps manual targets when updated recommendations are supplied", () => {
  const updated = calculateGoals({ age: 30, sex: "male", heightCm: 175, weightKg: 75, activity: "active", goal: "gain" });
  const manual = { calories: 2100, protein: 140, carbohydrates: 220, fat: 65 };

  assert.deepEqual(applyGoalOverrides(updated, manual), { ...updated, ...manual });
});

test("rejects invalid targets instead of silently replacing them", () => {
  for (const overrides of [{ calories: 999 }, { calories: 10001 }, { protein: -1 }, { fat: "" }, { carbohydrates: "text" }, { protein: Infinity }, { fat: null }]) {
    assert.throws(() => applyGoalOverrides({}, overrides));
  }
});
