require('reflect-metadata');
const { validateSync, IsOptional, IsString, IsIn, Allow } = require("class-validator");
const { plainToInstance } = require("class-transformer");

class TestDto {
  constructor() {
    this.decision = undefined;
    this.message = undefined;
  }
}
Reflect.decorate([
  IsIn(["approve", "reject"]),
  Reflect.metadata("design:type", String)
], TestDto.prototype, "decision", void 0);
Reflect.decorate([
  Allow(),
  IsOptional(),
  IsString(),
  Reflect.metadata("design:type", String)
], TestDto.prototype, "message", void 0);

const obj = plainToInstance(TestDto, { decision: "reject", message: "hello" });
console.log("Transformed:", obj);
const errors = validateSync(obj, { whitelist: true, forbidNonWhitelisted: true });
console.log("Errors:", errors);
