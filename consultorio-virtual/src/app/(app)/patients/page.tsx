import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ageFrom } from "@/lib/utils";

export default async function PatientsPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  const q = (searchParams.q ?? "").trim();

  const where: Prisma.PatientWhereInput = q
    ? {
        OR: [
          { documentId: { contains: q } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const patients = await prisma.patient.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 100,
  });
  if (q) await audit({ userId: user.id, action: "PATIENT_SEARCH", metadata: { q } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Pacientes</h1>
        <Link href="/patients/new" className="btn">
          + Nuevo paciente
        </Link>
      </div>
      <form method="GET" className="flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Buscar por nombre o documento" />
        <button className="btn">Buscar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Documento</th>
              <th className="th">Nombre</th>
              <th className="th">Edad</th>
              <th className="th">Teléfono</th>
              <th className="th">Aseguradora</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((p) => (
              <tr key={p.id}>
                <td className="td">{p.documentId}</td>
                <td className="td">
                  {p.lastName}, {p.firstName}
                </td>
                <td className="td">{ageFrom(p.birthDate)}</td>
                <td className="td">{p.phone ?? "—"}</td>
                <td className="td">{p.insurance ?? "—"}</td>
                <td className="td space-x-1 whitespace-nowrap">
                  <Link className="btn-secondary btn-sm" href={`/patients/${p.id}`}>
                    Ver
                  </Link>
                  <Link className="btn-secondary btn-sm" href={`/appointments/new?patientId=${p.id}`}>
                    Agendar
                  </Link>
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={6}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
