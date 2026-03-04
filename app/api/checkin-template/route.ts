import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager, requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { addMockCheckinTemplateQuestion, getMockCheckinTemplate, isMockMode } from "@/lib/mock-store";
import { encodeQuestionPrompt } from "@/lib/checkin-questions";

const schema = z.object({
  key: z.string().min(1),
  prompt: z.string().min(1),
  type: z.enum(["short_answer", "multiple_choice", "single_choice", "likert", "ranking", "text", "number", "boolean"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  rankMax: z.number().int().min(2).max(10).optional()
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      return NextResponse.json(getMockCheckinTemplate(user.teamId));
    }

    const questions = await prisma.checkinTemplateQuestion.findMany({
      where: { teamId: user.teamId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    return NextResponse.json(questions);
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
    const prompt = encodeQuestionPrompt(payload.prompt, {
      type: payload.type,
      options: payload.options,
      rankMax: payload.rankMax
    });

    if (isMockMode) {
      const question = addMockCheckinTemplateQuestion({
        teamId: manager.teamId,
        key: payload.key,
        prompt,
        type: payload.type,
        required: payload.required
      });
      return NextResponse.json(question, { status: 201 });
    }

    const question = await prisma.checkinTemplateQuestion.create({
      data: {
        teamId: manager.teamId,
        key: payload.key,
        prompt,
        type: payload.type,
        required: payload.required,
        isDefault: false
      }
    });

    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
