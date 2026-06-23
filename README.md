# learning-card-generator

A TypeScript + Fastify backend that calls the Groq API (`llama-3.3-70b-versatile`) to generate structured, schema-validated learning cards for school students (CBSE/ICSE/State boards). Built as a PopGamma take-home assignment.

---

## Provider

> **Groq + Llama 3.3 70B** — chosen after Google Gemini returned `limit: 0` on all free tier quota metrics (a geo-restriction on certain GCP project configurations in India) and Anthropic Claude requires paid credits with no free tier. Groq provides 30 RPM / 14,400 RPD free with no credit card required. Each provider swap required changing exactly one file (`src/services/llm.ts`) — routes, schemas, and prompt logic were untouched — which validates the service abstraction.

---

## Overview

`POST /learning-card` accepts a board, grade, and concept, then returns a richly structured JSON learning card containing:
- A plain-English intro and real-world relevance hook
- The key formula in LaTeX with variable definitions
- A step-by-step worked example with inline/block LaTeX expressions
- Graph data (computed numeric points) for a Cartesian visualisation
- 2–3 common student misconceptions
- A multiple-choice quick-check question

The Groq response is validated against a strict Zod schema. If validation fails, the service retries once with the validation error appended as a correction instruction.

---

## Setup

```bash
git clone https://github.com/nitya2405/learning-card-generator.git
cd learning-card-generator
npm install
cp .env.example .env
```

Open `.env` and replace `your_groq_api_key_here` with your Groq API key from [console.groq.com/keys](https://console.groq.com/keys). Groq provides a genuinely free tier — 30 requests/minute, 14,400 requests/day — no credit card required.

---

## Running

### Development (with hot reload)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Example request

```bash
curl -X POST http://localhost:3000/learning-card \
  -H "Content-Type: application/json" \
  -d '{"board":"CBSE","grade":9,"concept":"Slope-intercept form of a line (y = mx + c)"}'
```

The response is a single JSON object conforming to the `LearningCard` schema described in `src/schemas/cardSchema.ts`.

---

## Design Decisions

### Custom schema over Vega-Lite

Vega-Lite is expressive but deeply nested — a model forced to emit a full Vega-Lite spec reliably would require far more prompt engineering and still produces structural errors at higher rates than a flat, purpose-built schema. The custom `visual` schema here gives the frontend exactly the typed data it needs (axis bounds, labelled lines, annotations) without the cognitive overhead of spec compliance.

### LaTeX source strings with `display` type — not pre-rendered HTML

The frontend may render on web (KaTeX), mobile (flutter_math), or PDF (LaTeX itself). Storing raw LaTeX source with a `display: "inline" | "block"` hint keeps the rendering decision at the client layer. Pre-rendered HTML would bake in one renderer's output and break every other target.

### Zod for both input and LLM output

Fastify's built-in JSON Schema validation catches malformed requests before they reach application code. Zod adds a second layer for LLM output because LLM responses are untrusted third-party data — structurally similar to parsing an external API response. Using Zod means the validation error messages are precise enough to feed back into a correction prompt, which powers the retry logic.

One concrete example: the LLM consistently returned a hardcoded date (`"2024-03-16T14:30:00.000Z"`) for `metadata.generated_at`. Caught by inspecting the response, fixed by overriding `generated_at` server-side with `new Date().toISOString()` after Zod parse. LLMs hallucinate dates; timestamps should never be trusted from the model.

### Retry-once pattern, not a full retry loop

A full retry loop risks burning through token quota silently and introduces unpredictable latency. One retry is almost always sufficient: if the model understood the schema on the first attempt but got one field wrong, a correction prompt fixes it. Two consecutive failures indicate either a fundamental prompt problem or an API issue — both warrant a 502 to the caller rather than silent looping.

### `quick_check` as a quiz seed

The multiple-choice section is deliberately structured as `{ question, options: [string×4], correct_index, explanation }` — the exact shape needed to seed a quiz engine. No extra transformation required on the frontend; the card is immediately usable as a quiz item.

---

## Trade-offs (in 2–3 hrs)

- **Prompt-schema drift** — the prompt embeds the full TypeScript interface as a literal string. This is intentional: it's the most reliable way to get the model to emit the right field names. But it's a maintenance liability. If the Zod schema evolves (a field renamed, a new section added), the embedded interface must be updated manually. In a production system this would be auto-generated from the Zod schema at build time.
- No caching: identical `(board, grade, concept)` requests hit Groq every time. A Redis or in-memory LRU cache would eliminate redundant API calls.
- No test suite: the Zod schemas act as executable specs but there are no recorded fixture tests against the LLM response.
- Temperature is not configurable per request; it uses the Groq API default, which limits diversity for repeated requests on the same concept.

---

## What I'd Do With More Time

- **Streaming responses** — use Groq's streaming API and server-sent events so the client sees the card sections as they arrive rather than waiting for the full JSON.
- **Concept graph** — link cards to prerequisite concepts (`key_formula` already identifies variables; those variables could resolve to other cards).
- **Caching** — Redis cache keyed by `sha256(board + grade + concept)` with a 24-hour TTL to avoid redundant Groq API calls.
- **Auto-generate the prompt interface** — derive the embedded TypeScript interface in `buildPrompt.ts` from the Zod schema at build time using `zod-to-ts`, eliminating the prompt-schema drift problem entirely.
- **Test suite** — record a handful of LLM responses as fixtures and run Zod validation against them in CI, plus integration tests against a mock HTTP server.
