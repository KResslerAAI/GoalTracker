import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, setupMockTeamForManager } from "@/lib/mock-store";

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
