import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { LearningCardSchema, type LearningCard } from "../schemas/cardSchema.js";
import { buildPrompt, buildRetryPrompt } from "../prompts/buildPrompt.js";
import type { LearningCardRequest } from "../schemas/requestSchema.js";

const MODEL_NAME = "claude-sonnet-4-6";

const SYSTEM_MESSAGE =
  "You are a JSON API. Return only valid JSON, no markdown, no backticks, no explanation.";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

async function callClaude(
  prompt: string,
  client: Anthropic
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await client.messages.create({
    model: MODEL_NAME,
    max_tokens: 4096,
    system: SYSTEM_MESSAGE,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function parseAndValidate(raw: string): LearningCard {
  const parsed = JSON.parse(raw) as unknown;
  return LearningCardSchema.parse(parsed);
}

export async function generateLearningCard(
  req: LearningCardRequest
): Promise<LearningCard> {
  const client = getClient();
  const prompt = buildPrompt(req);

  let result: { text: string; inputTokens: number; outputTokens: number };

  try {
    result = await callClaude(prompt, client);
  } catch (err) {
    throw new Error(
      `Claude API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const card = parseAndValidate(result.text);
    card.metadata.tokens_used = result.inputTokens + result.outputTokens;
    return card;
  } catch (firstErr) {
    if (!(firstErr instanceof ZodError) && !(firstErr instanceof SyntaxError)) {
      throw firstErr;
    }

    const validationDetail =
      firstErr instanceof ZodError
        ? firstErr.errors
            .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
            .join("\n")
        : `JSON parse error: ${firstErr.message}`;

    const retryPrompt = buildRetryPrompt(req, prompt, validationDetail);

    let retryResult: { text: string; inputTokens: number; outputTokens: number };
    try {
      retryResult = await callClaude(retryPrompt, client);
    } catch (retryCallErr) {
      throw new Error(
        `Claude retry API call failed: ${retryCallErr instanceof Error ? retryCallErr.message : String(retryCallErr)}`
      );
    }

    try {
      const card = parseAndValidate(retryResult.text);
      card.metadata.tokens_used =
        result.inputTokens +
        result.outputTokens +
        retryResult.inputTokens +
        retryResult.outputTokens;
      return card;
    } catch (secondErr) {
      const detail =
        secondErr instanceof ZodError
          ? secondErr.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join("; ")
          : secondErr instanceof SyntaxError
          ? `JSON parse error: ${secondErr.message}`
          : String(secondErr);

      throw new Error(
        `LLM output failed schema validation after retry: ${detail}`
      );
    }
  }
}
