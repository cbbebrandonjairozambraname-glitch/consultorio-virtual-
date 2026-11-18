import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getPatientHistory } from "@/lib/clinical";
import { ageFrom, fmtBirth, fmtDateTime, fullName } from "@/lib/utils";
import { ORDER_TYPE_LABEL, SEX_LABEL } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  // Contenido clínico: solo especialistas (mínimo privilegio). Admin y recepción ven datos administrativos.
  const canSeeClinical = user.role === "DOCTOR";
  const [appointments, history] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startsAt: "desc" },
      take: 15,
      include: { specialist: { select: { specialty: true } } },
    }),
    canSeeClinical ? getPatientHistory(patient.id) : Promise.resolve([]),
  ]);

  await audit({ userId: user.id, action: "PATIENT_VIEW", entity: "Patient", entityId: patient.id });
  if (canSeeClinical) {
    await audit({ userId: user.id, action: "EHR_HISTORY_VIEW", entity: "Patient", entityId: patient.id });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{fullName(patient)}</h1>
        <div className="flex gap-2">
          <Link className="btn-secondary" href={`/patients/${patient.id}/edit`}>
            Editar datos
          </Link>
          <Link className="btn" href={`/appointments/new?patientId=${patient.id}`}>
            Agendar cita
          </Link>
        </div>
      </div>

      <div className="card grid gap-2 text-sm md:grid-cols-3">
        <div>
          <b>Documento:</b> {patient.documentId}
        </div>
        <div>
          <b>Nacimiento:</b> {fmtBirth(patient.birthDate)} ({ageFrom(patient.birthDate)} años)
        </div>
        <div>
          <b>Sexo:</b> {SEX_LABEL[patient.sex]}
        </div>
        <div>
          <b>Teléfono:</b> {patient.phone ?? "—"}
        </div>
        <div>
          <b>Correo:</b> {patient.email ?? "—"}
        </div>
        <div>
          <b>Aseguradora:</b> {patient.insurance ?? "—"}
        </div>
        <div className="md:col-span-3">
          <b>Dirección:</b> {patient.address ?? "—"}
        </div>
        {patient.allergies && (
          <div className="rounded bg-red-50 px-2 py-1 font-medium text-red-700 md:col-span-3">
            ⚠ Alergias: {patient.allergies}
          </div>
        )}
      </div>

      <section className="card">
        <h2 className="mb-2 font-semibold">Citas</h2>
        <table className="min-w-full divide-y divide-slate-200">
          <tbody className="divide-y divide-slate-100">
            {appointments.map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap">{fmtDateTime(a.startsAt)}</td>
                <td className="td">{a.specialist.specialty}</td>
                <td className="td">{a.reason}</td>
                <td className="td">
                  <StatusBadge status={a.status} />
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td className="td text-slate-500">Sin citas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {canSeeClinical ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Historia clínica (base compartida entre especialistas)</h2>
          {history.length === 0 && <p className="text-sm text-slate-500">Sin consultas firmadas.</p>}
          {history.map((h) => (
            <details key={h.id} className="card" open={history[0]?.id === h.id}>
              <summary className="cursor-pointer font-medium">
                {fmtDateTime(h.signedAt ?? h.createdAt)} · {h.specialist.specialty} · {h.specialist.user.name}
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <b>Motivo:</b> {h.appointment.reason}
                </div>
                <div className="whitespace-pre-wrap">
                  <b>S:</b> {h.subjective || "—"}
                </div>
                <div className="whitespace-pre-wrap">
                  <b>O:</b> {h.objective || "—"}
                </div>
                <div className="whitespace-pre-wrap">
                  <b>A:</b> {h.assessment || "—"}
                </div>
                <div className="whitespace-pre-wrap">
                  <b>P:</b> {h.plan || "—"}
                </div>
                <div>
                  <b>Diagnósticos:</b>{" "}
                  {h.diagnoses.map((d) => `${d.cie10Code} ${d.cie10.description}${d.type === "PRIMARY" ? " (principal)" : ""}`).join("; ") ||
                    "—"}
                </div>
                {h.prescriptions.length > 0 && (
                  <div>
                    <b>Prescripción:</b>{" "}
                    {h.prescriptions.map((p) => `${p.medication} ${p.dose}, ${p.frequency}, ${p.duration}`).join("; ")}
                  </div>
                )}
                {h.orders.length > 0 && (
                  <div>
                    <b>Órdenes:</b>{" "}
                    {h.orders.map((o) => `${ORDER_TYPE_LABEL[o.type]}: ${o.description}`).join("; ")}
                  </div>
                )}
              </div>
            </details>
          ))}
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          El contenido clínico solo es visible para los especialistas tratantes (principio de mínimo privilegio).
        </p>
      )}
    </div>
  );
}
