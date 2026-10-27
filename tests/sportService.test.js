import test from "node:test";
import assert from "node:assert/strict";
import { calculateExerciseCalories } from "../src/services/sportService.js";

test("estimates exercise calories from weight, duration, and sport", () => {
  assert.equal(calculateExerciseCalories({ weightKg: 70, durationMinutes: 30, sport: "running" }), 305);
});

test("rejects missing exercise duration", () => {
  assert.throws(
    () => calculateExerciseCalories({ weightKg: 70, durationMinutes: 0, sport: "walking" }),
    /運動時間/,
  );
});
