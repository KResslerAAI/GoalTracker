import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireManager } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  deleteMockCheckinTemplateQuestion,
  isMockMode,
  updateMockCheckinTemplateQuestion
} from "@/lib/mock-store";
import { encodeQuestionPrompt } from "@/lib/checkin-questions";

const updateSchema = z.object({
  prompt: z.string().min(1),
  type: z.enum(["short_answer", "multiple_choice", "single_choice", "likert", "ranking", "text", "number", "boolean"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  rankMax: z.number().int().min(2).max(10).optional()
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    const payload = updateSchema.parse(await req.json());
    const prompt = encodeQuestionPrompt(payload.prompt, {
      type: payload.type,
      options: payload.options,
      rankMax: payload.rankMax
    });

    if (isMockMode) {
      const question = updateMockCheckinTemplateQuestion({
        teamId: manager.teamId,
        id: params.id,
        prompt,
        type: payload.type,
        required: payload.required
      });
      return NextResponse.json(question);
    }

    const existing = await prisma.checkinTemplateQuestion.findFirst({
      where: { id: params.id, teamId: manager.teamId }
    });
    if (!existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (existing.isDefault) {
      return NextResponse.json({ error: "Default questions cannot be edited" }, { status: 400 });
    }

    const question = await prisma.checkinTemplateQuestion.update({
      where: { id: params.id },
      data: {
        prompt,
        type: payload.type,
        required: payload.required
      }
    });

    return NextResponse.json(question);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const manager = await requireManager();
    if (!manager.teamId) {
      return NextResponse.json({ error: "No team assigned" }, { status: 400 });
    }

    if (isMockMode) {
      deleteMockCheckinTemplateQuestion(manager.teamId, params.id);
      return NextResponse.json({ ok: true });
    }

    const existing = await prisma.checkinTemplateQuestion.findFirst({
      where: { id: params.id, teamId: manager.teamId },
      select: { id: true, isDefault: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (existing.isDefault) {
      return NextResponse.json({ error: "Default questions cannot be deleted" }, { status: 400 });
    }

    const usageCount = await prisma.weeklyCheckinAnswer.count({
      where: { questionId: params.id }
    });
    if (usageCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete a question that already has submitted answers. Edit it instead." },
        { status: 400 }
      );
    }

    await prisma.checkinTemplateQuestion.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
