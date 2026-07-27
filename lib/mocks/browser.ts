import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Browser-side MSW worker. Started by MswProvider in dev/mock mode. */
export const worker = setupWorker(...handlers);
