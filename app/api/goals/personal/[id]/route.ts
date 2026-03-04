import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, updateMockPersonalGoal } from "@/lib/mock-store";

const schema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETE", "ARCHIVED"]).optional(),
  targetValue: z.number().positive().optional(),
  unit: z.string().optional(),
  dueDate: z.string().optional()
});

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const payload = schema.parse(await req.json());

    if (isMockMode) {
      const goal = updateMockPersonalGoal(context.params.id, user.id, {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        targetValue: payload.targetValue,
        unit: payload.unit,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined
      });
      if (!goal) {
        return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      }
      return NextResponse.json(goal);
    }

    const existing = await prisma.personalGoal.findFirst({ where: { id: context.params.id, ownerUserId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const goal = await prisma.personalGoal.update({
      where: { id: context.params.id },
      data: {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        targetValue: payload.targetValue,
        unit: payload.unit,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined
      }
    });

    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
