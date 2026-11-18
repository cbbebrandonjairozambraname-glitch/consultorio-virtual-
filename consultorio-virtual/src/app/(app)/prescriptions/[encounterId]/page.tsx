import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ageFrom, fmtDate, fmtDateTime, fullName } from "@/lib/utils";
import { ORDER_TYPE_LABEL } from "@/lib/constants";
import PrintButton from "@/components/PrintButton";

export default async function PrescriptionPage({ params }: { params: { encounterId: string } }) {
  const user = await requireUser(["DOCTOR", "PATIENT"]);
  const enc = await prisma.encounter.findUnique({
    where: { id: params.encounterId },
    include: {
      patient: true,
      specialist: { include: { user: { select: { name: true } } } },
      appointment: { select: { startsAt: true } },
      diagnoses: { include: { cie10: true }, orderBy: { type: "asc" } },
      prescriptions: true,
      orders: true,
    },
  });
  if (!enc || enc.status !== "SIGNED") notFound();
  // Solo el especialista que firmó o el propio paciente
  const allowed =
    (user.role === "DOCTOR" && enc.specialistId === user.specialistId) ||
    (user.role === "PATIENT" && enc.patientId === user.patientId);
  if (!allowed) notFound();

  await audit({ userId: user.id, action: "PRESCRIPTION_VIEW", entity: "Encounter", entityId: enc.id });

  return (
    <div className="mx-auto max-w-3xl space-y-6 bg-white p-6">
      <div className="no-print">
        <PrintButton />
      </div>

      <header className="border-b-2 border-teal-700 pb-3">
        <div className="text-xl font-bold text-teal-700">Consultorio Virtual</div>
        <div className="text-sm">
          {enc.specialist.user.name} — {enc.specialist.specialty} · Registro {enc.specialist.licenseNumber}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <b>Paciente:</b> {fullName(enc.patient)}
        </div>
        <div>
          <b>Documento:</b> {enc.patient.documentId}
        </div>
        <div>
          <b>Edad:</b> {ageFrom(enc.patient.birthDate)} años
        </div>
        <div>
          <b>Fecha:</b> {fmtDate(enc.appointment.startsAt)}
        </div>
        {enc.patient.allergies && (
          <div className="col-span-2">
            <b>Alergias:</b> {enc.patient.allergies}
          </div>
        )}
        <div className="col-span-2">
          <b>Diagnósticos:</b> {enc.diagnoses.map((d) => `${d.cie10Code} ${d.cie10.description}`).join("; ")}
        </div>
      </section>

      <section>
        <h2 className="mb-2 border-b font-semibold">Prescripción</h2>
        {enc.prescriptions.length === 0 ? (
          <p className="text-sm text-slate-500">Sin medicamentos prescritos.</p>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {enc.prescriptions.map((p) => (
              <li key={p.id}>
                <b>{p.medication}</b> — {p.dose}, {p.frequency}, durante {p.duration}
                {p.instructions && <div className="text-slate-600">{p.instructions}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-2 border-b font-semibold">Órdenes médicas</h2>
        {enc.orders.length === 0 ? (
          <p className="text-sm text-slate-500">Sin órdenes.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {enc.orders.map((o) => (
              <li key={o.id}>
                <b>{ORDER_TYPE_LABEL[o.type]}:</b> {o.description}
                {o.priority === "URGENT" && <span className="ml-2 font-semibold text-red-600">URGENTE</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="pt-8 text-sm">
        <div className="w-64 border-t border-slate-700 pt-1">
          {enc.specialist.user.name}
          <div className="text-xs text-slate-600">
            Firmado electrónicamente el {enc.signedAt ? fmtDateTime(enc.signedAt) : "—"}
          </div>
        </div>
      </footer>
    </div>
  );
}
