import { issueAuthTokens } from "./apps/api/src/auth/dev-current-user";

const tokens = issueAuthTokens({ id: "usr-ayesha", role: "citizen" });
console.log(tokens.accessToken);
