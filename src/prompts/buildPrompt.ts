import type { LearningCardRequest } from "../schemas/requestSchema.js";

const INTERFACE_DEFINITION = `
interface Variable {
  symbol: string;        // e.g. "m"
  latex: string;         // e.g. "m"
  meaning: string;       // e.g. "slope — how steep the line is"
}

interface Expression {
  latex: string;
  display: "inline" | "block";
}

interface Step {
  explanation: string;
  expression: Expression;
}

interface Point {
  x: number;
  y: number;
}

interface Line {
  label: string;
  color: string;         // hex color e.g. "#3B82F6"
  points: Point[];       // EXACTLY 11 computed points (x from -5 to 5 inclusive)
}

interface Annotation {
  label: string;
  x: number;
  y: number;
  note: string;
}

interface LearningCard {
  concept: string;
  board: string;
  grade: number;

  intro: {
    plain_english: string;    // 2-3 sentence explanation for a Class-9 child, no jargon
    why_it_matters: string;   // real-world relevance hook
  };

  key_formula: {
    latex: string;            // main formula in LaTeX source e.g. "y = mx + c"
    display: "block";         // always "block"
    variables: Variable[];
  };

  worked_example: {
    problem_statement: string;
    steps: Step[];
    final_answer: {
      latex: string;
      display: "block";
    };
  };

  visual: {
    type: "cartesian_graph";  // always this value
    title: string;
    x_axis: { label: string; min: number; max: number };
    y_axis: { label: string; min: number; max: number };
    lines: Line[];
    annotations: Annotation[];
  };

  misconceptions: Array<{
    wrong: string;            // what students often think
    correct: string;          // what is actually true
  }>;                         // exactly 2 or 3 items

  quick_check: {
    question: string;
    options: [string, string, string, string];   // exactly 4 strings
    correct_index: 0 | 1 | 2 | 3;
    explanation: string;
  };

  metadata: {
    generated_at: string;    // ISO 8601 timestamp
    model: string;           // e.g. "gemini-1.5-flash"
    tokens_used?: number;
  };
}
`.trim();

export function buildPrompt(req: LearningCardRequest): string {
  return `You are an expert curriculum designer for Indian school education (CBSE/ICSE/State boards).

Generate a complete learning card for the following:
- Board: ${req.board}
- Grade: ${req.grade}
- Concept: ${req.concept}

You MUST return ONLY a valid JSON object matching the TypeScript interface below exactly.
No markdown, no explanation, no backticks, no prose — just raw JSON.

\`\`\`typescript
${INTERFACE_DEFINITION}
\`\`\`

CRITICAL RULES:

1. VISUAL / GRAPH POINTS
   - For the visual section, compute ACTUAL numeric (x, y) points for each line.
   - Use x values from -5 to 5 inclusive in steps of 1 (11 points per line).
   - Calculate y values using the correct mathematical formula. These must be mathematically accurate.
   - Example: for y = 2x + 3, point at x=2 is y=7, so { "x": 2, "y": 7 }.
   - DO NOT make up or approximate points. Compute them precisely.
   - Each line must have between 10 and 15 points.

2. LATEX
   - Use standard KaTeX-compatible LaTeX math syntax.
   - Do NOT use \\displaystyle, \\require, or any non-standard macros.
   - Keep expressions clean: e.g. "y = mx + c" not "y = m \\cdot x + c".
   - For fractions use \\frac{numerator}{denominator}.

3. MISCONCEPTIONS
   - Must be 2 or 3 items — no more, no less.
   - Each must be a SPECIFIC, COMMON Class-${req.grade} student error for THIS concept.
   - Not generic math advice. Real mistakes real students make.

4. QUICK CHECK
   - The options array must contain EXACTLY 4 strings.
   - correct_index must be 0, 1, 2, or 3 (an integer, not a string).
   - The question should test conceptual understanding, not rote memorization.

5. METADATA
   - Set generated_at to the current ISO timestamp.
   - Set model to "llama-3.3-70b-versatile".

6. INTRO
   - plain_english: 2-3 sentences, written for a grade-${req.grade} student. Zero jargon.
   - why_it_matters: one concrete real-world hook (e.g. "This is how GPS calculates the shortest path").

Now generate the learning card for: "${req.concept}" (${req.board}, Grade ${req.grade}).`;
}

export function buildRetryPrompt(
  req: LearningCardRequest,
  originalPrompt: string,
  validationError: string
): string {
  return `${originalPrompt}

---
CORRECTION REQUIRED:

Your previous response failed JSON schema validation with the following error:

${validationError}

Fix ALL the issues listed above and return a corrected JSON object.
Return ONLY the raw JSON — no markdown, no explanation.`;
}
