import { analyzeFoodInput, analyzeUserProfile } from "./services/aiService.js";
import { calculateGoals } from "./services/nutritionService.js";

const STORAGE_KEY = "calomei-tracker-v1";
const API_KEY_STORAGE = "calomei-deepseek-key";
const PROFILE_STORAGE = "calomei-user-profile-v1";
const HK_TIME_ZONE = "Asia/Hong_Kong";
const MAX_FOOD_PHOTO_BYTES = 8 * 1024 * 1024;
const FOOD_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const defaultGoals = { calories: 2100, protein: 120, carbohydrates: 250, fat: 70 };

const presetAnalyses = {
  "菠蘿包": { calories: 290, protein: 6, carbohydrates: 43, fat: 11 },
  "凍奶茶": { calories: 180, protein: 5, carbohydrates: 25, fat: 7 },
  "叉燒飯": { calories: 760, protein: 31, carbohydrates: 93, fat: 28 },
  "車仔麵": { calories: 580, protein: 24, carbohydrates: 69, fat: 20 },
  "魚蛋": { calories: 160, protein: 10, carbohydrates: 13, fat: 7 },
  "蛋撻": { calories: 220, protein: 4, carbohydrates: 24, fat: 12 },
};

const foodIcons = ["utensils", "soup", "coffee", "salad"];
const mealNames = { breakfast: "早餐", lunch: "午餐", snack: "下午茶", dinner: "晚餐" };
const quickFoods = ["叉燒飯", "車仔麵", "凍奶茶", "菠蘿包", "魚蛋"];

const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: HK_TIME_ZONE,
  month: "long",
  day: "numeric",
  weekday: "short",
});
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const today = isoDateFormatter.format(new Date());
const prettyToday = dateFormatter.format(new Date());

const state = {
  activeView: "overview",
  entries: loadEntries(),
  profile: loadProfile(),
  apiKey: localStorage.getItem(API_KEY_STORAGE) || "",
  draft: "",
  foodPhoto: null,
  cameraOpen: false,
  cameraLoading: false,
  cameraStream: null,
  cameraError: "",
  foodReview: null,
  meal: "lunch",
  filter: "all",
  loading: false,
  onboardingLoading: false,
  settingsOpen: false,
  toast: null,
};
let settingsReturnFocus = "";
let previousSettingsOpen = false;

function offsetDate(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function loadProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_STORAGE));
    return profile && profile.goals ? profile : null;
  } catch {
    return null;
  }
}

function currentGoals() { return state.profile?.goals || defaultGoals; }

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function round(value) { return Math.round(Number(value) || 0); }
function sum(entries, key) { return entries.reduce((total, entry) => total + Number(entry[key] || 0), 0); }
function todaysEntries() { return state.entries.filter((entry) => entry.date === today); }
function totals(entries = todaysEntries()) {
  return {
    calories: sum(entries, "calories"),
    protein: sum(entries, "protein"),
    carbohydrates: sum(entries, "carbohydrates"),
    fat: sum(entries, "fat"),
  };
}
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(round(value)); }
function percent(value, goal) { return Math.min(100, Math.max(0, (Number(value) / goal) * 100)); }
function timeLabel(time) { return time || "剛剛"; }

function mockAnalyze(input) {
  const found = Object.entries(presetAnalyses).filter(([name]) => input.includes(name));
  const items = found.length ? found : [["自選香港餐點", { calories: 520, protein: 21, carbohydrates: 58, fat: 20 }]];
  const foodItems = items.map(([name, values]) => ({ name, ...values }));
  const total = foodItems.reduce((acc, item) => ({
    calories: acc.calories + item.calories,
    protein: acc.protein + item.protein,
    carbohydrates: acc.carbohydrates + item.carbohydrates,
    fat: acc.fat + item.fat,
  }), { calories: 0, protein: 0, carbohydrates: 0, fat: 0 });
  return {
    food_items: foodItems,
    total_calories: total.calories,
    total_protein: total.protein,
    total_carbohydrates: total.carbohydrates,
    total_fat: total.fat,
    ai_comment: found.length ? "呢餐估算完成。份量唔算細，但有記錄就有得調整，唔好靠意志力裸奔。" : "我先用香港常見份量幫你估算，落次講埋份量會準好多，唔好畀我靠估。",
  };
}

function dailyHistory() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = offsetDate(today, index - 6);
    const dayEntries = state.entries.filter((entry) => entry.date === date);
    return { date, calories: sum(dayEntries, "calories"), protein: sum(dayEntries, "protein"), label: new Intl.DateTimeFormat("zh-HK", { timeZone: HK_TIME_ZONE, weekday: "short" }).format(new Date(`${date}T12:00:00Z`)).replace("週", "") };
  });
}

function shell() {
  const nav = [
    ["overview", "首頁", "house"],
    ["trends", "趨勢", "chart-no-axes-combined"],
    ["log", "記錄", "clipboard-list"],
  ];
  return `
    <div class="app-shell">
      <a class="skip-link" href="#content">跳到主要內容</a>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">老</div>
          <div class="brand-copy"><span class="brand-name">卡老味 AI</span><span class="brand-sub">香港飲食記錄</span></div>
        </div>
        <div class="nav-label">導覽</div>
        <nav class="nav" aria-label="主選單">
          ${nav.map(([view, label, icon]) => `<button class="nav-button ${state.activeView === view ? "active" : ""}" data-action="view" data-view="${view}" aria-current="${state.activeView === view ? "page" : "false"}"><i data-lucide="${icon}"></i><span>${label}</span></button>`).join("")}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-foot"><span>香港時區 · Asia/Hong_Kong</span></div>
      </aside>
      <main id="main-content" class="main">
        <header class="topbar"><div class="crumb"><strong>${state.profile ? `你好，${escapeHtml(state.profile.name || "朋友")}` : "個人化設定"}</strong><i data-lucide="chevron-right"></i><span>${state.profile ? viewLabel() : "首次使用"}</span></div><div class="top-actions"><span class="date-chip"><i data-lucide="calendar-days"></i>${escapeHtml(prettyToday)}</span><button class="icon-button" data-action="settings" aria-label="設定" title="設定"><i data-lucide="settings-2"></i></button><span class="avatar" aria-label="使用者帳戶">${escapeHtml((state.profile?.name || "W").slice(0, 1).toUpperCase())}</span></div></header>
        <div id="content" class="content">${state.profile ? content() : onboardingView()}</div>
      </main>
      ${state.settingsOpen ? settingsDialog() : ""}
      ${state.cameraOpen ? cameraDialog() : ""}
      ${toastMarkup()}
    </div>`;
}

function toastMarkup(toast = state.toast) {
  return toast ? `<div class="toast ${toast.type}" role="${toast.type === "error" ? "alert" : "status"}"><i data-lucide="${toast.type === "error" ? "circle-alert" : "circle-check"}"></i><span>${escapeHtml(toast.message)}</span>${toast.action ? `<button class="toast-action" type="button" data-action="toast-action">${escapeHtml(toast.action.label)}</button>` : ""}</div>` : "";
}

function profileFields(profile = {}) {
  const age = Number(profile.age);
  const isYouth = age >= 6 && age < 18;
  const goal = isYouth ? "maintain" : profile.goal || "maintain";
  return `<div class="profile-form-grid">
    <label class="form-field"><span>稱呼</span><input name="name" type="text" maxlength="30" value="${escapeHtml(profile.name || "")}" placeholder="例如：阿明" /></label>
    <label class="form-field"><span>年齡</span><input name="age" type="number" min="6" max="100" required value="${escapeHtml(profile.age || "")}" placeholder="歲" /></label>
    <label class="form-field"><span>生理性別</span><select name="sex" required><option value="female" ${profile.sex !== "male" ? "selected" : ""}>女性</option><option value="male" ${profile.sex === "male" ? "selected" : ""}>男性</option></select></label>
    <label class="form-field"><span>身高</span><input name="heightCm" type="number" min="100" max="230" required value="${escapeHtml(profile.heightCm || "")}" placeholder="cm" /></label>
    <label class="form-field"><span>體重</span><input name="weightKg" type="number" min="15" max="300" step="0.1" required value="${escapeHtml(profile.weightKg || "")}" placeholder="kg" /></label>
    <label class="form-field"><span>日常活動量</span><select name="activity" required><option value="sedentary" ${profile.activity === "sedentary" ? "selected" : ""}>少運動，久坐為主</option><option value="light" ${profile.activity === "light" || !profile.activity ? "selected" : ""}>每週輕量活動 1–3 日</option><option value="moderate" ${profile.activity === "moderate" ? "selected" : ""}>每週中量活動 3–5 日</option><option value="active" ${profile.activity === "active" ? "selected" : ""}>每週高強度活動 6–7 日</option><option value="very" ${profile.activity === "very" ? "selected" : ""}>體力工作或高強度訓練</option></select></label>
    <label class="form-field full"><span>目前目標</span><select name="goal" required><option value="lose" ${goal === "lose" ? "selected" : ""} ${isYouth ? "disabled" : ""}>減脂 · 溫和熱量赤字</option><option value="maintain" ${goal === "maintain" ? "selected" : ""}>維持體重</option><option value="gain" ${goal === "gain" ? "selected" : ""} ${isYouth ? "disabled" : ""}>增肌 · 溫和熱量盈餘</option></select></label>
  </div>`;
}

function syncAgeGoalOptions(form) {
  const age = Number(form.elements.namedItem("age")?.value);
  const goal = form.elements.namedItem("goal");
  if (!goal) return;
  const isYouth = age >= 6 && age < 18;
  for (const option of goal.options) {
    if (option.value !== "maintain") option.disabled = isYouth;
  }
  if (isYouth) goal.value = "maintain";
}

function onboardingView() {
  return `<section class="onboarding-wrap"><div class="onboarding-intro"><p class="eyebrow">每日攝取計劃</p><h1>先認識你，<br />再計啱你食幾多。</h1><p class="lede">提供基本資料，先估算每日能量需要，再按你的目標安排營養比例。</p><div class="privacy-note"><i data-lucide="shield-check"></i><span>資料保存在此瀏覽器。成年人使用 DeepSeek 個人化目標時，基本資料會傳送至 DeepSeek；6–17 歲只在本機估算。分析食物描述亦會傳送至 DeepSeek。</span></div></div><form id="onboardingForm" class="panel onboarding-form"><div class="panel-header"><h2 class="panel-title"><i data-lucide="user-round"></i>你的基本資料</h2><span class="panel-meta">約 1 分鐘</span></div><div class="onboarding-fields">${profileFields()}</div><div class="form-disclaimer">熱量是一般估算，並非醫療建議。6–17 歲會採用成長期估算，不提供減脂或增重目標，請由家長／監護人協助；有特殊健康狀況請先諮詢醫護專業人士。</div><button class="button primary onboarding-submit" type="submit" ${state.onboardingLoading ? "disabled" : ""}><i data-lucide="${state.onboardingLoading ? "loader-circle" : "sparkles"}" class="${state.onboardingLoading ? "spin" : ""}"></i>${state.onboardingLoading ? "正在整理個人計劃..." : "計算我的每日目標"}</button></form></section>`;
}

function settingsDialog() {
  const keyPlaceholder = state.apiKey ? "輸入新 key 以取代已儲存的 key" : "貼上你自己的 DeepSeek key";
  return `<div class="modal-backdrop" data-action="close-settings"><section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle" tabindex="-1"><div class="modal-head"><div><p class="eyebrow">設定</p><h2 id="settingsTitle">設定與個人資料</h2></div><button class="icon-button" data-action="close-settings" aria-label="關閉設定"><i data-lucide="x"></i></button></div><div class="settings-section"><div class="settings-section-head"><div><h3>DeepSeek AI</h3><p>${state.apiKey ? "key 已儲存在此瀏覽器" : "使用你自己的 DeepSeek API key"}</p></div><span class="api-status ${state.apiKey ? "connected" : ""}">${state.apiKey ? "已連接" : "未連接"}</span></div><label class="form-field"><span>DeepSeek API key</span><input id="apiKeyInput" type="password" placeholder="${keyPlaceholder}" autocomplete="new-password" /></label><p class="api-hint">飲食描述與成年人的個人目標分析會傳送至 DeepSeek；記錄和未成年人的基本資料留在此瀏覽器。DeepSeek 直接 API 目前只支援文字，照片需先配合文字描述。GitHub Pages 是公開網站，請勿把 key 寫進程式碼。<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">管理 API key</a></p><div class="api-actions"><button class="button" data-action="save-api-key"><i data-lucide="save"></i>${state.apiKey ? "更新 API key" : "儲存 API key"}</button>${state.apiKey ? `<button class="button ghost danger" data-action="clear-api-key"><i data-lucide="key-round"></i>移除已存 key</button>` : ""}</div></div><div class="settings-section"><div class="settings-section-head"><div><h3>每日目標</h3><p>更新資料後會重新估算攝取目標。</p></div></div><form id="profileEditForm">${profileFields(state.profile || {})}<button class="button primary" type="submit"><i data-lucide="calculator"></i>更新個人目標</button></form></div><div class="modal-foot"><button class="button danger" data-action="reset-profile"><i data-lucide="rotate-ccw"></i>重設個人資料</button><button class="button ghost" data-action="close-settings">完成</button></div></section></div>`;
}

function cameraDialog() {
  return `<div class="modal-backdrop" data-action="close-camera"><section class="modal-panel camera-panel" role="dialog" aria-modal="true" aria-labelledby="cameraTitle" tabindex="-1"><div class="modal-head"><div><p class="eyebrow">食物照片</p><h2 id="cameraTitle">${state.cameraError ? "相機無法使用" : "拍攝食物"}</h2></div><button class="icon-button" data-action="close-camera" aria-label="關閉相機"><i data-lucide="x"></i></button></div><div class="camera-body">${state.cameraError ? `<p class="camera-error" role="alert">${escapeHtml(state.cameraError)}</p>` : `<video id="cameraPreview" autoplay playsinline muted aria-label="相機即時預覽"></video>`}<p class="camera-note">照片可幫你記住餐點；DeepSeek 目前只分析文字，拍照後請在描述欄寫下食物和份量。</p><div class="camera-actions"><button class="button ghost" data-action="close-camera">取消</button>${state.cameraError ? `<button class="button primary" data-action="pick-photo"><i data-lucide="images"></i>從相簿選擇</button>` : `<button class="button primary" data-action="capture-camera" ${state.cameraStream ? "" : "disabled"}><i data-lucide="camera"></i>${state.cameraLoading ? "正在開啟相機..." : "拍下照片"}</button>`}</div></div></section></div>`;
}

function viewLabel() { return state.activeView === "overview" ? "今日總覽" : state.activeView === "trends" ? "趨勢分析" : "飲食記錄"; }

function content() {
  if (state.activeView === "trends") return trendsView();
  if (state.activeView === "log") return logView();
  return overviewView();
}

function pageHeading(eyebrow, title, lede, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lede">${lede}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ""}</div>`;
}

function overviewView() {
  const total = totals();
  const goals = currentGoals();
  const remaining = goals.calories - total.calories;
  const progress = percent(total.calories, goals.calories);
  const hasRecentEntries = dailyHistory().some((day) => day.calories > 0);
  const action = `<button class="button ghost" data-action="clear-data"><i data-lucide="trash-2"></i>清除今日記錄</button>`;
  return `${pageHeading("每日攝取", "今日，食咗幾多？", "記低茶餐廳、街市同屋企餐，一眼睇清今日攝取。", action)}
    <div class="stats-grid">
      ${statCard("今日熱量", formatNumber(total.calories), "kcal", `${formatNumber(remaining)} kcal 彈性空間`, "flame", remaining >= 0 ? "good" : "warn")}
      ${statCard("蛋白質", formatNumber(total.protein), "g", `目標 ${goals.protein} g`, "beef", total.protein >= goals.protein * .7 ? "good" : "")}
      ${statCard("碳水化合物", formatNumber(total.carbohydrates), "g", `目標 ${goals.carbohydrates} g`, "wheat", "")}
      ${statCard("脂肪", formatNumber(total.fat), "g", `目標 ${goals.fat} g`, "droplets", total.fat > goals.fat ? "warn" : "")}
    </div>
    <div class="main-grid"><section class="panel intake-panel">${intakePanel()}</section><section class="panel ring-panel">${ringPanel(total, progress, remaining)}</section></div>
    ${state.foodReview ? reviewPanel() : ""}
    <div class="bottom-grid ${hasRecentEntries ? "" : "single"}">${hasRecentEntries ? `<section class="panel chart-panel">${weekChart()}</section>` : ""}<section class="panel insight-panel">${insights(total)}</section></div>
    <section class="panel recent-panel">${recentPanel()}</section>
    <section class="panel repeat-panel">${repeatFoodsPanel()}</section>`;
}

function statCard(label, value, unit, note, icon, tone) {
  return `<article class="stat-card"><div class="stat-head"><span>${label}</span><i data-lucide="${icon}"></i></div><div class="stat-value">${value}<span>${unit}</span></div><div class="stat-note ${tone}">${note}</div></article>`;
}

function intakePanel() {
  const disabled = state.loading || state.foodReview ? "disabled" : "";
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="message-circle-more"></i>記錄一餐</h2><span class="panel-meta">${state.apiKey ? "DeepSeek AI" : "快速試算"}</span></div>
    <div class="intake-body"><label class="input-label" for="foodInput">可以輸入描述、加入照片，或兩者一齊；份量越清楚越準</label><textarea id="foodInput" class="food-input" placeholder="例如：相中係少飯叉燒飯，走汁，加杯凍奶茶" ${disabled}>${escapeHtml(state.draft)}</textarea>
    <div class="photo-input-row"><button class="button photo-pick-button" type="button" data-action="pick-camera" ${disabled}><i data-lucide="camera"></i>拍攝照片</button><button class="button photo-pick-button" type="button" data-action="pick-photo" ${disabled}><i data-lucide="images"></i>${state.foodPhoto ? "更換照片" : "從相簿選擇"}</button><span class="photo-hint">DeepSeek 只讀文字；照片請配合描述 · 最多 8 MB</span><input id="foodPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden ${disabled} /><input id="foodCameraInput" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden ${disabled} /></div>
    ${state.foodPhoto ? `<div class="photo-preview"><img src="${escapeHtml(state.foodPhoto.previewUrl)}" alt="食物照片預覽"><div class="photo-preview-copy"><strong>${escapeHtml(state.foodPhoto.name)}</strong><small>照片只作參考；請在上方補充食物和份量描述</small></div><button class="icon-button photo-remove-button" type="button" data-action="remove-photo" aria-label="移除食物照片" title="移除照片" ${disabled}><i data-lucide="x"></i></button></div>` : ""}
    <div class="quick-row"><span class="quick-label">一鍵試食：</span>${quickFoods.map((food) => `<button class="quick-chip" data-action="quick-food" data-food="${food}" ${disabled}>${food}</button>`).join("")}</div>
    <div class="intake-footer"><span class="mode-note"><span class="mode-dot ${state.apiKey ? "connected" : ""}"></span>${state.foodReview ? "核對預覽後才會加入記錄" : state.foodPhoto && !state.draft.trim() ? "照片請配合文字描述" : state.apiKey ? "文字描述會傳送至 DeepSeek" : "Demo 估算不會分析照片"}</span><div class="intake-actions"><select id="mealSelect" class="meal-select" aria-label="選擇餐段" ${disabled}>${Object.entries(mealNames).map(([value, label]) => `<option value="${value}" ${state.meal === value ? "selected" : ""}>${label}</option>`).join("")}</select><button class="button primary" data-action="analyze" ${disabled}><i data-lucide="${state.loading ? "loader-circle" : "sparkles"}" class="${state.loading ? "spin" : ""}"></i>${state.loading ? "分析中..." : state.foodReview ? "先確認下方預覽" : "估算熱量"}</button></div></div></div>`;
}

function reviewPanel() {
  const review = state.foodReview;
  const totalCalories = sum(review.items, "calories");
  return `<section class="panel review-panel" aria-labelledby="reviewTitle"><div class="review-header"><div><p class="eyebrow">AI 估算 · 待核對</p><h2 id="reviewTitle">確認這餐</h2><p class="review-subtitle">${mealNames[review.meal]} · 修改熱量後才會加入記錄</p></div><div class="review-total"><strong data-review-total aria-live="polite">${formatNumber(totalCalories)}</strong><span>kcal 合計</span></div></div>
    ${review.comment ? `<p class="review-comment"><i data-lucide="message-square-quote"></i>${escapeHtml(review.comment)}</p>` : ""}
    <div class="review-list">${review.items.map((item, index) => `<div class="review-row"><div class="review-food-copy"><strong>${escapeHtml(item.name)}</strong><small>蛋白質 ${formatNumber(item.protein)} g · 碳水 ${formatNumber(item.carbohydrates)} g · 脂肪 ${formatNumber(item.fat)} g</small></div><label class="review-calorie-field"><span>熱量</span><span class="review-calorie-control"><input type="number" min="0" max="9999" step="1" value="${round(item.calories)}" data-review-calories data-review-index="${index}" aria-label="${escapeHtml(item.name)} 熱量（千卡）"><span>kcal</span></span></label><div class="review-row-actions"><button class="button review-single-button" data-action="save-review-food" data-review-index="${index}"><i data-lucide="plus"></i>記錄此項</button><button class="icon-button review-remove-button" type="button" data-action="remove-review-food" data-review-index="${index}" aria-label="從預覽刪除 ${escapeHtml(item.name)}" title="刪除此項"><i data-lucide="trash-2"></i></button></div></div>`).join("")}</div>
    <div class="review-footer"><button class="button ghost" data-action="cancel-review"><i data-lucide="pencil"></i>取消預覽並修改</button><button class="button primary" data-action="save-all-review"><i data-lucide="check"></i>確認並記錄全部 · <span data-review-confirm-total>${formatNumber(totalCalories)}</span> kcal</button></div></section>`;
}

function ringPanel(total, progress, remaining) {
  const goals = currentGoals();
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="target"></i>今日目標</h2><span class="panel-meta">${progress.toFixed(0)}% used</span></div><div class="ring-wrap"><div class="ring" style="--progress: ${progress}%"><div class="ring-center"><span class="ring-value">${formatNumber(total.calories)}</span><span class="ring-unit">/ ${formatNumber(goals.calories)} kcal</span></div></div><div class="ring-copy"><div class="ring-caption">${remaining >= 0 ? "仲有幾多位？" : "今日有少少超速"}<strong>${remaining >= 0 ? `${formatNumber(remaining)} kcal` : `+${formatNumber(Math.abs(remaining))} kcal`}</strong></div><div class="mini-key"><span class="key-line"><i class="key-dot lime"></i>已記錄</span><span class="key-line"><i class="key-dot blue"></i>建議攝取</span><span class="key-line"><i class="key-dot orange"></i>超出目標</span></div></div></div><div class="macro-row">${macroLine("蛋白質", total.protein, goals.protein, "var(--sky)", "g")}${macroLine("碳水", total.carbohydrates, goals.carbohydrates, "var(--lime)", "g")}${macroLine("脂肪", total.fat, goals.fat, "var(--coral)", "g")}</div>`;
}

function macroLine(label, value, goal, color, unit) { return `<div class="macro-line"><span class="macro-name">${label}</span><span class="macro-track"><span class="macro-fill" style="width:${percent(value, goal)}%;background:${color}"></span></span><span class="macro-number">${round(value)}${unit}</span></div>`; }

function weekChart() {
  const history = dailyHistory();
  const goals = currentGoals();
  const max = Math.max(goals.calories, ...history.map((day) => day.calories));
  const accessibleSummary = history.map((day) => `${day.label} ${formatNumber(day.calories)} 千卡`).join("、");
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="bar-chart-3"></i>近七日攝取</h2><span class="panel-meta">目標 ${formatNumber(goals.calories)} kcal / 日</span></div><div class="chart" role="img" aria-label="近七日熱量柱狀圖：${accessibleSummary}">${history.map((day) => `<div class="bar-col"><div class="bar-area"><span class="bar ${day.calories > goals.calories ? "over" : ""} ${day.date === today ? "today" : ""}" style="height:${Math.max(5, (day.calories / max) * 100)}%" title="${formatNumber(day.calories)} kcal"></span></div><span class="bar-day">${escapeHtml(day.label)}</span></div>`).join("")}</div><div class="chart-legend"><span class="legend-item"><i class="legend-swatch"></i>熱量 kcal</span><span class="legend-item"><i class="legend-swatch over"></i>高於每日目標</span></div>`;
}

function insights(total) {
  const goals = currentGoals();
  const remaining = goals.calories - total.calories;
  const proteinGap = Math.max(0, goals.protein - total.protein);
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="notebook-pen"></i>今日飲食提示</h2><span class="panel-meta">${state.profile?.aiAdvice ? "個人化建議" : "每日提示"}</span></div><div class="insight-body"><div class="insight-lead"><i data-lucide="message-square-quote"></i><p>${escapeHtml(state.profile?.aiAdvice || (remaining >= 0 ? `仲有 ${formatNumber(remaining)} kcal 空間，今晚可以照常食，份量記清楚就得。` : `今日超出 ${formatNumber(Math.abs(remaining))} kcal，唔使聽日絕食；恢復平常飲食就可以。`))}</p></div><div class="insight-list"><div class="insight-item"><i data-lucide="plus"></i><span><strong>蛋白質差 ${formatNumber(proteinGap)} g</strong> · 下一餐可加雞蛋、豆腐或雞肉。</span></div><div class="insight-item"><i data-lucide="clock-3"></i><span><strong>下一餐</strong> · 半碗飯配兩份菜，按飽足感調整份量。</span></div><div class="insight-item"><i data-lucide="footprints"></i><span><strong>活動建議</strong> · 飯後散步 10 至 15 分鐘。</span></div></div></div>`;
}

function recentPanel() {
  const entries = todaysEntries().sort((a, b) => b.time.localeCompare(a.time));
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="clock-4"></i>今日記錄</h2><button class="button ghost" data-action="view" data-view="log">查看全部 <i data-lucide="arrow-up-right"></i></button></div><div class="recent-list">${entries.length ? entries.slice(0, 4).map(foodRow).join("") : `<div class="empty-state">今日仲未有記錄，輸入第一餐啦。</div>`}</div>`;
}

function repeatFoodsPanel() {
  const seenNames = new Set();
  const latestFoods = [...state.entries]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .filter((entry) => {
      if (seenNames.has(entry.name)) return false;
      seenNames.add(entry.name);
      return true;
    })
    .slice(0, 6);
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="history"></i>曾經食過</h2><span class="panel-meta">點一下直接記錄到${mealNames[state.meal]}</span></div>${latestFoods.length ? `<div class="repeat-grid">${latestFoods.map((entry) => `<button class="repeat-food-button" data-action="repeat-food" data-entry-id="${escapeHtml(entry.id)}" aria-label="再次記錄 ${escapeHtml(entry.name)}，${formatNumber(entry.calories)} 千卡"><span class="repeat-food-copy"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.date)} · ${formatNumber(entry.calories)} kcal</small></span><i data-lucide="plus"></i></button>`).join("")}</div>` : `<div class="empty-state">你記錄過的食物會出現在這裡，之後可一按重記。</div>`}`;
}

function foodRow(entry) {
  const icon = foodIcons[Math.abs(entry.name.length) % foodIcons.length];
  return `<div class="food-row"><span class="food-icon"><i data-lucide="${icon}"></i></span><div><p class="food-name">${escapeHtml(entry.name)}</p><span class="food-meta">${mealNames[entry.meal] || "餐點"} · ${timeLabel(entry.time)}</span></div><span class="food-kcal">${formatNumber(entry.calories)}<small>kcal</small></span><button class="delete-button" data-action="delete" data-id="${entry.id}" aria-label="刪除 ${escapeHtml(entry.name)}"><i data-lucide="x"></i></button></div>`;
}

function trendsView() {
  const history = dailyHistory();
  const goals = currentGoals();
  const weekEntries = state.entries.filter((entry) => history.some((day) => day.date === entry.date));
  const hasRecentEntries = weekEntries.some((entry) => Number(entry.calories) > 0);
  if (!hasRecentEntries) {
    return `${pageHeading("過去七日", "睇清一週攝取走勢。", "記錄餐點後，這裡會顯示最近七日的攝取。", "")}<section class="panel trend-empty"><i data-lucide="chart-no-axes-column-increasing"></i><h2>還未有七日記錄</h2><p>記錄第一餐後，熱量走勢和營養比例會在這裡整理出來。</p><button class="button primary" data-action="view" data-view="overview"><i data-lucide="plus"></i>記錄第一餐</button></section>`;
  }
  const average = weekEntries.length ? sum(weekEntries, "calories") / 7 : 0;
  const onTrack = history.filter((day) => day.calories > 0 && day.calories <= goals.calories).length;
  const max = Math.max(goals.calories, ...history.map((day) => day.calories));
  const accessibleSummary = history.map((day) => `${day.label} ${formatNumber(day.calories)} 千卡`).join("、");
  return `${pageHeading("過去七日", "睇清一週攝取走勢。", "把每日記錄放在一起看，找出可持續的飲食節奏。", `<button class="button primary" data-action="view" data-view="overview"><i data-lucide="plus"></i>記錄一餐</button>`)}<div class="trend-grid"><section class="panel trend-chart"><div class="panel-header"><h2 class="panel-title"><i data-lucide="activity"></i>每日熱量</h2><span class="panel-meta">${onTrack}/7 日在目標內</span></div><div class="trend-bars" role="img" aria-label="每日熱量柱狀圖（目標 ${formatNumber(goals.calories)} 千卡，紅色表示超出）：${accessibleSummary}">${history.map((day) => `<div class="trend-bar-col"><span class="trend-bar-value">${day.calories ? formatNumber(day.calories) : "—"}</span><div class="trend-bar-track"><span class="trend-bar-fill ${day.calories > goals.calories ? "over" : ""}" style="height:${day.calories ? Math.max(5, day.calories / max * 100) : 5}%"></span></div><span class="trend-bar-label">${escapeHtml(day.label)}</span></div>`).join("")}</div><div class="trend-summary"><div class="summary-line"><span>日均攝取</span><strong>${formatNumber(average)} kcal</strong></div><div class="summary-line"><span>平均蛋白質</span><strong>${formatNumber(sum(weekEntries, "protein") / 7)} g</strong></div><div class="summary-line"><span>最接近目標的一日</span><strong class="good">${history.filter((day) => day.calories > 0).sort((a,b) => Math.abs(a.calories - goals.calories) - Math.abs(b.calories - goals.calories))[0]?.label || "—"}</strong></div></div></section><section class="panel weekly-panel">${weeklyMacros(weekEntries)}</section></div>`;
}

function weeklyMacros(entries) {
  const totalsWeek = totals(entries);
  const proteinCalories = totalsWeek.protein * 4;
  const carbCalories = totalsWeek.carbohydrates * 4;
  const fatCalories = totalsWeek.fat * 9;
  const macroCalories = proteinCalories + carbCalories + fatCalories;
  const proteinPct = macroCalories ? proteinCalories / macroCalories * 100 : 0;
  const carbPct = macroCalories ? carbCalories / macroCalories * 100 : 0;
  return `<div class="panel-header"><h2 class="panel-title"><i data-lucide="pie-chart"></i>一週營養比例</h2><span class="panel-meta">按熱量估算</span></div><div class="weekly-body"><div class="donut-wrap"><div class="donut" role="img" aria-label="一週營養熱量比例：蛋白質 ${proteinPct.toFixed(0)}%、碳水 ${carbPct.toFixed(0)}%、脂肪 ${Math.max(0, 100 - proteinPct - carbPct).toFixed(0)}%" style="background:conic-gradient(var(--lime) 0 ${proteinPct}%, var(--sky) ${proteinPct}% ${proteinPct + carbPct}%, var(--chart-neutral) ${proteinPct + carbPct}% 100%)"><div class="donut-center"><strong>${formatNumber(totalsWeek.calories)}</strong><span>一週 kcal</span></div></div></div><div class="macro-legend"><div class="macro-legend-row"><span class="macro-legend-name"><i style="background:var(--lime)"></i>蛋白質</span><strong>${formatNumber(totalsWeek.protein)} g</strong></div><div class="macro-legend-row"><span class="macro-legend-name"><i style="background:var(--sky)"></i>碳水</span><strong>${formatNumber(totalsWeek.carbohydrates)} g</strong></div><div class="macro-legend-row"><span class="macro-legend-name"><i style="background:var(--chart-neutral)"></i>脂肪</span><strong>${formatNumber(totalsWeek.fat)} g</strong></div></div></div>`;
}

function logView() {
  const filters = [["all", "全部"], ...Object.entries(mealNames)];
  const entries = state.entries.filter((entry) => state.filter === "all" || entry.meal === state.filter).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return `${pageHeading("飲食記錄", "每一餐，都有跡可尋。", "記錄只保存在此瀏覽器，重開網頁也能接著查看。", `<button class="button primary" data-action="view" data-view="overview"><i data-lucide="plus"></i>記錄一餐</button>`)}<section class="panel log-panel"><div class="panel-header"><h2 class="panel-title"><i data-lucide="list-filter"></i>所有餐點</h2><span class="panel-meta">${entries.length} 筆</span></div><div class="filter-row" role="group" aria-label="按餐段篩選">${filters.map(([value, label]) => `<button class="filter-button ${state.filter === value ? "active" : ""}" data-action="filter" data-filter="${value}" aria-pressed="${state.filter === value}">${label}</button>`).join("")}</div><div class="log-head"><span>食物</span><span>餐段</span><span>時間</span><span>熱量</span><span></span></div>${entries.length ? entries.map((entry) => `<div class="log-row"><span><strong>${escapeHtml(entry.name)}</strong><small class="food-meta">${escapeHtml(entry.date)}</small></span><span>${mealNames[entry.meal] || "餐點"}</span><span>${timeLabel(entry.time)}</span><span class="log-kcal">${formatNumber(entry.calories)} kcal</span><button class="delete-button" data-action="delete" data-id="${entry.id}" aria-label="刪除 ${escapeHtml(entry.name)}"><i data-lucide="trash-2"></i></button></div>`).join("") : `<div class="empty-state">${state.filter === "all" ? "還未有飲食記錄，記下第一餐吧。" : "這個餐段暫時沒有記錄。"}</div>`}</section>`;
}

function render() {
  const wasSettingsOpen = previousSettingsOpen;
  previousSettingsOpen = state.settingsOpen;
  document.querySelector("#app").innerHTML = shell();
  if (window.lucide) window.lucide.createIcons();
  bindEvents();
  if (state.settingsOpen && !wasSettingsOpen) {
    requestAnimationFrame(() => document.querySelector(".modal-panel [data-action='close-settings']")?.focus());
  } else if (wasSettingsOpen && !state.settingsOpen && settingsReturnFocus) {
    const returnFocus = settingsReturnFocus;
    settingsReturnFocus = "";
    requestAnimationFrame(() => document.querySelector(returnFocus)?.focus());
  }
}

function bindEvents() {
  document.querySelectorAll("[data-action='view']").forEach((button) => button.addEventListener("click", () => { state.activeView = button.dataset.view; state.filter = "all"; render(); }));
  document.querySelector("[data-action='settings']")?.addEventListener("click", () => {
    openSettings("[data-action='settings']");
  });
  document.querySelectorAll("[data-action='close-settings']").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target === event.currentTarget || event.currentTarget.tagName === "BUTTON") closeSettings();
  }));
  document.querySelectorAll("[data-action='close-camera']").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target === event.currentTarget || event.currentTarget.tagName === "BUTTON") closeCamera();
  }));
  document.querySelector(".app-shell")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-action='toast-action']")) return;
    const action = state.toast?.action?.run;
    state.toast = null;
    document.querySelector(".app-shell .toast")?.remove();
    action?.();
  });
  document.querySelectorAll(".modal-panel").forEach((panel) => panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      panel.classList.contains("camera-panel") ? closeCamera() : closeSettings();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }));
  document.querySelectorAll("form").forEach((form) => {
    const ageInput = form.elements.namedItem("age");
    if (!ageInput) return;
    ageInput.addEventListener("input", () => syncAgeGoalOptions(form));
    syncAgeGoalOptions(form);
  });
  document.querySelector("#onboardingForm")?.addEventListener("submit", (event) => { event.preventDefault(); saveProfileFromForm(event.currentTarget); });
  document.querySelector("#profileEditForm")?.addEventListener("submit", (event) => { event.preventDefault(); saveProfileFromForm(event.currentTarget); });
  document.querySelector("[data-action='save-api-key']")?.addEventListener("click", saveApiKey);
  document.querySelector("[data-action='clear-api-key']")?.addEventListener("click", clearApiKey);
  document.querySelector("[data-action='reset-profile']")?.addEventListener("click", () => {
    if (!window.confirm("確定清除個人資料並重新開始？")) return;
    localStorage.removeItem(PROFILE_STORAGE);
    state.profile = null;
    state.settingsOpen = false;
    state.activeView = "overview";
    render();
  });
  document.querySelectorAll("[data-action='quick-food']").forEach((button) => button.addEventListener("click", () => { const input = document.querySelector("#foodInput"); if (input) { input.value = input.value ? `${input.value}、${button.dataset.food}` : button.dataset.food; input.focus(); } }));
  document.querySelector("[data-action='pick-photo']")?.addEventListener("click", () => document.querySelector("#foodPhotoInput")?.click());
  document.querySelector("[data-action='pick-camera']")?.addEventListener("click", openCamera);
  document.querySelector("[data-action='capture-camera']")?.addEventListener("click", captureCameraPhoto);
  document.querySelector("[data-action='remove-photo']")?.addEventListener("click", () => { state.foodPhoto = null; render(); });
  document.querySelector("#foodPhotoInput")?.addEventListener("change", handleFoodPhoto);
  document.querySelector("#foodCameraInput")?.addEventListener("change", handleFoodPhoto);
  document.querySelectorAll("[data-action='delete']").forEach((button) => button.addEventListener("click", () => {
    const deletedEntry = state.entries.find((entry) => String(entry.id) === button.dataset.id);
    if (!deletedEntry) return;
    state.entries = state.entries.filter((entry) => String(entry.id) !== button.dataset.id);
    saveEntries();
    showToast("已刪除呢項記錄", "success", {
      label: "復原",
      run: () => {
        state.entries.push(deletedEntry);
        saveEntries();
        render();
        showToast("飲食記錄已復原", "success");
      },
    });
    render();
  }));
  document.querySelectorAll("[data-action='repeat-food']").forEach((button) => button.addEventListener("click", () => repeatFood(button.dataset.entryId)));
  document.querySelectorAll("[data-action='save-review-food']").forEach((button) => button.addEventListener("click", () => saveReviewFood(Number(button.dataset.reviewIndex))));
  document.querySelectorAll("[data-action='remove-review-food']").forEach((button) => button.addEventListener("click", () => removeReviewFood(Number(button.dataset.reviewIndex))));
  document.querySelector("[data-action='save-all-review']")?.addEventListener("click", saveAllReviewedFoods);
  document.querySelector("[data-action='cancel-review']")?.addEventListener("click", () => { state.foodReview = null; render(); });
  document.querySelectorAll("[data-action='filter']").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; render(); }));
  document.querySelectorAll("[data-review-calories]").forEach((input) => input.addEventListener("input", (event) => {
    const item = state.foodReview?.items[Number(event.currentTarget.dataset.reviewIndex)];
    if (!item) return;
    item.calories = Math.max(0, Math.min(9999, Number(event.currentTarget.value) || 0));
    const formattedTotal = formatNumber(sum(state.foodReview.items, "calories"));
    const total = document.querySelector("[data-review-total]");
    if (total) total.textContent = formattedTotal;
    const confirmTotal = document.querySelector("[data-review-confirm-total]");
    if (confirmTotal) confirmTotal.textContent = formattedTotal;
  }));
  document.querySelector("#foodInput")?.addEventListener("input", (event) => { state.draft = event.target.value; });
  document.querySelector("#mealSelect")?.addEventListener("change", (event) => { state.meal = event.target.value; });
  document.querySelector("[data-action='analyze']")?.addEventListener("click", analyzeAndPreview);
  document.querySelector("[data-action='clear-data']")?.addEventListener("click", clearToday);
}

function handleFoodPhoto(event) {
  const input = event.currentTarget;
  const [file] = input.files || [];
  if (!file) return;
  input.value = "";

  if (!FOOD_PHOTO_TYPES.includes(file.type)) {
    input.value = "";
    showToast("請選擇 JPEG、PNG 或 WebP 格式的照片。", "error");
    return;
  }
  if (file.size > MAX_FOOD_PHOTO_BYTES) {
    input.value = "";
    showToast("照片超過 8 MB，請選擇較小的圖片。", "error");
    return;
  }

  readFoodPhoto(file);
}

function readFoodPhoto(file) {
  const reader = new FileReader();
  reader.onerror = () => showToast("讀取照片失敗，請再試一次。", "error");
  reader.onload = () => {
    if (typeof reader.result !== "string") {
      showToast("讀取照片失敗，請再試一次。", "error");
      return;
    }
    const separator = reader.result.indexOf(",");
    if (separator < 0) {
      showToast("照片格式無法讀取，請再試一次。", "error");
      return;
    }
    state.foodPhoto = {
      name: file.name || "食物照片.jpg",
      mimeType: file.type,
      data: reader.result.slice(separator + 1),
      previewUrl: reader.result,
    };
    if (state.cameraOpen) closeCamera();
    else render();
  };
  reader.readAsDataURL(file);
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    document.querySelector("#foodCameraInput")?.click();
    return;
  }

  state.cameraOpen = true;
  state.cameraLoading = true;
  state.cameraError = "";
  render();
  requestAnimationFrame(() => document.querySelector(".camera-panel [data-action='close-camera']")?.focus());

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (!state.cameraOpen) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.cameraStream = stream;
    state.cameraLoading = false;
    render();
    const video = document.querySelector("#cameraPreview");
    if (!video) {
      closeCamera();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (error) {
    state.cameraLoading = false;
    state.cameraStream = null;
    state.cameraError = error.name === "NotAllowedError" || error.name === "SecurityError"
      ? "尚未允許使用相機。請在瀏覽器網站設定中開啟相機權限，或從相簿選擇照片。"
      : error.name === "NotFoundError"
        ? "找不到可用相機，請從相簿選擇照片。"
        : "相機暫時無法開啟，請檢查權限，或從相簿選擇照片。";
    render();
  }
}

async function captureCameraPhoto() {
  const video = document.querySelector("#cameraPreview");
  if (!video?.videoWidth || !video.videoHeight) {
    showToast("相機仍在啟動，請稍等一下。", "error");
    return;
  }
  const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const photo = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!photo) {
    showToast("無法處理這張照片，請再試一次。", "error");
    return;
  }
  if (photo.size > MAX_FOOD_PHOTO_BYTES) {
    showToast("照片超過 8 MB，請重拍或從相簿選擇較小的圖片。", "error");
    return;
  }
  if (state.cameraOpen) readFoodPhoto(new File([photo], "食物照片.jpg", { type: photo.type }));
}

function closeCamera() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  state.cameraOpen = false;
  state.cameraLoading = false;
  state.cameraError = "";
  render();
  requestAnimationFrame(() => document.querySelector("[data-action='pick-camera']")?.focus());
}

function repeatFood(entryId) {
  const previous = state.entries.find((entry) => String(entry.id) === entryId);
  if (!previous) return;
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: HK_TIME_ZONE });
  state.entries.push({
    ...previous,
    id: `repeat-${Date.now()}`,
    date: today,
    time,
    meal: state.meal,
  });
  saveEntries();
  showToast(`${previous.name} 已加入今日${mealNames[state.meal]}，${formatNumber(previous.calories)} kcal`, "success");
  render();
}

function saveApiKey() {
  const enteredKey = document.querySelector("#apiKeyInput")?.value.trim() || "";
  if (enteredKey) {
    state.apiKey = enteredKey;
    localStorage.setItem(API_KEY_STORAGE, state.apiKey);
  }
  state.settingsOpen = false;
  showToast(enteredKey ? "DeepSeek key 已儲存在此瀏覽器" : state.apiKey ? "已繼續使用已儲存的 DeepSeek key" : "目前使用快速試算", "success");
  render();
}

function closeSettings() {
  state.settingsOpen = false;
  render();
}

function openSettings(returnFocus = "[data-action='settings']") {
  settingsReturnFocus = returnFocus;
  state.settingsOpen = true;
  render();
}

function clearApiKey() {
  state.apiKey = "";
  localStorage.removeItem(API_KEY_STORAGE);
  state.settingsOpen = false;
  showToast("DeepSeek key 已從此瀏覽器移除", "success");
  render();
}

async function saveProfileFromForm(form) {
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const profile = {
    name: values.name.trim(),
    age: Number(values.age),
    sex: values.sex,
    heightCm: Number(values.heightCm),
    weightKg: Number(values.weightKg),
    activity: values.activity,
    goal: Number(values.age) < 18 ? "maintain" : values.goal,
  };
  const baseline = calculateGoals(profile);
  profile.goals = baseline;
  if (profile.age < 18) {
    profile.aiAdvice = "6–17 歲的熱量目標只供一般參考；成長期間請由家長／監護人與醫護專業人士協助評估。";
    profile.rationale = "使用兒童青少年成長期能量估算，沒有套用減重或增重調整。";
  }

  state.onboardingLoading = true;
  render();
  try {
    if (state.apiKey && profile.age >= 18) {
      const aiResult = await analyzeUserProfile(profile, baseline, state.apiKey);
      const suggestedCalories = Number(aiResult.daily_calories);
      if (Number.isFinite(suggestedCalories) && suggestedCalories > 0) {
        const safeLow = Math.max(1200, baseline.calories * 0.9);
        const safeHigh = baseline.calories * 1.1;
        profile.goals.calories = Math.round(Math.min(safeHigh, Math.max(safeLow, suggestedCalories)) / 10) * 10;
      }
      for (const [key, resultKey] of [["protein", "protein_g"], ["carbohydrates", "carbohydrates_g"], ["fat", "fat_g"]]) {
        const value = Number(aiResult[resultKey]);
        if (Number.isFinite(value) && value > 0 && value < profile.weightKg * 5) profile.goals[key] = Math.round(value);
      }
      profile.aiAdvice = typeof aiResult.daily_tip === "string" ? aiResult.daily_tip.slice(0, 320) : "個人化目標已更新。份量記清楚啲，卡老味先唔使靠估。";
      profile.rationale = typeof aiResult.rationale === "string" ? aiResult.rationale.slice(0, 320) : "以基本資料和活動量作估算。";
    }
    state.profile = profile;
    localStorage.setItem(PROFILE_STORAGE, JSON.stringify(profile));
    state.settingsOpen = false;
    showToast(state.apiKey && profile.age >= 18 ? `DeepSeek 已完成個人分析：${profile.goals.calories} kcal / 日` : `每日目標已估算：${profile.goals.calories} kcal / 日`, "success");
  } catch (error) {
    profile.aiAdvice = "目標先按基本代謝公式估算。加好 DeepSeek key 後，可以再更新個人化建議。";
    state.profile = profile;
    localStorage.setItem(PROFILE_STORAGE, JSON.stringify(profile));
    state.settingsOpen = false;
    showToast(`已先建立基本目標；DeepSeek 分析未完成：${error.message}`, "error");
  } finally {
    state.onboardingLoading = false;
    render();
  }
}

async function analyzeAndPreview() {
  const input = document.querySelector("#foodInput")?.value.trim();
  const image = state.foodPhoto;
  if (!input && !image) { showToast("輸入食物內容或加入一張照片，卡老味先有嘢寸。", "error"); render(); return; }
  if (image && !input) {
    showToast("DeepSeek 目前只支援文字，請在描述欄寫下照片中的食物和份量。", "error");
    return;
  }
  if (image && !state.apiKey) {
    showToast("文字分析需要 DeepSeek API key，請先設定你的 key。", "error");
    openSettings("[data-action='analyze']");
    return;
  }
  state.draft = input;
  state.loading = true;
  render();
  try {
    const analysis = state.apiKey ? await analyzeFoodInput(input, state.apiKey, state.profile, image ? { mimeType: image.mimeType, data: image.data } : null) : mockAnalyze(input);
    const fallbackName = input || "照片中的食物";
    const foodItems = Array.isArray(analysis.food_items) && analysis.food_items.length ? analysis.food_items : [{ name: fallbackName, calories: analysis.total_calories, protein: analysis.total_protein, carbohydrates: analysis.total_carbohydrates, fat: analysis.total_fat }];
    state.foodReview = {
      meal: state.meal,
      comment: typeof analysis.ai_comment === "string" ? analysis.ai_comment : "請核對份量，估算只供參考。",
      items: foodItems.map((item, index) => ({
        id: `review-${Date.now()}-${index}`,
        name: String(item.name || fallbackName),
        calories: round(item.calories),
        protein: round(item.protein),
        carbohydrates: round(item.carbohydrates),
        fat: round(item.fat),
      })),
    };
    if (image) state.foodPhoto = null;
    showToast("估算完成，請核對熱量後再記錄。", "success");
  } catch (error) {
    showToast(error.message || "AI 暫時行開咗，請稍後再試。", "error");
  } finally {
    state.loading = false;
    render();
  }
}

function appendFoodEntries(foodItems, meal, comment) {
  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: HK_TIME_ZONE });
  const idPrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  foodItems.forEach((item, index) => state.entries.push({
    id: `${idPrefix}-${index}`,
    date: today,
    time,
    meal,
    name: item.name,
    calories: round(item.calories),
    protein: round(item.protein),
    carbohydrates: round(item.carbohydrates),
    fat: round(item.fat),
    comment,
  }));
  saveEntries();
}

function saveReviewFood(index) {
  if (!state.foodReview) return;
  const [item] = state.foodReview.items.splice(index, 1);
  if (!item) return;
  appendFoodEntries([item], state.foodReview.meal, state.foodReview.comment);
  if (state.foodReview.items.length) {
    showToast(`${item.name} · ${formatNumber(item.calories)} kcal 已記錄`, "success");
  } else {
    state.foodReview = null;
    state.draft = "";
    state.foodPhoto = null;
    showToast(`${item.name} · ${formatNumber(item.calories)} kcal 已記錄`, "success");
  }
  render();
}

function removeReviewFood(index) {
  if (!state.foodReview) return;
  const [item] = state.foodReview.items.splice(index, 1);
  if (!item) return;
  const isEmpty = state.foodReview.items.length === 0;
  if (isEmpty) state.foodReview = null;
  render();
  showToast(isEmpty ? "已移除最後一項，請重新輸入食物再估算。" : `${item.name} 已從預覽移除`, "success");
}

function saveAllReviewedFoods() {
  if (!state.foodReview?.items.length) return;
  const { items, meal, comment } = state.foodReview;
  const totalCalories = sum(items, "calories");
  appendFoodEntries(items, meal, comment);
  state.foodReview = null;
  state.draft = "";
  state.foodPhoto = null;
  showToast(`${formatNumber(totalCalories)} kcal 已記錄，食得有數。`, "success");
  render();
}

function clearToday() {
  if (!todaysEntries().length) { showToast("今日仲未有記錄。", "error"); render(); return; }
  const removedEntries = todaysEntries();
  state.entries = state.entries.filter((entry) => entry.date !== today);
  saveEntries();
  showToast("今日記錄已清除", "success", {
    label: "復原",
    run: () => {
      state.entries.push(...removedEntries);
      saveEntries();
      render();
      showToast("今日記錄已復原", "success");
    },
  });
  render();
}

function showToast(message, type, action = null) {
  const toast = { message, type, action };
  state.toast = toast;
  const shell = document.querySelector(".app-shell");
  if (shell) {
    shell.querySelector(".toast")?.remove();
    shell.insertAdjacentHTML("beforeend", toastMarkup(toast));
    if (window.lucide) window.lucide.createIcons();
  }
  window.setTimeout(() => {
    if (state.toast === toast) {
      state.toast = null;
      document.querySelector(".app-shell .toast")?.remove();
    }
  }, 3200);
}

render();
