import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { inviteMockTeamMember, isMockMode, listMockTeamMembers, removeMockTeamMember } from "@/lib/mock-store";

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.nativeEnum(Role).default(Role.MEMBER)
});

const deleteSchema = z.object({
  userId: z.string().min(1)
});

export async function GET() {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(listMockTeamMembers(manager.teamId));
    }

    const users = await prisma.user.findMany({
      where: { teamId: manager.teamId, role: Role.MEMBER, active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    });

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const invited = inviteMockTeamMember({
        teamId: manager.teamId,
        email: payload.email,
        name: payload.name,
        role: payload.role
      });
      return NextResponse.json({ invited: true, userId: invited.userId });
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: {
        name: payload.name,
        teamId: manager.teamId,
        role: payload.role,
        active: true
      },
      create: {
        email: payload.email,
        name: payload.name,
        teamId: manager.teamId,
        role: payload.role,
        active: true
      }
    });

    return NextResponse.json({ invited: true, userId: user.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = deleteSchema.parse(await req.json());

    if (isMockMode) {
      const removed = removeMockTeamMember(manager.teamId, payload.userId);
      if (!removed) {
        return NextResponse.json({ error: "Team member not found" }, { status: 404 });
      }
      return NextResponse.json({ removed: true, userId: payload.userId });
    }

    const target = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        teamId: manager.teamId,
        role: Role.MEMBER
      }
    });
    if (!target) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: { teamId: null }
    });

    return NextResponse.json({ removed: true, userId: payload.userId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
