import { randomBytes } from "crypto";
import { addMinutes, endOfDay, startOfDay } from "date-fns";
import { Prisma, type AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { fail, handleError, HttpError, ok } from "@/lib/api";
import { appointmentCreateSchema } from "@/lib/validators";
import { assertSlotFree, getAvailableSlots } from "@/lib/slots";
import { parseDateParam } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const g = await guard();
    if ("error" in g) return g.error;
    const { user } = g.session;
    const sp = new URL(req.url).searchParams;

    const where: Prisma.AppointmentWhereInput = {};
    const date = sp.get("date");
    if (date) where.startsAt = { gte: startOfDay(parseDateParam(date)), lte: endOfDay(parseDateParam(date)) };
    const status = sp.get("status");
    if (status) where.status = status as AppointmentStatus;
    if (sp.get("specialistId")) where.specialistId = sp.get("specialistId")!;

    // Aislamiento de agendas por rol
    if (user.role === "DOCTOR") where.specialistId = user.specialistId ?? "none";
    if (user.role === "PATIENT") where.patientId = user.patientId ?? "none";

    const list = await prisma.appointment.findMany({
      where,
      orderBy: { startsAt: "asc" },
      take: 200,
      include: {
        patient: { select: { firstName: true, lastName: true, documentId: true } },
        specialist: { select: { specialty: true, user: { select: { name: true } } } },
      },
    });
    return ok(list);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const g = await guard();
    if ("error" in g) return g.error;
    const { user } = g.session;

    const body = appointmentCreateSchema.parse(await req.json());

    const patientId = user.role === "PATIENT" ? user.patientId : body.patientId;
    if (!patientId) throw new HttpError(400, "Debe indicar el paciente");
    if (user.role === "DOCTOR" && body.specialistId !== user.specialistId) {
      throw new HttpError(403, "Solo puede agendar en su propia agenda");
    }

    const spec = await prisma.specialist.findUnique({ where: { id: body.specialistId } });
    if (!spec) throw new HttpError(404, "Especialista no encontrado");

    const start = body.startsAt;
    const slots = await getAvailableSlots(spec.id, startOfDay(start));
    if (!slots.includes(start.toISOString())) throw new HttpError(409, "Ese horario no está disponible");
    const end = addMinutes(start, spec.slotMinutes);

    const appt = await prisma.$transaction(
      async (tx) => {
        await assertSlotFree(tx, { specialistId: spec.id, patientId, start, end });
        return tx.appointment.create({
          data: {
            patientId,
            specialistId: spec.id,
            startsAt: start,
            endsAt: end,
            reason: body.reason,
            roomName: `cv-${randomBytes(12).toString("hex")}`, // sala Jitsi única e impredecible
            createdById: user.id,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await audit({ userId: user.id, action: "APPOINTMENT_CREATE", entity: "Appointment", entityId: appt.id, req });
    return ok(appt, 201);
  } catch (e) {
    return handleError(e);
  }
}
