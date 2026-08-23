export const auth = {
  handler: async (_request: Request) => new Response("auth off", { status: 404 }),
};
