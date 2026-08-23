export const auth = {
  handler: async (_req: Request) => new Response("auth disabled", { status: 404 }),
};
