const adultActivityFactors = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

const youthActivityFactors = {
  male: { sedentary: 1, light: 1.13, moderate: 1.26, active: 1.42, very: 1.42 },
  female: { sedentary: 1, light: 1.16, moderate: 1.31, active: 1.56, very: 1.56 },
};

export function calculateGoals(profile) {
  const weight = Number(profile.weightKg);
  const height = Number(profile.heightCm);
  const age = Number(profile.age);
  const isYouth = age < 18;
  const isMale = profile.sex === "male";
  let maintenance;

  if (isYouth) {
    const pa = youthActivityFactors[isMale ? "male" : "female"][profile.activity] ?? 1;
    const growthAllowance = age <= 8 ? 20 : 25;
    maintenance = isMale
      ? 88.5 - 61.9 * age + pa * (26.7 * weight + 903 * height / 100) + growthAllowance
      : 135.3 - 30.8 * age + pa * (10 * weight + 934 * height / 100) + growthAllowance;
  } else {
    const base = 10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161);
    maintenance = base * (adultActivityFactors[profile.activity] ?? adultActivityFactors.light);
  }

  const adjustment = isYouth ? 0 : { lose: -350, maintain: 0, gain: 250 }[profile.goal] ?? 0;
  const calories = isYouth
    ? Math.max(0, Math.round(maintenance / 50) * 50)
    : Math.max(1200, Math.round((maintenance + adjustment) / 50) * 50);
  const proteinFactor = isYouth ? (age < 14 ? 0.95 : 0.85) : (profile.goal === "lose" ? 1.8 : 1.6);
  const protein = Math.round(weight * proteinFactor);
  const fat = Math.round(calories * 0.28 / 9);
  const carbohydrates = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbohydrates, fat, maintenance: Math.round(maintenance) };
}
