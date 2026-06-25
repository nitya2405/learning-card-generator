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

interface LearningCard {
  concept: string;
  board: string;
  grade: number;

  intro: {
    plain_english: string;    // 2-3 sentence explanation for a Class-grade child, no jargon
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

  // The visual field must be ONE of these 5 types. Choose the most appropriate for the concept:
  //
  // cartesian_graph — for mathematical functions, lines, curves, graphs
  //   Use for: algebra, geometry, physics motion/force graphs, any y=f(x)
  //   { type: "cartesian_graph", title, x_axis: {label,min,max}, y_axis: {label,min,max},
  //     lines: [{label, color (hex #RRGGBB), points: [{x,y}] (10-15 computed points)}],
  //     annotations: [{label, x, y, note}] }
  //
  // flowchart — for processes, cycles, how things work step by step
  //   Use for: water cycle, photosynthesis, how a bill becomes law, digestive system process
  //   { type: "flowchart", title,
  //     nodes: [{id, label, shape: "rectangle"|"diamond"|"oval"}] (2-10 nodes),
  //     edges: [{from (node id), to (node id), label?}] }
  //   Rules: diamond=decision, oval=start/end, rectangle=process step.
  //   Every edge "from"/"to" must reference an id that exists in nodes.
  //
  // comparison_table — for comparing exactly two things
  //   Use for: plant cell vs animal cell, metals vs non-metals, mitosis vs meiosis
  //   { type: "comparison_table", title,
  //     headers: [string, string],   // exactly 2 column headers
  //     rows: [[string, string], ...]  // 2-8 rows, each exactly 2 cells }
  //
  // labeled_diagram — for structures with named parts and their functions
  //   Use for: parts of a flower, human eye, cross-section of a leaf, parts of a neuron
  //   { type: "labeled_diagram", title,
  //     description: string,  // one sentence describing what the diagram shows
  //     labels: [{part, function}] (3-10 parts) }
  //
  // timeline — for sequences, stages, life cycles, ordered historical events
  //   Use for: stages of mitosis, rock cycle, life cycle of a butterfly, French Revolution events
  //   { type: "timeline", title,
  //     steps: [{order: number, label, description}] (2-8 steps, order starts at 1) }
  //
  // IMPORTANT: Return exactly one visual object matching one of these 5 shapes.
  // The "type" field determines the shape. Do not invent other types.
  visual: (
    | { type: "cartesian_graph"; title: string; x_axis: { label: string; min: number; max: number }; y_axis: { label: string; min: number; max: number }; lines: { label: string; color: string; points: { x: number; y: number }[] }[]; annotations: { label: string; x: number; y: number; note: string }[] }
    | { type: "flowchart"; title: string; nodes: { id: string; label: string; shape: "rectangle" | "diamond" | "oval" }[]; edges: { from: string; to: string; label?: string }[] }
    | { type: "comparison_table"; title: string; headers: [string, string]; rows: [string, string][] }
    | { type: "labeled_diagram"; title: string; description: string; labels: { part: string; function: string }[] }
    | { type: "timeline"; title: string; steps: { order: number; label: string; description: string }[] }
  );

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
    model: string;
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

1. VISUAL TYPE SELECTION
   - Choose the visual type that best fits the concept. Do NOT default to cartesian_graph for non-math topics.
   - cartesian_graph: only for mathematical functions, equations, or data you can plot on x/y axes.
   - flowchart: processes, cycles, step-by-step mechanisms (water cycle, digestion, photosynthesis).
   - comparison_table: comparing exactly two things (plant vs animal cell, metals vs non-metals).
   - labeled_diagram: physical or biological structures with named parts (flower, eye, neuron, leaf).
   - timeline: ordered stages or events (mitosis phases, rock cycle, historical sequence).
   - If cartesian_graph: compute ACTUAL numeric (x, y) points. Use x from -5 to 5 in steps of 1 (11 points).
     Calculate y using the correct formula. Each line must have 10–15 points.
   - If flowchart: every edge "from" and "to" must reference an id that exists in the nodes array.

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
