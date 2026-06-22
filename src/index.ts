import "dotenv/config";
import Fastify from "fastify";
import { learningCardRoute } from "./routes/learningCard.js";

const fastify = Fastify({ logger: true });

await fastify.register(learningCardRoute);

const port = parseInt(process.env.PORT ?? "3000", 10);

try {
  await fastify.listen({ port, host: "0.0.0.0" });
  fastify.log.info(`Server listening on port ${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
