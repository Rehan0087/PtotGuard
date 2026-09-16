import { IsBoolean, IsString, Matches, MinLength } from "class-validator";

export class CompleteVerificationDto {
  @IsBoolean() applicantVerified!: boolean;
  @IsBoolean() previousOwnerVerified!: boolean;
  @IsBoolean() proposedOwnerVerified!: boolean;
  @IsBoolean() dagKhatianVerified!: boolean;
  @IsBoolean() deedVerified!: boolean;
  @IsBoolean() landRecordMatched!: boolean;
  @IsBoolean() documentsPresent!: boolean;
  @IsBoolean() khajnaReceiptVerified!: boolean;

  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  notes!: string;
}
