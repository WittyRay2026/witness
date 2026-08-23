import { createMiddleware } from "@tanstack/react-start";
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  return next({ context: { userId: "guest" } });
});
