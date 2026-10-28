const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
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

function parseModelJson(content, provider = "AI") {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw new Error(`${provider} 沒有回傳分析結果。`);

  // Keep the client tolerant if a model adds a code fence despite JSON mode.
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch (error) {
    throw new Error(`${provider} 回傳的 JSON 無法讀取：${error.message}`);
  }
}

async function callDeepSeek(systemPrompt, userPrompt, apiKey) {
  let response;
  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
  } catch (error) {
    throw new Error(`無法連接 DeepSeek：${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`DeepSeek 回傳格式無效：${error.message}`);
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`DeepSeek 請求失敗（${response.status}）：${apiMessage}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  return parseModelJson(content, "DeepSeek");
}

async function callGemini(systemPrompt, userPrompt, apiKey, image = null) {
  const userParts = [{ text: userPrompt }];
  if (image) userParts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });

  let response;
  try {
    response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: userParts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
  } catch (error) {
    throw new Error(`無法連接 Gemini：${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Gemini 回傳格式無效：${error.message}`);
  }
  if (!response.ok) {
    const apiMessage = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`Gemini 請求失敗（${response.status}）：${apiMessage}`);
  }
  const content = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
  return parseModelJson(content, "Gemini");
}

/**
 * Ask the selected AI provider to estimate calories and macros for a user's food description.
 * The API key is supplied at runtime and is never bundled into this source.
 * DeepSeek's direct chat API is text-only, so an image must be described first.
 *
 * @param {string} userInput The food and drink description to analyze.
 * @param {string} apiKey Selected provider API key.
 * @param {object|null} profile Optional user profile and calorie goals.
 * @param {{mimeType: string, data: string}|null} image Optional photo.
 * @param {"deepseek"|"gemini"} provider AI provider, defaulting to DeepSeek.
 * @returns {Promise<object>} The parsed calorie analysis returned by the model.
 */
export async function analyzeFoodInput(userInput, apiKey, profile = null, image = null, provider = "deepseek") {
  const normalizedInput = typeof userInput === "string" ? userInput.trim() : "";
  if (!normalizedInput && !image) {
    throw new Error("請輸入食物內容。");
  }

  const selectedProvider = provider === "gemini" ? "gemini" : "deepseek";
  const providerLabel = selectedProvider === "gemini" ? "Gemini" : "DeepSeek";
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error(`請先輸入 ${providerLabel} API key。`);
  }

  if (image && (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) || typeof image.data !== "string" || !image.data)) {
    throw new Error("請使用 JPEG、PNG 或 WebP 食物照片。");
  }

  if (image && !normalizedInput && selectedProvider === "deepseek") {
    throw new Error("DeepSeek API 目前只支援文字；請在描述欄寫下照片中的食物和份量。");
  }

  const profileContext = Number(profile?.age) >= 18 && profile?.goals
    ? `\n\n用家每日目標：${profile.goals.calories} kcal；蛋白質 ${profile.goals.protein} g；目標：${profile.goal}。評語請參考用家目標。`
    : "";
  const prompt = image
    ? selectedProvider === "gemini"
      ? normalizedInput
        ? `請分析附上的食物照片，並結合用家描述「${normalizedInput}」判斷食物種類和份量，再估算每項的熱量和營養資料。`
        : "請辨識照片中所有食物及大概份量，估算每項的熱量和營養資料。"
      : `用家提供了一張食物照片作參考，以下是用家對照片的文字描述：「${normalizedInput}」。請只根據這段文字分析食物種類、份量和營養，不要假裝看見照片。`
    : normalizedInput;
  return selectedProvider === "gemini"
    ? callGemini(SYSTEM_PROMPT, `${prompt}${profileContext}`, apiKey, image)
    : callDeepSeek(SYSTEM_PROMPT, `${prompt}${profileContext}`, apiKey);
}

export async function analyzeUserProfile(profile, baselineGoals, apiKey, provider = "deepseek") {
  if (Number(profile?.age) < 18) {
    throw new Error("18 歲以下不使用 AI 個人目標分析。");
  }
  const selectedProvider = provider === "gemini" ? "gemini" : "deepseek";
  const providerLabel = selectedProvider === "gemini" ? "Gemini" : "DeepSeek";
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error(`請先輸入 ${providerLabel} API key。`);
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
  return selectedProvider === "gemini"
    ? callGemini(systemPrompt, userPrompt, apiKey)
    : callDeepSeek(systemPrompt, userPrompt, apiKey);
}
