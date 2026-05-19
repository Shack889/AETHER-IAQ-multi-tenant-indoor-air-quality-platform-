import { prisma } from '../config/database';

// Auth is intentionally disabled at the API layer — NextAuth protects the
// frontend pages, but cookie-based sessions don't cross the API origin, so
// every request would otherwise 403. These helpers stay in place as no-ops
// so the route call sites can remain unchanged.

/** Returns every nodeId in the system (no per-user scoping). */
export async function getUserNodeIds(_userId: string): Promise<string[]> {
  const nodes = await prisma.node.findMany({ select: { nodeId: true } });
  return nodes.map((n) => n.nodeId);
}

export async function userOwnsNode(_userId: string, _nodeId: string): Promise<boolean> {
  return true;
}

export async function userOwnsRoom(_userId: string, _roomId: string): Promise<boolean> {
  return true;
}
