import Groq from "groq-sdk";
import { ZodError } from "zod";
import { LearningCardSchema, type LearningCard } from "../schemas/cardSchema.js";
import { buildPrompt, buildRetryPrompt } from "../prompts/buildPrompt.js";
import type { LearningCardRequest } from "../schemas/requestSchema.js";

const MODEL_NAME = "llama-3.3-70b-versatile";

const SYSTEM_MESSAGE =
  "You are a JSON API. Return only valid JSON, no markdown, no backticks, no explanation.";

function getClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is not set");
  }
  return new Groq({ apiKey });
}

async function callGroq(
  prompt: string,
  client: Groq
): Promise<{ text: string; tokensUsed: number }> {
  const response = await client.chat.completions.create({
    model: MODEL_NAME,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: prompt },
    ],
  });

  const text = response.choices[0].message.content ?? "";
  const tokensUsed = response.usage?.total_tokens ?? 0;

  return { text, tokensUsed };
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

  let result: { text: string; tokensUsed: number };

  try {
    result = await callGroq(prompt, client);
  } catch (err) {
    throw new Error(
      `Groq API call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const card = parseAndValidate(result.text);
    card.metadata.tokens_used = result.tokensUsed;
    card.metadata.generated_at = new Date().toISOString();
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

    let retryResult: { text: string; tokensUsed: number };
    try {
      retryResult = await callGroq(retryPrompt, client);
    } catch (retryCallErr) {
      throw new Error(
        `Groq retry API call failed: ${retryCallErr instanceof Error ? retryCallErr.message : String(retryCallErr)}`
      );
    }

    try {
      const card = parseAndValidate(retryResult.text);
      card.metadata.tokens_used = result.tokensUsed + retryResult.tokensUsed;
      card.metadata.generated_at = new Date().toISOString();
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
