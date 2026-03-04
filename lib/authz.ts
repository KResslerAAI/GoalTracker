import { Role, type User } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getMockUserById, isMockMode } from "@/lib/mock-store";

export async function requireUser() {
  const session = await auth();
  const id = session?.user?.id;

  if (!id) {
    throw new Error("Unauthorized");
  }

  if (isMockMode) {
    const user = getMockUserById(id);
    if (!user || !user.active) {
      throw new Error("Unauthorized");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      teamId: user.teamId,
      image: null,
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies User;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.active) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireManager() {
  const user = await requireUser();
  if (user.role !== Role.MANAGER) {
    throw new Error("Forbidden");
  }
  return user;
}
