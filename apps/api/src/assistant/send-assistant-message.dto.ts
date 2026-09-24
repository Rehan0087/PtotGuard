import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

const LOCALES = ["en", "bn"] as const;

export class SendAssistantMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsIn(LOCALES)
  locale!: (typeof LOCALES)[number];
}
