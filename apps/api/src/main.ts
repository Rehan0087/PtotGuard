// Before anything reads process.env — PrismaService's constructor does, at
// Nest's dependency-injection time, well before this file's own code runs
// again, but after the module graph resolves. Without this, DATABASE_URL is
// undefined for the real server (prisma.config.ts loads it separately, only
// for the CLI), the pg pool connects against nothing, $connect() "succeeds"
// anyway because pool construction doesn't touch the network, and the first
// real query is what actually fails.
import "dotenv/config";
import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureBodyParser } from "./common/configure-body-parser";

/**
 * Required before the port opens.
 *
 * A missing AUTH_TOKEN_SECRET does not stop the server starting: every route
 * works, and sign-in works right up to the moment a password is correct —
 * then token signing throws and the API answers 500 "Something went wrong",
 * which reads like a broken login rather than an unset variable. DATABASE_URL
 * fails the same way, deferred to the first query. Checking here turns both
 * into one sentence, at the one moment someone can act on it.
 */
const REQUIRED_ENV = ["DATABASE_URL", "AUTH_TOKEN_SECRET"];

function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length === 0) return;
  new Logger("bootstrap").error(
    `Missing required environment ${missing.length === 1 ? "variable" : "variables"}: ` +
      `${missing.join(", ")}. Copy apps/api/.env.example to apps/api/.env and fill them in.`,
  );
  process.exit(1);
}

/** The frontend calls `${NEXT_PUBLIC_API_BASE}/parcels`, so the prefix is `/api`. */
export const API_PREFIX = "api";

async function bootstrap(): Promise<void> {
  assertRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  configureBodyParser(app);

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything the DTO does not declare, so a client cannot set a field
      // the rule never sees — status and ownership move through gates, not body.
      whitelist: true,
      transform: true,
    }),
  );

  // The web app is a different origin once it stops proxying through MSW.
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger("bootstrap").log(`PlotGuard API on http://localhost:${port}/${API_PREFIX}`);
}

void bootstrap();
