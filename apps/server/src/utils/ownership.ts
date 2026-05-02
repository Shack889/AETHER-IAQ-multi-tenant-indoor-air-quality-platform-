import { prisma } from '../config/database';

/** Returns nodeIds belonging to rooms owned by the user. */
export async function getUserNodeIds(userId: string): Promise<string[]> {
  const nodes = await prisma.node.findMany({
    where: { room: { userId } },
    select: { nodeId: true },
  });
  return nodes.map((n) => n.nodeId);
}

export async function userOwnsNode(userId: string, nodeId: string): Promise<boolean> {
  const node = await prisma.node.findUnique({
    where: { nodeId },
    select: { room: { select: { userId: true } } },
  });
  return node?.room?.userId === userId;
}

export async function userOwnsRoom(userId: string, roomId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { userId: true },
  });
  return room?.userId === userId;
}
