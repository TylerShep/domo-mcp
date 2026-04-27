import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { AINotConfiguredError, buildAIProvider } from "../../src/ai/gateway.js";
import { buildTestConfig } from "../helpers.js";
import { use } from "../setup.js";

describe("AI Gateway", () => {
  it("throws AINotConfiguredError when no provider is set", () => {
    const cfg = buildTestConfig();
    expect(() => buildAIProvider(cfg)).toThrow(AINotConfiguredError);
  });

  it("builds an OpenAI provider that posts to chat completions", async () => {
    let receivedAuth: string | null = null;
    let receivedBody: unknown = null;
    use(
      http.post("https://api.openai.com/v1/chat/completions", async ({ request }) => {
        receivedAuth = request.headers.get("authorization");
        receivedBody = await request.json();
        return HttpResponse.json({
          choices: [{ message: { content: "Hello from openai" } }],
        });
      }),
    );
    const cfg = buildTestConfig({
      aiProvider: "openai",
      openaiApiKey: "key-123",
    });
    const provider = buildAIProvider(cfg);
    const out = await provider.chatCompletion({
      system: "You are helpful",
      user: "Hi",
    });
    expect(out).toBe("Hello from openai");
    expect(receivedAuth).toBe("Bearer key-123");
    expect(provider.name).toBe("openai");
    expect(receivedBody).toMatchObject({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ],
    });
  });

  it("Grok provider uses the x.ai base URL", async () => {
    let url = "";
    use(
      http.post("https://api.x.ai/v1/chat/completions", ({ request }) => {
        url = request.url;
        return HttpResponse.json({ choices: [{ message: { content: "grok" } }] });
      }),
    );
    const cfg = buildTestConfig({
      aiProvider: "grok",
      grokApiKey: "grok-key",
    });
    const provider = buildAIProvider(cfg);
    const out = await provider.chatCompletion({ system: "s", user: "u" });
    expect(out).toBe("grok");
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(provider.name).toBe("grok");
  });

  it("OpenAI provider surfaces upstream errors as Error", async () => {
    use(
      http.post("https://api.openai.com/v1/chat/completions", () =>
        HttpResponse.text("rate limited", { status: 429 }),
      ),
    );
    const cfg = buildTestConfig({
      aiProvider: "openai",
      openaiApiKey: "key",
    });
    const provider = buildAIProvider(cfg);
    await expect(provider.chatCompletion({ system: "s", user: "u" })).rejects.toThrow(/429/);
  });

  it("OpenAI provider throws AINotConfiguredError when key is missing", () => {
    const cfg = buildTestConfig({
      aiProvider: "openai",
    });
    expect(() => buildAIProvider(cfg)).toThrow(AINotConfiguredError);
  });
});
