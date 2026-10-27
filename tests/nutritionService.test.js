import test from "node:test";
import assert from "node:assert/strict";
import { calculateGoals } from "../src/services/nutritionService.js";

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
