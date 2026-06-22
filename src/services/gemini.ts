import { GoogleGenerativeAI } from "@google/generative-ai";
import { ZodError } from "zod";
import { LearningCardSchema, type LearningCard } from "../schemas/cardSchema.js";
import { buildPrompt, buildRetryPrompt } from "../prompts/buildPrompt.js";
import type { LearningCardRequest } from "../schemas/requestSchema.js";

const MODEL_NAME = "gemini-1.5-flash";

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

async function callGemini(prompt: string, client: GoogleGenerativeAI): Promise<string> {
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  return text;
}

function parseAndValidate(raw: string): LearningCard {
  const parsed = JSON.parse(raw) as unknown;
  return LearningCardSchema.parse(parsed);
}

export async function generateLearningCard(req: LearningCardRequest): Promise<LearningCard> {
  const client = getClient();
  const prompt = buildPrompt(req);

  let rawText: string;

  try {
    rawText = await callGemini(prompt, client);
  } catch (err) {
    throw new Error(`Gemini API call failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return parseAndValidate(rawText);
  } catch (firstErr) {
    if (!(firstErr instanceof ZodError) && !(firstErr instanceof SyntaxError)) {
      throw firstErr;
    }

    const validationDetail =
      firstErr instanceof ZodError
        ? firstErr.errors.map((e) => `  - ${e.path.join(".")}: ${e.message}`).join("\n")
        : `JSON parse error: ${firstErr.message}`;

    const retryPrompt = buildRetryPrompt(req, prompt, validationDetail);

    let retryRaw: string;
    try {
      retryRaw = await callGemini(retryPrompt, client);
    } catch (retryCallErr) {
      throw new Error(
        `Gemini retry API call failed: ${retryCallErr instanceof Error ? retryCallErr.message : String(retryCallErr)}`
      );
    }

    try {
      return parseAndValidate(retryRaw);
    } catch (secondErr) {
      const detail =
        secondErr instanceof ZodError
          ? secondErr.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
          : secondErr instanceof SyntaxError
          ? `JSON parse error: ${secondErr.message}`
          : String(secondErr);

      throw new Error(`LLM output failed schema validation after retry: ${detail}`);
    }
  }
}
