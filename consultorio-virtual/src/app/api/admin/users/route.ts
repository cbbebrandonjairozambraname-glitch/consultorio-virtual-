import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { handleError, ok } from "@/lib/api";
import { userCreateSchema } from "@/lib/validators";

export async function GET() {
  try {
    const g = await guard(["ADMIN"]);
    if ("error" in g) return g.error;
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lastLoginAt: true,
        specialist: { select: { specialty: true, licenseNumber: true } },
      },
    });
    return ok(users);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const g = await guard(["ADMIN"]);
    if ("error" in g) return g.error;

    const d = userCreateSchema.parse(await req.json());
    const user = await prisma.user.create({
      data: {
        email: d.email.toLowerCase(),
        name: d.name,
        role: d.role,
        passwordHash: await bcrypt.hash(d.password, 12),
        specialist:
          d.role === "DOCTOR"
            ? {
                create: {
                  specialty: d.specialty!,
                  licenseNumber: d.licenseNumber!,
                  workDays: d.workDays ?? [1, 2, 3, 4, 5],
                  startHour: d.startHour ?? 8,
                  endHour: d.endHour ?? 17,
                  slotMinutes: d.slotMinutes ?? 30,
                },
              }
            : undefined,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await audit({
      userId: g.session.user.id,
      action: "USER_CREATE",
      entity: "User",
      entityId: user.id,
      metadata: { role: user.role },
      req,
    });
    return ok(user, 201);
  } catch (e) {
    return handleError(e);
  }
}
