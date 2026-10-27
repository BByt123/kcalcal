import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFoodInput } from "../src/services/aiService.js";

test("combines a food photo with its accompanying user description", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ food_items: [] }) }] } }] }),
    };
  };

  try {
    await analyzeFoodInput("少飯，走汁", "test-key", null, { mimeType: "image/jpeg", data: "Zm9vZA==" });
    const parts = requestBody.contents[0].parts;
    assert.match(parts[0].text, /少飯，走汁/);
    assert.match(parts[0].text, /附上的食物照片/);
    assert.deepEqual(parts[1].inline_data, { mime_type: "image/jpeg", data: "Zm9vZA==" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
