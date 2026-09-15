import { ValidationPipe } from "@nestjs/common";
import { UpdateProfileDto } from "./apps/api/src/auth/update-profile.dto";

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

async function run() {
  try {
    const res = await pipe.transform({
      name: "Test",
      profileDetails: {
        nameBn: "TestBn",
        occupation: "Teacher"
      }
    }, { type: "body", metatype: UpdateProfileDto });
    console.log(res);
  } catch (e) {
    console.error(e);
  }
}
run();
