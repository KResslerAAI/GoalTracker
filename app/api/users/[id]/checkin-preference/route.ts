import { CheckinCadence } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { getOrCreatePreference } from "@/lib/checkins";
import { weekStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { getOrCreateMockPreference, isMockMode, updateMockPreference } from "@/lib/mock-store";

const updateSchema = z.object({
  cadence: z.nativeEnum(CheckinCadence),
  timezone: z.string().optional(),
  reminderMethod: z.enum(["TEAMS_MESSAGE", "EMAIL", "BOTH"]).optional()
});

export async function GET(_: NextRequest, context: { params: { id: string } }) {
  try {
    const current = await requireUser();
    if (current.id !== context.params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isMockMode) {
      return NextResponse.json(getOrCreateMockPreference(current.id));
    }

    const pref = await getOrCreatePreference(current.id);
    return NextResponse.json({ ...pref, reminderMethod: "BOTH" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  try {
    const current = await requireUser();
    if (current.id !== context.params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isMockMode) {
      const body = updateSchema.parse(await req.json());
      return NextResponse.json(updateMockPreference(current.id, body.cadence, body.timezone, body.reminderMethod));
    }

    const existing = await getOrCreatePreference(current.id);
    const body = updateSchema.parse(await req.json());
    const anchorWeekStartDate =
      body.cadence === CheckinCadence.BIWEEKLY ? weekStart(new Date()) : existing.anchorWeekStartDate;

    const pref = await prisma.userCheckinPreference.upsert({
      where: { userId: current.id },
      update: {
        cadence: body.cadence,
        timezone: body.timezone,
        anchorWeekStartDate
      },
      create: {
        userId: current.id,
        cadence: body.cadence,
        timezone: body.timezone,
        anchorWeekStartDate
      }
    });

    return NextResponse.json({ ...pref, reminderMethod: body.reminderMethod ?? "BOTH" });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
