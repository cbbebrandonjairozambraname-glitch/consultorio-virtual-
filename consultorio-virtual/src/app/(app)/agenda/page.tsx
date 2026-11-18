import Link from "next/link";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { fmtDate, fmtTime, parseDateParam, toDateInput } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import AppointmentActions from "@/components/AppointmentActions";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { date?: string; specialistId?: string };
}) {
  const user = await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  const day = parseDateParam(searchParams.date);
  const dateStr = toDateInput(day);

  // Cada especialista solo ve su propia agenda; admin y recepción eligen especialista
  const specialists = await prisma.specialist.findMany({
    select: { id: true, specialty: true, user: { select: { name: true } } },
    orderBy: { specialty: "asc" },
  });
  const specialistId = user.role === "DOCTOR" ? user.specialistId ?? "none" : searchParams.specialistId || undefined;

  const appts = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: startOfDay(day), lte: endOfDay(day) },
      ...(specialistId ? { specialistId } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, documentId: true } },
      specialist: { select: { specialty: true, user: { select: { name: true } } } },
    },
  });

  const shift = (n: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + n);
    const qs = new URLSearchParams({ date: toDateInput(d) });
    if (searchParams.specialistId && user.role !== "DOCTOR") qs.set("specialistId", searchParams.specialistId);
    return `/agenda?${qs}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{user.role === "DOCTOR" ? "Mi agenda" : "Agendas"}</h1>
          <p className="text-sm capitalize text-slate-600">{fmtDate(day)}</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" method="GET">
          <div>
            <label className="label">Fecha</label>
            <input className="input" type="date" name="date" defaultValue={dateStr} />
          </div>
          {user.role !== "DOCTOR" && (
            <div>
              <label className="label">Especialista</label>
              <select className="input" name="specialistId" defaultValue={searchParams.specialistId ?? ""}>
                <option value="">Todos</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.specialty} — {s.user.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn">Ver</button>
        </form>
      </div>

      <div className="flex gap-2">
        <Link className="btn-secondary btn-sm" href={shift(-1)}>
          ← Día anterior
        </Link>
        <Link className="btn-secondary btn-sm" href={shift(1)}>
          Día siguiente →
        </Link>
        <Link className="btn btn-sm" href="/appointments/new">
          + Nueva cita
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Hora</th>
              <th className="th">Paciente</th>
              {user.role !== "DOCTOR" && <th className="th">Especialista</th>}
              <th className="th">Motivo</th>
              <th className="th">Estado</th>
              <th className="th">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {appts.map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap">
                  {fmtTime(a.startsAt)} – {fmtTime(a.endsAt)}
                </td>
                <td className="td">
                  <Link className="text-teal-700 underline" href={`/patients/${a.patient.id}`}>
                    {a.patient.firstName} {a.patient.lastName}
                  </Link>
                </td>
                {user.role !== "DOCTOR" && <td className="td">{a.specialist.specialty}</td>}
                <td className="td">{a.reason}</td>
                <td className="td">
                  <StatusBadge status={a.status} />
                </td>
                <td className="td space-y-1">
                  {user.role === "DOCTOR" && ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS", "COMPLETED"].includes(a.status) && (
                    <Link className="btn btn-sm" href={`/consult/${a.id}`}>
                      {a.status === "COMPLETED" ? "Ver historia" : a.status === "IN_PROGRESS" ? "Continuar" : "Abrir"}
                    </Link>
                  )}
                  <AppointmentActions id={a.id} status={a.status} role={user.role} />
                </td>
              </tr>
            ))}
            {appts.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={6}>
                  No hay citas para este día.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
