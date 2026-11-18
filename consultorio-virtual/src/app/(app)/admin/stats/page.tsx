import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { STATUS_LABEL } from "@/lib/constants";
import StatsCharts from "@/components/StatsCharts";

export default async function StatsPage() {
  await requireUser(["ADMIN"]);
  const since = subDays(new Date(), 30);

  const [bySpec, byStatus, topDx, specialists, totals] = await Promise.all([
    prisma.appointment.groupBy({ by: ["specialistId"], where: { startsAt: { gte: since } }, _count: { _all: true } }),
    prisma.appointment.groupBy({ by: ["status"], where: { startsAt: { gte: since } }, _count: { _all: true } }),
    prisma.diagnosis.groupBy({
      by: ["cie10Code"],
      _count: { _all: true },
      orderBy: { _count: { cie10Code: "desc" } },
      take: 10,
    }),
    prisma.specialist.findMany({ select: { id: true, specialty: true } }),
    Promise.all([prisma.patient.count(), prisma.encounter.count({ where: { status: "SIGNED" } }), prisma.user.count({ where: { active: true } })]),
  ]);

  const nameOf = new Map(specialists.map((s) => [s.id, s.specialty]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Estadísticas</h1>
      <div className="grid grid-cols-3 gap-4">
        {[
          ["Pacientes", totals[0]],
          ["Historias firmadas", totals[1]],
          ["Usuarios activos", totals[2]],
        ].map(([l, v]) => (
          <div key={String(l)} className="card">
            <div className="text-3xl font-bold text-teal-700">{v}</div>
            <div className="text-sm text-slate-600">{l}</div>
          </div>
        ))}
      </div>
      <StatsCharts
        bySpecialist={bySpec.map((r) => ({ name: nameOf.get(r.specialistId) ?? "—", value: r._count._all }))}
        byStatus={byStatus.map((r) => ({ name: STATUS_LABEL[r.status], value: r._count._all }))}
        topDiagnoses={topDx.map((r) => ({ name: r.cie10Code, value: r._count._all }))}
      />
    </div>
  );
}
