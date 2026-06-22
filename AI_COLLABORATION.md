# AI Collaboration Notes

## What I used

- **Claude Code** (VS Code extension) — scaffolded the project structure, generated the Fastify boilerplate, wrote the Zod schemas, and produced the Gemini service file.
- **Claude.ai** — used in the browser for schema design ideation before writing any code. Helped me think through the `visual` section specifically: whether to use Vega-Lite or a custom shape, and how to represent LaTeX for multi-target rendering.

---

## Key prompts I used

**1. Schema design (Claude.ai, before coding)**

> "I'm building an API that returns a structured learning card for a school topic. The card needs to include an explanation, a formula with variables, a worked example with step-by-step LaTeX, a graph the frontend can render with Chart.js, common student mistakes, and a quiz question. Design a TypeScript interface for this. The graph data should be numeric points, not a Vega-Lite spec. LaTeX should be raw source strings."

This produced the first draft of the `LearningCard` interface. I then trimmed it and added the `display: "inline" | "block"` discriminator myself after realising the frontend needs to know where to break equations.

**2. Gemini JSON mode setup (Claude Code)**

> "Write a Gemini service in TypeScript using @google/generative-ai that calls gemini-1.5-flash with responseMimeType: application/json, validates the output with a Zod schema, and retries once if validation fails — appending the Zod error messages to the prompt as a correction instruction."

Claude Code got the structure right immediately but instantiated a new `GoogleGenerativeAI` client on every call (inside the retry block), which is wasteful. Caught this on review and moved client instantiation to a `getClient()` function called once per request.

**3. Prompt builder (Claude Code)**

> "Write a buildPrompt function for the learning card generator. It should embed the full TypeScript interface of LearningCard into the prompt and instruct Gemini to return only raw JSON. Include specific rules about computing actual numeric points for the graph, using KaTeX-compatible LaTeX, and writing grade-specific misconceptions."

First draft didn't include the full interface — it just described the shape in prose. Gemini then returned inconsistent field names (`plain_text` instead of `plain_english`, `answer_index` instead of `correct_index`). Fixed by embedding the actual TypeScript interface as a code block in the prompt, which dramatically improved consistency.

---

## What worked well

- Claude Code generated the Fastify route handler and Zod schemas accurately in one shot. Both were structurally correct and only needed minor tweaks (the Fastify JSON Schema alongside the Zod layer, which I added because the spec called for both).
- The retry logic pattern — catching `ZodError | SyntaxError` specifically, not all errors — was suggested by Claude Code correctly without me having to specify it. Catching all errors in the retry would mask real API failures.
- The `buildRetryPrompt` approach (appending the formatted Zod error list to the original prompt rather than rewriting it) came from Claude's suggestion and works well in practice.

---

## Where the AI got it wrong

**1. Stale SDK syntax.** Claude's first version of the Gemini service used `genAI.getGenerativeModel(...).startChat()` — the v0.1 conversation API — instead of `model.generateContent()` which is the correct approach for single-shot JSON generation. The SDK has changed significantly since the model's training data; I caught this by checking the `@google/generative-ai` README.

**2. Re-instantiating the model on retry.** As mentioned above, Claude placed `client.getGenerativeModel(...)` inside the retry block, so it built a new model object on every attempt. Minor but wasteful. Moved it out.

**3. Weak prompt, inconsistent Gemini output.** The initial prompt Claude drafted described the schema in prose rather than embedding the TypeScript interface. Gemini responded with field names that were close but not exact (`generated_timestamp` instead of `generated_at`, nested `formula` instead of `key_formula`). Every run produced slightly different field names. Embedding the interface as a verbatim code block fixed this.

**4. `options` typed as `string[]` not a 4-tuple.** Claude's first Zod schema typed the quick-check options as `z.array(z.string())`. That passes for any length array. Changed it to `z.tuple([z.string(), z.string(), z.string(), z.string()])` to enforce exactly 4, which is what the prompt instructs Gemini to produce and what a quiz engine would expect.

---

## How I caught and fixed it

- Ran `npm run dev` and sent a test curl request. The server started but Zod threw on the response — `options` had 3 items because the prompt didn't specify "exactly 4". Added that constraint to both the Zod schema and the prompt.
- Read the `@google/generative-ai` changelog on npm to confirm the correct method signatures for the current version.
- Looked at the raw Gemini responses in the Fastify logs (logger: true) before they hit Zod to understand what the model was actually emitting vs. what the schema expected.

---

## Reflection

Treating LLM output as untrusted external data — the same way you'd treat a third-party API response — is the right mental model. It forces you to define the contract (the Zod schema) before writing the prompt, which actually improves the prompt because you know exactly what you need. The retry pattern is only possible because Zod produces structured, human-readable error messages; if validation had been a boolean pass/fail, there'd be nothing useful to feed back to the model. That closed loop — schema → error message → correction prompt — is the most interesting engineering insight from this project.
