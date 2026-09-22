import type { NestExpressApplication } from "@nestjs/platform-express";

export function configureBodyParser(app: NestExpressApplication): void {
  // Field evidence currently travels as a data URL and is persisted on the
  // field report. A normal phone photo can exceed Express' former 1 MB limit
  // after base64 expansion, which made the UI appear to accept a file while
  // no photo ever reached Postgres.
  app.useBodyParser("json", { limit: "15mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "15mb" });
}
