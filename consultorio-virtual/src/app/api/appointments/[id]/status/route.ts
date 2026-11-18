import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { fail, handleError, ok } from "@/lib/api";

/**
 * Endpoint ligero para el sondeo del paciente en la sala de espera.
 * El nombre de la sala de video solo se revela cuando el especialista inició la consulta.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard();
    if ("error" in g) return g.error;
    const { user } = g.session;

    const appt = await prisma.appointment.findUnique({
      where: { id: params.id },
      select: { status: true, roomName: true, patientId: true, specialistId: true },
    });
    if (!appt) return fail("Cita no encontrada", 404);
    if (user.role === "PATIENT" && appt.patientId !== user.patientId) return fail("No tiene permisos", 403);
    if (user.role === "DOCTOR" && appt.specialistId !== user.specialistId) return fail("No tiene permisos", 403);

    return ok({ status: appt.status, roomName: appt.status === "IN_PROGRESS" ? appt.roomName : null });
  } catch (e) {
    return handleError(e);
  }
}
