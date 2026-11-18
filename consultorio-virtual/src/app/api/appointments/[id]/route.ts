import { addMinutes, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fail, handleError, HttpError, ok } from "@/lib/api";
import { appointmentPatchSchema } from "@/lib/validators";
import { assertSlotFree, getAvailableSlots } from "@/lib/slots";

const OPEN = ["SCHEDULED", "CONFIRMED", "WAITING"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard();
    if ("error" in g) return g.error;
    const { user } = g.session;

    const body = appointmentPatchSchema.parse(await req.json());
    const appt = await prisma.appointment.findUnique({ where: { id: params.id }, include: { specialist: true } });
    if (!appt) return fail("Cita no encontrada", 404);

    // Permisos por rol
    if (user.role === "PATIENT") {
      if (appt.patientId !== user.patientId) return fail("No tiene permisos", 403);
      if (body.action !== "cancel") return fail("El paciente solo puede cancelar su cita", 403);
    }
    if (user.role === "DOCTOR" && appt.specialistId !== user.specialistId) return fail("No tiene permisos", 403);

    let updated;
    switch (body.action) {
      case "confirm":
        if (appt.status !== "SCHEDULED") throw new HttpError(409, "Solo se pueden confirmar citas programadas");
        updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status: "CONFIRMED" } });
        break;
      case "no_show":
        if (!OPEN.includes(appt.status)) throw new HttpError(409, "Estado inválido para marcar inasistencia");
        updated = await prisma.appointment.update({ where: { id: appt.id }, data: { status: "NO_SHOW" } });
        break;
      case "cancel":
        if (!OPEN.includes(appt.status)) throw new HttpError(409, "La cita ya no se puede cancelar");
        updated = await prisma.appointment.update({
          where: { id: appt.id },
          data: { status: "CANCELLED", cancelReason: body.reason ?? null },
        });
        break;
      case "reschedule": {
        if (user.role === "PATIENT") return fail("No tiene permisos", 403);
        if (!OPEN.includes(appt.status)) throw new HttpError(409, "La cita no se puede reprogramar");
        const start = body.startsAt;
        const slots = await getAvailableSlots(appt.specialistId, startOfDay(start));
        if (!slots.includes(start.toISOString())) throw new HttpError(409, "Ese horario no está disponible");
        const end = addMinutes(start, appt.specialist.slotMinutes);
        updated = await prisma.$transaction(
          async (tx) => {
            await assertSlotFree(tx, {
              specialistId: appt.specialistId,
              patientId: appt.patientId,
              start,
              end,
              excludeId: appt.id,
            });
            return tx.appointment.update({
              where: { id: appt.id },
              data: { startsAt: start, endsAt: end, status: "SCHEDULED", checkedInAt: null },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        break;
      }
    }

    await audit({
      userId: user.id,
      action: `APPOINTMENT_${body.action.toUpperCase()}`,
      entity: "Appointment",
      entityId: appt.id,
      req,
    });
    return ok(updated);
  } catch (e) {
    return handleError(e);
  }
}
