const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `你是一個專業且帶有香港廣東話幽默（毒舌/寸嘴風格）的飲食卡路里計算助手「卡老味 AI」。
請解析用戶輸入的飲食內容（針對香港茶餐廳、燒味飯、車仔麵等在地飲食特別優化），估算熱量(kcal)與蛋白質(g)、碳水(g)、脂肪(g)。
嚴格輸出 JSON 格式如下，不要加 Markdown 標記：
{
  "food_items": [{"name": "食物名", "calories": 0, "protein": 0, "carbohydrates": 0, "fat": 0}],
  "total_calories": 0,
  "total_protein": 0,
  "total_carbohydrates": 0,
  "total_fat": 0,
  "ai_comment": "廣東話幽默評語"
}`;

function parseModelJson(content) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw new Error("The AI service returned no analysis.");

  // Keep the client tolerant if a model adds a code fence despite JSON mode.
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch (error) {
    throw new Error(`The AI service returned invalid JSON: ${error.message}`);
  }
}

async function callGemini(systemPrompt, userPrompt, apiKey, image = null) {
  const userParts = [{ text: userPrompt }];
  if (image) {
    userParts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }

  let response;
  try {
    response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey.trim(),
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
  } catch (error) {
    throw new Error(`Unable to reach Gemini: ${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Gemini returned an invalid response: ${error.message}`);
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`Gemini request failed (${response.status}): ${apiMessage}`);
  }

  const content = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");
  return parseModelJson(content);
}

/**
 * Ask Gemini to estimate calories and macros for a user's food description.
 * The API key is supplied at runtime and is never bundled into this source.
 *
 * @param {string} userInput The food and drink description to analyze.
 * @param {string} apiKey Google AI Studio / Gemini API key.
 * @param {object|null} profile Optional user profile and calorie goals.
 * @param {{mimeType: string, data: string}|null} image Optional base64 image without a data URL prefix.
 * @returns {Promise<object>} The parsed calorie analysis returned by the model.
 */
export async function analyzeFoodInput(userInput, apiKey, profile = null, image = null) {
  const normalizedInput = typeof userInput === "string" ? userInput.trim() : "";
  if (!normalizedInput && !image) {
    throw new Error("Food input is required.");
  }

  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("A Gemini API key is required.");
  }

  if (image && (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) || typeof image.data !== "string" || !image.data)) {
    throw new Error("Use a JPEG, PNG, or WebP food photo.");
  }

  const profileContext = Number(profile?.age) >= 18 && profile?.goals
    ? `\n\n用家每日目標：${profile.goals.calories} kcal；蛋白質 ${profile.goals.protein} g；目標：${profile.goal}。評語請參考用家目標。`
    : "";
  const prompt = image
    ? normalizedInput
      ? `請分析附上的食物照片，並結合用家描述「${normalizedInput}」判斷食物種類和份量，再估算每項的熱量和營養資料。`
      : "請辨識照片中所有食物及大概份量，估算每項的熱量和營養資料。"
    : normalizedInput;
  return callGemini(SYSTEM_PROMPT, `${prompt}${profileContext}`, apiKey, image);
}

export async function analyzeUserProfile(profile, baselineGoals, apiKey) {
  if (Number(profile?.age) < 18) {
    throw new Error("Personal profile analysis is not available for users under 18.");
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("A Gemini API key is required.");
  }

  const systemPrompt = `你是「卡老味 AI」，一位謹慎的營養資訊助手。根據成人基本資料與 Mifflin–St Jeor 公式初步估算，提供溫和、非醫療性每日攝取建議。不得建議每日低於 1200 kcal，不得使用極端節食建議。只輸出 JSON，不要 Markdown：{"daily_calories": 0, "protein_g": 0, "carbohydrates_g": 0, "fat_g": 0, "daily_tip": "以香港廣東話提供簡短、可行、有幽默感的飲食建議", "rationale": "簡短解釋估算方式與不確定性"}`;
  const userPrompt = JSON.stringify({
    profile: {
      age: Number(profile.age),
      sex: profile.sex,
      height_cm: Number(profile.heightCm),
      weight_kg: Number(profile.weightKg),
      activity: profile.activity,
      goal: profile.goal,
    },
    baseline_estimate: {
      calories: baselineGoals.calories,
      protein_g: baselineGoals.protein,
      carbohydrates_g: baselineGoals.carbohydrates,
      fat_g: baselineGoals.fat,
    },
  });
  return callGemini(systemPrompt, userPrompt, apiKey);
}

