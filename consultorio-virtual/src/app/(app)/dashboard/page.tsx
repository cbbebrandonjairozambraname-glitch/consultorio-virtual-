import Link from "next/link";
import { redirect } from "next/navigation";
import { endOfDay, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { fmtTime } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "PATIENT") redirect("/portal");

  const now = new Date();
  const base: Prisma.AppointmentWhereInput = {
    startsAt: { gte: startOfDay(now), lte: endOfDay(now) },
    ...(user.role === "DOCTOR" ? { specialistId: user.specialistId ?? "none" } : {}),
  };

  const [total, waiting, inProgress, completed, next, patients] = await Promise.all([
    prisma.appointment.count({ where: { ...base, status: { notIn: ["CANCELLED", "NO_SHOW"] } } }),
    prisma.appointment.count({ where: { ...base, status: "WAITING" } }),
    prisma.appointment.count({ where: { ...base, status: "IN_PROGRESS" } }),
    prisma.appointment.count({ where: { ...base, status: "COMPLETED" } }),
    prisma.appointment.findMany({
      where: { ...base, status: { in: ["SCHEDULED", "CONFIRMED", "WAITING", "IN_PROGRESS"] } },
      orderBy: { startsAt: "asc" },
      take: 8,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        specialist: { select: { specialty: true } },
      },
    }),
    prisma.patient.count(),
  ]);

  const cards = [
    { label: "Citas de hoy", value: total },
    { label: "En sala de espera", value: waiting },
    { label: "En consulta", value: inProgress },
    { label: "Completadas", value: completed },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resumen del día</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-3xl font-bold text-teal-700">{c.value}</div>
            <div className="text-sm text-slate-600">{c.label}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Próximas citas de hoy</h2>
          <Link href="/waiting-room" className="text-sm text-teal-700 underline">
            Ir a la sala de espera
          </Link>
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <tbody className="divide-y divide-slate-100">
            {next.map((a) => (
              <tr key={a.id}>
                <td className="td">{fmtTime(a.startsAt)}</td>
                <td className="td">
                  {a.patient.firstName} {a.patient.lastName}
                </td>
                <td className="td">{a.specialist.specialty}</td>
                <td className="td">
                  <StatusBadge status={a.status} />
                </td>
              </tr>
            ))}
            {next.length === 0 && (
              <tr>
                <td className="td text-slate-500">No hay citas pendientes hoy.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-sm text-slate-500">{patients} pacientes registrados en la base compartida.</p>
    </div>
  );
}
