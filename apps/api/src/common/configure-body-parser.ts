import type { NestExpressApplication } from "@nestjs/platform-express";

export function configureBodyParser(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });
}
