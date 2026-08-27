import { IsString } from "class-validator";

export class FileObjectionDto {
  @IsString()
  objectionText!: string;
}
