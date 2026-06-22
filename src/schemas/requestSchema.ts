import { z } from "zod";

export const RequestSchema = z.object({
  board: z.string().min(1, "board must be a non-empty string"),
  grade: z
    .number()
    .int("grade must be an integer")
    .min(1, "grade must be between 1 and 12")
    .max(12, "grade must be between 1 and 12"),
  concept: z.string().min(1, "concept must be a non-empty string"),
});

export type LearningCardRequest = z.infer<typeof RequestSchema>;
