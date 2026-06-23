# AI Collaboration Notes

## Reflection (read this first)

Treating LLM output as untrusted external data — the same way you'd treat a third-party API response — is the right mental model. It forces you to define the contract (the Zod schema) before writing the prompt, which actually improves the prompt because you know exactly what you need. The retry pattern is only possible because Zod produces structured, human-readable error messages; if validation had been a boolean pass/fail, there'd be nothing useful to feed back to the model. That closed loop — schema → error message → correction prompt — is the most interesting engineering insight from this project.

The three provider swaps reinforced a second point: LLM providers are a commodity layer. Because the service layer was the only place with provider-specific code, switching between Gemini, Claude, and Groq was a drop-in replacement each time. The Zod schemas, route handler, and prompt builder had no idea which model was behind the interface. That's the right way to build this kind of system.

---

## Provider history

Three providers were tried before landing on Groq:

1. **Google Gemini** (`gemini-2.0-flash`) — returned `limit: 0` on all free tier quota metrics. This is a known issue for certain Google Cloud project configurations; the free tier simply has zero quota assigned at the project level. Not a code problem, not fixable without billing.

2. **Anthropic Claude** (`claude-sonnet-4-6`) — API key connected successfully and the error handling worked correctly (the 402 surfaced cleanly through the service layer). However, Anthropic requires paid credits even for initial testing; there is no free tier.

3. **Groq** (`llama-3.3-70b-versatile`) — genuinely free tier: 30 requests/minute, 14,400 requests/day, no credit card required. This is what the project currently uses.

Each provider swap required changing exactly one file (`src/services/llm.ts`) and the env key name. Routes, schemas, prompt builder, and Zod validation were untouched across all three switches. This validates the service abstraction: `generateLearningCard` is the only interface the rest of the system depends on.

---

## What I used

- **Claude Code** (VS Code extension) — scaffolded the project structure, generated the Fastify boilerplate, wrote the Zod schemas, and produced the LLM service file.
- **Claude.ai** — used in the browser for schema design ideation before writing any code. Helped me think through the `visual` section specifically: whether to use Vega-Lite or a custom shape, and how to represent LaTeX for multi-target rendering.

---

## Key prompts I used

**1. Schema design (Claude.ai, before coding)**

> "I'm building an API that returns a structured learning card for a school topic. The card needs to include an explanation, a formula with variables, a worked example with step-by-step LaTeX, a graph the frontend can render with Chart.js, common student mistakes, and a quiz question. Design a TypeScript interface for this. The graph data should be numeric points, not a Vega-Lite spec. LaTeX should be raw source strings."

This produced the first draft of the `LearningCard` interface. Two things I changed myself after reviewing it: I rejected Vega-Lite for the graph (the AI actually suggested it as an option — I overrode that, knowing LLMs struggle with deeply nested specs) and I added the `display: "inline" | "block"` discriminator to each LaTeX expression (the AI's draft had no display hint, which would have forced the frontend to guess where to break equations). Those were my calls, not suggestions from the model.

**2. LLM service setup (Claude Code)**

> "Write a Groq service in TypeScript using groq-sdk that calls llama-3.3-70b-versatile with response_format: json_object, validates the output with a Zod schema, and retries once if validation fails — appending the Zod error messages to the prompt as a correction instruction."

Claude Code got the structure right immediately but instantiated a new `Groq` client on every call (inside the retry block), which is wasteful. Caught this on review and moved client instantiation to a `getClient()` function called once per request.

**3. Prompt builder (Claude Code)**

> "Write a buildPrompt function for the learning card generator. It should embed the full TypeScript interface of LearningCard into the prompt and instruct the model to return only raw JSON. Include specific rules about computing actual numeric points for the graph, using KaTeX-compatible LaTeX, and writing grade-specific misconceptions."

First draft didn't include the full interface — it just described the shape in prose. The model then returned inconsistent field names (`plain_text` instead of `plain_english`, `answer_index` instead of `correct_index`). Embedding the actual TypeScript interface as a verbatim code block in the prompt was my decision; the AI's first instinct was prose description.

---

## What worked well

- Claude Code generated the Fastify route handler and Zod schemas accurately in one shot. Both were structurally correct and only needed minor tweaks (the Fastify JSON Schema alongside the Zod layer, which I added because the spec called for both).
- The retry logic pattern — catching `ZodError | SyntaxError` specifically, not all errors — was suggested by Claude Code correctly without me having to specify it. Catching all errors in the retry would mask real API failures.
- The `buildRetryPrompt` approach (appending the formatted Zod error list to the original prompt rather than rewriting it) came from Claude's suggestion and works well in practice.
- All three provider swaps took under 20 minutes each and required zero changes outside the service layer. The abstraction boundary held every time.

---

## Where the AI got it wrong

**1. Re-instantiating the client on retry.** Claude placed the client constructor inside the retry block, so it built a new SDK client on every attempt. Moved it out to `getClient()`.

**2. Weak prompt, inconsistent LLM output.** The initial prompt Claude drafted described the schema in prose rather than embedding the TypeScript interface. The model responded with field names that were close but not exact (`generated_timestamp` instead of `generated_at`, nested `formula` instead of `key_formula`). Every run produced slightly different field names. Embedding the interface as a verbatim code block fixed this.

**3. `options` typed as `string[]` not a 4-tuple.** Claude's first Zod schema typed the quick-check options as `z.array(z.string())`. That passes for any length array. Changed it to `z.tuple([z.string(), z.string(), z.string(), z.string()])` to enforce exactly 4, which is what the prompt instructs the model to produce and what a quiz engine would expect.

**4. tokens_used only counted the first call.** The original retry logic set `tokens_used` from the first response only. Fixed to accumulate tokens across both the initial call and the retry, so the metadata accurately reflects total cost.

**5. The LLM hallucinated a hardcoded date.** The model returned `"generated_at": "2024-03-16T14:30:00.000Z"` — a made-up date — on every response, regardless of when the request was made. Caught by inspecting the raw response JSON in the server logs. Fixed by overriding `metadata.generated_at` with `new Date().toISOString()` after Zod parse, before returning the card. Timestamps should never be trusted from a model; this is a textbook case of LLM output being untrusted data even for fields that look trivial.

---

## How I caught and fixed it

- Ran `npm run dev` and sent a test request. The server started but Zod threw on the response — `options` had 3 items because the prompt didn't specify "exactly 4". Added that constraint to both the Zod schema and the prompt.
- Inspected the raw LLM response in the Fastify logs (logger: true) before it hit Zod — that's how the hardcoded date and the inconsistent field names were caught.
- Verified each provider's SDK docs to confirm the correct method signatures and response access patterns.
