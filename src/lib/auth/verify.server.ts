export async function getSessionUser(): Promise<{ id: string } | null> {
  return { id: "guest" };
}
export async function requireUserId(): Promise<string> {
  return "guest";
}
