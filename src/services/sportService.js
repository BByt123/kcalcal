const sportMet = {
  walking: 3.3,
  briskWalking: 4.3,
  running: 8.3,
  cycling: 7.5,
  swimming: 8,
  badminton: 5.5,
  football: 7,
  basketball: 6.5,
  hiking: 6,
  yoga: 2.5,
  strength: 5,
};

export const sportOptions = [
  ["walking", "散步／慢行"],
  ["briskWalking", "急步行"],
  ["running", "跑步"],
  ["cycling", "踩單車"],
  ["swimming", "游水"],
  ["badminton", "羽毛球"],
  ["football", "足球"],
  ["basketball", "籃球"],
  ["hiking", "行山"],
  ["yoga", "瑜伽／伸展"],
  ["strength", "重量訓練"],
];

export function calculateExerciseCalories({ weightKg, durationMinutes, sport }) {
  const weight = Number(weightKg);
  const duration = Number(durationMinutes);
  const met = sportMet[sport];
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("需要有效體重才能估算運動消耗。");
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("請輸入運動時間。");
  if (!met) throw new Error("請選擇運動種類。");
  return Math.max(0, Math.round(met * 3.5 * weight / 200 * duration));
}
