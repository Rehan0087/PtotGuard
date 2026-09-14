import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "../common/domain-exceptions";
import { AuthController } from "./auth.controller";
import { UpdateProfileDto } from "./update-profile.dto";

const request = { header: (name: string) => name === "x-plotguard-role" ? "land-office" : undefined } as never;

describe("profile update DTO", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (value: object) => pipe.transform(value, { type: "body", metatype: UpdateProfileDto });

  it("accepts and trims editable personal information", async () => {
    await expect(validate({ name: "  Nasrin Akter  ", email: " N.Akter@example.bd ", phone: " +8801712345678 ", profileDetails: { nameBn: "নাসরিন" } }))
      .resolves.toMatchObject({ name: "Nasrin Akter", email: "N.Akter@example.bd", phone: "+8801712345678" });
  });

  it.each([{ name: " " }, { email: "not-an-email" }, { phone: "123" }])("rejects invalid personal information: %j", async (body) => {
    await expect(validate(body)).rejects.toMatchObject({ status: 400 });
  });
});

describe("AuthController.updateMe", () => {
  it("updates the signed-in land officer's personal information", async () => {
    const updated = { id: "usr-officer", name: "Nasrin Sultana", email: "nasrin@minland.gov.bd" };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const controller = new AuthController(prisma as never);
    const result = await controller.updateMe(request, {
      name: "Nasrin Sultana", email: "nasrin@minland.gov.bd", phone: "+8801712345678",
      profileDetails: { currentAddress: "Debidwar, Cumilla" },
    });

    expect(result).toEqual(updated);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "usr-officer" },
      data: expect.objectContaining({ name: "Nasrin Sultana", email: "nasrin@minland.gov.bd", phone: "+8801712345678" }),
    }));
  });

  it("refuses an email address owned by another account", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "usr-other" }),
        update: vi.fn(),
      },
    };
    const controller = new AuthController(prisma as never);

    await expect(controller.updateMe(request, { email: "used@example.bd" })).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
