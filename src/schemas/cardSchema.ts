import { z } from "zod";

const LatexDisplaySchema = z.union([z.literal("inline"), z.literal("block")]);

const VariableSchema = z.object({
  symbol: z.string(),
  latex: z.string(),
  meaning: z.string(),
});

const KeyFormulaSchema = z.object({
  latex: z.string(),
  display: z.literal("block"),
  variables: z.array(VariableSchema),
});

const ExpressionSchema = z.object({
  latex: z.string(),
  display: LatexDisplaySchema,
});

const StepSchema = z.object({
  explanation: z.string(),
  expression: ExpressionSchema,
});

const WorkedExampleSchema = z.object({
  problem_statement: z.string(),
  steps: z.array(StepSchema),
  final_answer: z.object({
    latex: z.string(),
    display: z.literal("block"),
  }),
});

const AxisSchema = z.object({
  label: z.string(),
  min: z.number(),
  max: z.number(),
});

const AnnotationSchema = z.object({
  label: z.string(),
  x: z.number(),
  y: z.number(),
  note: z.string(),
});

const CartesianGraphSchema = z.object({
  type: z.literal("cartesian_graph"),
  title: z.string(),
  x_axis: AxisSchema,
  y_axis: AxisSchema,
  lines: z
    .array(
      z.object({
        label: z.string(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color must be a hex code"),
        points: z
          .array(z.object({ x: z.number(), y: z.number() }))
          .min(10)
          .max(15),
      })
    )
    .min(1),
  annotations: z.array(AnnotationSchema),
});

const FlowchartSchema = z.object({
  type: z.literal("flowchart"),
  title: z.string(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        shape: z.union([
          z.literal("rectangle"),
          z.literal("diamond"),
          z.literal("oval"),
        ]),
      })
    )
    .min(2)
    .max(10),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      })
    )
    .min(1),
});

const ComparisonTableSchema = z.object({
  type: z.literal("comparison_table"),
  title: z.string(),
  headers: z.tuple([z.string(), z.string()]),
  rows: z.array(z.tuple([z.string(), z.string()])).min(2).max(8),
});

const LabeledDiagramSchema = z.object({
  type: z.literal("labeled_diagram"),
  title: z.string(),
  description: z.string(),
  labels: z
    .array(
      z.object({
        part: z.string(),
        function: z.string(),
      })
    )
    .min(3)
    .max(10),
});

const TimelineSchema = z.object({
  type: z.literal("timeline"),
  title: z.string(),
  steps: z
    .array(
      z.object({
        order: z.number().int().min(1),
        label: z.string(),
        description: z.string(),
      })
    )
    .min(2)
    .max(8),
});

const VisualSchema = z.discriminatedUnion("type", [
  CartesianGraphSchema,
  FlowchartSchema,
  ComparisonTableSchema,
  LabeledDiagramSchema,
  TimelineSchema,
]);

export type Visual = z.infer<typeof VisualSchema>;

const MisconceptionSchema = z.object({
  wrong: z.string(),
  correct: z.string(),
});

const QuickCheckSchema = z.object({
  question: z.string(),
  options: z
    .tuple([z.string(), z.string(), z.string(), z.string()]),
  correct_index: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
  explanation: z.string(),
});

const MetadataSchema = z.object({
  generated_at: z.string(),
  model: z.string(),
  tokens_used: z.number().optional(),
});

export const LearningCardSchema = z.object({
  concept: z.string(),
  board: z.string(),
  grade: z.number(),

  intro: z.object({
    plain_english: z.string(),
    why_it_matters: z.string(),
  }),

  key_formula: KeyFormulaSchema,

  worked_example: WorkedExampleSchema,

  visual: VisualSchema,

  misconceptions: z.array(MisconceptionSchema).min(2).max(3),

  quick_check: QuickCheckSchema,

  metadata: MetadataSchema,
});

export type LearningCard = z.infer<typeof LearningCardSchema>;
