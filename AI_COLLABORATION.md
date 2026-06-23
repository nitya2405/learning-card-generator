# AI Collaboration Notes

## Provider switch note

The project was originally built targeting Google Gemini (`gemini-2.0-flash`). During testing, the Gemini free tier returned `limit: 0` on every quota metric for all models — a geo-restriction that affects certain Google Cloud project configurations in India. Switching to Anthropic Claude required changing only `src/services/llm.ts` (renamed from `gemini.ts`) and the env key name. Every schema, route, and prompt stayed identical. This actually validates the service abstraction: the LLM provider is one file behind a stable `generateLearningCard` interface, so swapping it was a 20-minute change with zero risk to the rest of the system.

---

## What I used

- **Claude Code** (VS Code extension) — scaffolded the project structure, generated the Fastify boilerplate, wrote the Zod schemas, and produced the LLM service file.
- **Claude.ai** — used in the browser for schema design ideation before writing any code. Helped me think through the `visual` section specifically: whether to use Vega-Lite or a custom shape, and how to represent LaTeX for multi-target rendering.

---

## Key prompts I used

**1. Schema design (Claude.ai, before coding)**

> "I'm building an API that returns a structured learning card for a school topic. The card needs to include an explanation, a formula with variables, a worked example with step-by-step LaTeX, a graph the frontend can render with Chart.js, common student mistakes, and a quiz question. Design a TypeScript interface for this. The graph data should be numeric points, not a Vega-Lite spec. LaTeX should be raw source strings."

This produced the first draft of the `LearningCard` interface. I then trimmed it and added the `display: "inline" | "block"` discriminator myself after realising the frontend needs to know where to break equations.

**2. LLM service setup (Claude Code)**

> "Write a Claude service in TypeScript using @anthropic-ai/sdk that calls claude-sonnet-4-6 with a JSON system prompt, validates the output with a Zod schema, and retries once if validation fails — appending the Zod error messages to the prompt as a correction instruction."

Claude Code got the structure right immediately but instantiated a new `Anthropic` client on every call (inside the retry block), which is wasteful. Caught this on review and moved client instantiation to a `getClient()` function called once per request.

**3. Prompt builder (Claude Code)**

> "Write a buildPrompt function for the learning card generator. It should embed the full TypeScript interface of LearningCard into the prompt and instruct the model to return only raw JSON. Include specific rules about computing actual numeric points for the graph, using KaTeX-compatible LaTeX, and writing grade-specific misconceptions."

First draft didn't include the full interface — it just described the shape in prose. The model then returned inconsistent field names (`plain_text` instead of `plain_english`, `answer_index` instead of `correct_index`). Fixed by embedding the actual TypeScript interface as a code block in the prompt, which dramatically improved consistency.

---

## What worked well

- Claude Code generated the Fastify route handler and Zod schemas accurately in one shot. Both were structurally correct and only needed minor tweaks (the Fastify JSON Schema alongside the Zod layer, which I added because the spec called for both).
- The retry logic pattern — catching `ZodError | SyntaxError` specifically, not all errors — was suggested by Claude Code correctly without me having to specify it. Catching all errors in the retry would mask real API failures.
- The `buildRetryPrompt` approach (appending the formatted Zod error list to the original prompt rather than rewriting it) came from Claude's suggestion and works well in practice.
- The provider swap took under 20 minutes and required zero changes outside the service layer. The abstraction boundary held.

---

## Where the AI got it wrong

**1. Re-instantiating the client on retry.** Claude placed `new Anthropic(...)` inside the retry block, so it built a new client on every attempt. Moved it out to `getClient()`.

**2. Weak prompt, inconsistent LLM output.** The initial prompt Claude drafted described the schema in prose rather than embedding the TypeScript interface. The model responded with field names that were close but not exact (`generated_timestamp` instead of `generated_at`, nested `formula` instead of `key_formula`). Every run produced slightly different field names. Embedding the interface as a verbatim code block fixed this.

**3. `options` typed as `string[]` not a 4-tuple.** Claude's first Zod schema typed the quick-check options as `z.array(z.string())`. That passes for any length array. Changed it to `z.tuple([z.string(), z.string(), z.string(), z.string()])` to enforce exactly 4, which is what the prompt instructs the model to produce and what a quiz engine would expect.

**4. tokens_used only counted the first call.** The original retry logic set `tokens_used` from the first response only. Fixed to accumulate tokens across both the initial call and the retry, so the metadata accurately reflects total cost.

---

## How I caught and fixed it

- Ran `npm run dev` and sent a test request. The server started but Zod threw on the response — `options` had 3 items because the prompt didn't specify "exactly 4". Added that constraint to both the Zod schema and the prompt.
- Looked at the raw LLM responses in the Fastify logs (logger: true) before they hit Zod to understand what the model was actually emitting vs. what the schema expected.
- Verified the Anthropic SDK docs to confirm the correct `messages.create` signature and `response.content[0].text` access pattern for the current SDK version.

---

## Reflection

Treating LLM output as untrusted external data — the same way you'd treat a third-party API response — is the right mental model. It forces you to define the contract (the Zod schema) before writing the prompt, which actually improves the prompt because you know exactly what you need. The retry pattern is only possible because Zod produces structured, human-readable error messages; if validation had been a boolean pass/fail, there'd be nothing useful to feed back to the model. That closed loop — schema → error message → correction prompt — is the most interesting engineering insight from this project.

The provider switch reinforced this: because the service layer was the only place with provider-specific code, switching from Gemini to Claude was a drop-in replacement. The Zod schemas, route handler, and prompt builder had no idea which LLM was behind the interface. That's the right way to build this.
