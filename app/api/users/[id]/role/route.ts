import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isMockMode, updateMockUser } from "@/lib/mock-store";

const schema = z.object({
  role: z.nativeEnum(Role)
});

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const current = await requireUser();
    if (current.id !== context.params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = schema.parse(await req.json());

    if (isMockMode) {
      const updated = updateMockUser(current.id, { role: body.role });
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, role: updated.role });
    }

    const updated = await prisma.user.update({
      where: { id: current.id },
      data: { role: body.role },
      select: { role: true }
    });

    return NextResponse.json({ ok: true, role: updated.role });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

