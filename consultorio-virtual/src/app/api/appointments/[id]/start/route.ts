import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fail, handleError, HttpError, ok } from "@/lib/api";

/** El especialista inicia la consulta: abre la sala de video y crea el borrador de historia clínica. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard(["DOCTOR"]);
    if ("error" in g) return g.error;
    const { user } = g.session;

    const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
    if (!appt) return fail("Cita no encontrada", 404);
    if (appt.specialistId !== user.specialistId) return fail("No tiene permisos", 403);
    if (!["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS"].includes(appt.status)) {
      throw new HttpError(409, "La cita no se puede iniciar en su estado actual");
    }

    const encounter = await prisma.$transaction(async (tx) => {
      if (appt.status !== "IN_PROGRESS") {
        await tx.appointment.update({ where: { id: appt.id }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
      }
      return tx.encounter.upsert({
        where: { appointmentId: appt.id },
        update: {},
        create: { appointmentId: appt.id, patientId: appt.patientId, specialistId: appt.specialistId },
      });
    });

    await audit({ userId: user.id, action: "CONSULTATION_START", entity: "Appointment", entityId: appt.id, req });
    return ok({ encounterId: encounter.id });
  } catch (e) {
    return handleError(e);
  }
}
