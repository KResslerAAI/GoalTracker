import { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createMockUser, isMockMode } from "@/lib/mock-store";

const schema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1, "Name is required"),
  role: z.nativeEnum(Role)
});

export async function POST(req: NextRequest) {
  try {
    const payload = schema.parse(await req.json());

    if (isMockMode) {
      createMockUser({
        email: payload.email,
        name: payload.name,
        role: payload.role
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    const existing = await prisma.user.findUnique({ where: { email: payload.email } });

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please use Log In." },
        { status: 409 }
      );
    }

    await prisma.user.create({
      data: {
        email: payload.email,
        name: payload.name,
        role: payload.role,
        active: true
      }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid signup data." }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        { error: "Database connection failed. Check DATABASE_URL and database availability." },
        { status: 500 }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "An account with this email already exists. Please use Log In." },
          { status: 409 }
        );
      }

      return NextResponse.json({ error: `Database error (${error.code}).` }, { status: 500 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: "Could not create account. Please try again." }, { status: 500 });
  }
}
