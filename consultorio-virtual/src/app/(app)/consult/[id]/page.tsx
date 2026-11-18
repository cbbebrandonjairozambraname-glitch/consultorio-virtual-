import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getPatientHistory } from "@/lib/clinical";
import { ageFrom, fullName } from "@/lib/utils";
import { SEX_LABEL } from "@/lib/constants";
import ConsultWorkspace, { type EncounterData, type HistoryItem } from "@/components/ConsultWorkspace";

export default async function ConsultPage({ params }: { params: { id: string } }) {
  const user = await requireUser(["DOCTOR"]);

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      encounter: { include: { diagnoses: { include: { cie10: true } }, prescriptions: true, orders: true } },
    },
  });
  // Cada especialista solo accede a las consultas de su propia agenda
  if (!appt || appt.specialistId !== user.specialistId) notFound();

  const historyRaw = await getPatientHistory(appt.patientId);
  const history: HistoryItem[] = historyRaw
    .filter((h) => h.id !== appt.encounter?.id)
    .map((h) => ({
      id: h.id,
      date: (h.signedAt ?? h.createdAt).toISOString(),
      specialty: h.specialist.specialty,
      doctor: h.specialist.user.name,
      reason: h.appointment.reason,
      assessment: h.assessment,
      diagnoses: h.diagnoses.map((d) => d.cie10Code),
    }));

  const e = appt.encounter;
  const encounter: EncounterData | null = e
    ? {
        id: e.id,
        status: e.status,
        subjective: e.subjective,
        objective: e.objective,
        assessment: e.assessment,
        plan: e.plan,
        vitals: (e.vitals ?? {}) as EncounterData["vitals"],
        diagnoses: e.diagnoses.map((d) => ({
          cie10Code: d.cie10Code,
          description: d.cie10.description,
          type: d.type,
          notes: d.notes ?? "",
        })),
        prescriptions: e.prescriptions.map((p) => ({
          medication: p.medication,
          dose: p.dose,
          frequency: p.frequency,
          duration: p.duration,
          instructions: p.instructions ?? "",
        })),
        orders: e.orders.map((o) => ({ type: o.type, description: o.description, priority: o.priority })),
        addenda: (Array.isArray(e.addenda) ? e.addenda : []) as EncounterData["addenda"],
      }
    : null;

  await audit({ userId: user.id, action: "CONSULT_OPEN", entity: "Appointment", entityId: appt.id });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Consulta: {fullName(appt.patient)}</h1>
      <ConsultWorkspace
        appointment={{ id: appt.id, status: appt.status, roomName: appt.roomName, reason: appt.reason }}
        patient={{
          name: fullName(appt.patient),
          documentId: appt.patient.documentId,
          age: ageFrom(appt.patient.birthDate),
          sex: SEX_LABEL[appt.patient.sex],
          allergies: appt.patient.allergies,
          insurance: appt.patient.insurance,
          phone: appt.patient.phone,
        }}
        doctorName={user.name ?? "Especialista"}
        encounter={encounter}
        history={history}
      />
    </div>
  );
}
