import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFoodInput } from "../src/services/aiService.js";

test("calls DeepSeek with JSON mode and a bearer key", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ food_items: [] }) } }] }),
    };
  };

  try {
    await analyzeFoodInput("少飯叉燒飯，走汁", "deepseek-test-key");
    const body = JSON.parse(requestOptions.body);
    assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
    assert.equal(requestOptions.headers.Authorization, "Bearer deepseek-test-key");
    assert.equal(body.model, "deepseek-chat");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.match(body.messages[1].content, /少飯叉燒飯/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires a text description when a photo is selected", async () => {
  await assert.rejects(
    () => analyzeFoodInput("", "deepseek-test-key", null, { mimeType: "image/jpeg", data: "Zm9vZA==" }),
    /只支援文字/,
  );
});
