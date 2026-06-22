import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { RequestSchema } from "../schemas/requestSchema.js";
import { generateLearningCard } from "../services/gemini.js";

const bodyJsonSchema = {
  type: "object",
  required: ["board", "grade", "concept"],
  properties: {
    board: { type: "string", minLength: 1 },
    grade: { type: "number", minimum: 1, maximum: 12 },
    concept: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const;

interface RawBody {
  board: string;
  grade: number;
  concept: string;
}

export async function learningCardRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RawBody }>(
    "/learning-card",
    {
      schema: {
        body: bodyJsonSchema,
      },
    },
    async (request: FastifyRequest<{ Body: RawBody }>, reply: FastifyReply) => {
      const parseResult = RequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const messages = parseResult.error.errors.map((e) => e.message).join(", ");
        return reply.status(400).send({ error: "Invalid request body", detail: messages });
      }

      const validatedBody = parseResult.data;

      try {
        const card = await generateLearningCard(validatedBody);
        return reply.status(200).send(card);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        request.log.error({ err }, "LLM generation failed");
        return reply.status(502).send({ error: "LLM generation failed", detail: message });
      }
    }
  );
}
