import { addMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fail, handleError, HttpError, ok } from "@/lib/api";
import { CHECKIN_MINUTES_BEFORE } from "@/lib/constants";

/** El paciente (o recepción) marca su llegada: la cita pasa a la sala de espera virtual. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard(["PATIENT", "RECEPTION", "ADMIN"]);
    if ("error" in g) return g.error;
    const { user } = g.session;

    const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
    if (!appt) return fail("Cita no encontrada", 404);
    if (user.role === "PATIENT" && appt.patientId !== user.patientId) return fail("No tiene permisos", 403);

    if (appt.status === "WAITING" || appt.status === "IN_PROGRESS") return ok({ status: appt.status });
    if (appt.status !== "SCHEDULED" && appt.status !== "CONFIRMED") {
      throw new HttpError(409, "La cita no admite ingreso a la sala de espera");
    }
    const now = new Date();
    if (now < addMinutes(appt.startsAt, -CHECKIN_MINUTES_BEFORE)) {
      throw new HttpError(400, `La sala abre ${CHECKIN_MINUTES_BEFORE} minutos antes de la cita`);
    }
    if (now > appt.endsAt) throw new HttpError(400, "La hora de la cita ya pasó");

    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: "WAITING", checkedInAt: now },
    });
    await audit({ userId: user.id, action: "WAITING_ROOM_CHECKIN", entity: "Appointment", entityId: appt.id, req });
    return ok({ status: updated.status });
  } catch (e) {
    return handleError(e);
  }
}
