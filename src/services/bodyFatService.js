export function validateBodyFatRecord(input, today) {
  const date = String(input.date || "");
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date > today) {
    throw new Error("請選擇今日或之前的有效日期。");
  }
  const percent = Number(input.percent);
  if (input.percent === null || String(input.percent ?? "").trim() === "" || !Number.isFinite(percent) || percent < 1 || percent > 70) {
    throw new Error("請輸入 1 至 70% 的體脂率。");
  }
  return { date, percent: Math.round(percent * 10) / 10 };
}

export function upsertBodyFatRecord(entries, input, today) {
  const record = validateBodyFatRecord(input, today);
  const existing = entries.find((entry) => entry.date === record.date);
  return [
    ...entries.filter((entry) => entry.date !== record.date),
    { ...record, id: existing?.id || crypto.randomUUID() },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
