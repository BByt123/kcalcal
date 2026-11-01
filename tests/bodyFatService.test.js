import test from "node:test";
import assert from "node:assert/strict";
import { validateBodyFatRecord, upsertBodyFatRecord } from "../src/services/bodyFatService.js";

const today = "2026-10-28";

test("validates body-fat measurements, including decimal percentages", () => {
  assert.deepEqual(validateBodyFatRecord({ date: today, percent: "22.5" }, today), { date: today, percent: 22.5 });
  assert.equal(validateBodyFatRecord({ date: today, percent: 1 }, today).percent, 1);
  assert.equal(validateBodyFatRecord({ date: today, percent: 70 }, today).percent, 70);
});

test("updates the same day and sorts backdated measurements without mutating existing data", () => {
  const original = [{ id: "existing", date: today, percent: 23 }];
  const updated = upsertBodyFatRecord(original, { date: today, percent: 22.5 }, today);
  const backdated = upsertBodyFatRecord(updated, { date: "2026-10-01", percent: 24 }, today);

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "existing");
  assert.equal(updated[0].percent, 22.5);
  assert.equal(original[0].percent, 23);
  assert.deepEqual(backdated.map((entry) => entry.date), ["2026-10-01", today]);
  assert.ok(backdated[0].id);
});

test("rejects future and impossible dates and invalid percentages", () => {
  for (const date of ["2026-10-29", "2026-02-30", "2026-13-01", "2026-1-01", "", "not-a-date"]) {
    assert.throws(() => validateBodyFatRecord({ date, percent: 22 }, today));
  }
  for (const percent of [0, -2, 70.1, "", " ", "invalid", null, undefined, Infinity, NaN]) {
    assert.throws(() => validateBodyFatRecord({ date: today, percent }, today));
  }
});
