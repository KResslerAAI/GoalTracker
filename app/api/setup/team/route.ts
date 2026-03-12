import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getMockTeam, isMockMode, setupMockTeamForManager, updateMockTeam } from "@/lib/mock-store";

const schema = z.object({
  teamName: z.string().min(1)
});

const defaultQuestions = [
  {
    key: "weekly_next_steps",
    prompt: "Weekly priorities",
    type: "short_answer"
  }
] as const;

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ teamId: null, name: null });
    }

    if (isMockMode) {
      const team = getMockTeam(user.teamId);
      return NextResponse.json({ teamId: team?.id ?? user.teamId, name: team?.name ?? null });
    }

    const team = await prisma.team.findUnique({
      where: { id: user.teamId },
      select: { id: true, name: true }
    });
    return NextResponse.json({ teamId: team?.id ?? user.teamId, name: team?.name ?? null });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const team = setupMockTeamForManager(user.id, payload.teamName);
      return NextResponse.json(team);
    }

    const team = await prisma.team.create({
      data: {
        name: payload.teamName,
        // Team timezone is only a fallback. Individual user timezones control reminders/check-ins.
        timezone: "UTC"
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { teamId: team.id, role: "MANAGER" }
    });

    await prisma.checkinTemplateQuestion.createMany({
      data: defaultQuestions.map((q) => ({
        teamId: team.id,
        key: q.key,
        prompt: q.prompt,
        type: q.type,
        required: true,
        isDefault: true
      }))
    });

    return NextResponse.json({ teamId: team.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const team = updateMockTeam(user.teamId, { name: payload.teamName });
      if (!team) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      return NextResponse.json({ teamId: team.id, name: team.name });
    }

    const team = await prisma.team.update({
      where: { id: user.teamId },
      data: { name: payload.teamName },
      select: { id: true, name: true }
    });

    return NextResponse.json({ teamId: team.id, name: team.name });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
