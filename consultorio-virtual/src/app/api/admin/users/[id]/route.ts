import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fail, handleError, ok } from "@/lib/api";
import { userPatchSchema } from "@/lib/validators";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard(["ADMIN"]);
    if ("error" in g) return g.error;

    const d = userPatchSchema.parse(await req.json());
    if (d.active === false && params.id === g.session.user.id) {
      return fail("No puede desactivar su propia cuenta", 409);
    }

    await prisma.user.update({
      where: { id: params.id },
      data: {
        name: d.name,
        active: d.active,
        ...(d.newPassword
          ? { passwordHash: await bcrypt.hash(d.newPassword, 12), failedLogins: 0, lockedUntil: null }
          : {}),
      },
    });

    await audit({
      userId: g.session.user.id,
      action: d.newPassword ? "USER_PASSWORD_RESET" : d.active !== undefined ? "USER_TOGGLE_ACTIVE" : "USER_UPDATE",
      entity: "User",
      entityId: params.id,
      metadata: d.active !== undefined ? { active: d.active } : undefined,
      req,
    });
    return ok({ updated: true });
  } catch (e) {
    return handleError(e);
  }
}
