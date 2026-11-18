import Link from "next/link";
import { addMinutes } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { CHECKIN_MINUTES_BEFORE } from "@/lib/constants";
import { fmtDateTime } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import AppointmentActions from "@/components/AppointmentActions";

export default async function PortalPage() {
  const user = await requireUser(["PATIENT"]);
  const appts = user.patientId
    ? await prisma.appointment.findMany({
        where: { patientId: user.patientId },
        orderBy: { startsAt: "desc" },
        take: 50,
        include: {
          specialist: { select: { specialty: true, user: { select: { name: true } } } },
          encounter: { select: { id: true, status: true } },
        },
      })
    : [];

  const now = new Date();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis citas</h1>
        <Link className="btn" href="/appointments/new">
          Solicitar cita
        </Link>
      </div>
      {!user.patientId && <p className="card text-sm">Su cuenta aún no está vinculada a un paciente. Contacte a recepción.</p>}
      <div className="space-y-3">
        {appts.map((a) => {
          const canJoin =
            ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS"].includes(a.status) &&
            now >= addMinutes(a.startsAt, -CHECKIN_MINUTES_BEFORE) &&
            now <= a.endsAt;
          return (
            <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold">
                  {a.specialist.specialty} — {a.specialist.user.name}
                </div>
                <div className="text-sm text-slate-600">{fmtDateTime(a.startsAt)}</div>
                <div className="text-sm">{a.reason}</div>
                <StatusBadge status={a.status} />
              </div>
              <div className="flex flex-col items-end gap-2">
                {canJoin && (
                  <Link className="btn" href={`/portal/room/${a.id}`}>
                    Ingresar a la sala de espera
                  </Link>
                )}
                {a.encounter?.status === "SIGNED" && (
                  <Link className="btn-secondary" href={`/prescriptions/${a.encounter.id}`} target="_blank">
                    Ver prescripción y órdenes
                  </Link>
                )}
                <AppointmentActions id={a.id} status={a.status} role="PATIENT" />
              </div>
            </div>
          );
        })}
        {appts.length === 0 && user.patientId && <p className="text-sm text-slate-500">Aún no tiene citas.</p>}
      </div>
    </div>
  );
}
