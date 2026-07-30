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
import { AppModule } from "./app.module";

/** The frontend calls `${NEXT_PUBLIC_API_BASE}/parcels`, so the prefix is `/api`. */
export const API_PREFIX = "api";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip anything the DTO does not declare, so a client cannot set a field
      // the rule never sees — status and ownership move through gates, not body.
      whitelist: true,
      forbidNonWhitelisted: true,
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
