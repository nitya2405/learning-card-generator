# learning-card-generator

A TypeScript + Fastify backend that calls the Anthropic Claude API to generate structured, schema-validated learning cards for school students (CBSE/ICSE/State boards). Built as a PopGamma take-home assignment.

---

## Overview

`POST /learning-card` accepts a board, grade, and concept, then returns a richly structured JSON learning card containing:
- A plain-English intro and real-world relevance hook
- The key formula in LaTeX with variable definitions
- A step-by-step worked example with inline/block LaTeX expressions
- Graph data (computed numeric points) for a Cartesian visualisation
- 2–3 common student misconceptions
- A multiple-choice quick-check question

The Claude (`claude-sonnet-4-6`) response is validated against a strict Zod schema. If validation fails, the service retries once with the validation error appended as a correction instruction.

---

## Setup

```bash
git clone https://github.com/nitya2405/learning-card-generator.git
cd learning-card-generator
npm install
cp .env.example .env
```

Open `.env` and replace `your_anthropic_api_key_here` with your Anthropic API key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). New accounts receive $5 in free credits.

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

### Retry-once pattern, not a full retry loop

A full retry loop risks burning through token quota silently and introduces unpredictable latency. One retry is almost always sufficient: if the model understood the schema on the first attempt but got one field wrong, a correction prompt fixes it. Two consecutive failures indicate either a fundamental prompt problem or an API issue — both warrant a 502 to the caller rather than silent looping.

### `quick_check` as a quiz seed

The multiple-choice section is deliberately structured as `{ question, options: [string×4], correct_index, explanation }` — the exact shape needed to seed a quiz engine. No extra transformation required on the frontend; the card is immediately usable as a quiz item.

### Provider choice: Anthropic Claude over Google Gemini

The initial implementation targeted Gemini. During testing, the Google AI free tier returned `limit: 0` on all quota metrics regardless of model (`gemini-2.0-flash`, `gemini-2.0-flash-lite`) — a known restriction for certain Google Cloud project configurations in some regions. Anthropic provides $5 free credits on signup with no geo-restrictions, making it more accessible for initial development and evaluation.

---

## Trade-offs (in 2–3 hrs)

- No caching: identical `(board, grade, concept)` requests hit Claude every time. A Redis or in-memory LRU cache would eliminate redundant API calls.
- No test suite: the Zod schemas act as executable specs but there are no recorded fixture tests against the Claude response.
- Temperature is not configurable per request; it uses the Claude API default, which limits diversity for repeated requests on the same concept.
- The prompt embeds the full TypeScript interface as a string — maintainable for now but will drift if the Zod schema evolves without updating the prompt.

---

## What I'd Do With More Time

- **Streaming responses** — use Claude's streaming API and server-sent events so the client sees the card sections as they arrive rather than waiting for the full JSON.
- **Concept graph** — link cards to prerequisite concepts (`key_formula` already identifies variables; those variables could resolve to other cards).
- **Caching** — Redis cache keyed by `sha256(board + grade + concept)` with a 24-hour TTL to avoid redundant Claude API calls.
- **Test suite** — record a handful of Claude responses as fixtures and run Zod validation against them in CI, plus integration tests against a mock HTTP server.
- **Prompt versioning** — store prompt templates with a version hash so changing the prompt invalidates cached responses automatically.
