import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/utils";
import PatientRoom from "@/components/PatientRoom";

export default async function PortalRoomPage({ params }: { params: { id: string } }) {
  const user = await requireUser(["PATIENT"]);
  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { specialist: { select: { specialty: true, user: { select: { name: true } } } } },
  });
  if (!appt || appt.patientId !== user.patientId) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Teleconsulta — {appt.specialist.specialty}</h1>
        <p className="text-sm text-slate-600">
          {appt.specialist.user.name} · {fmtDateTime(appt.startsAt)}
        </p>
      </div>
      <PatientRoom
        appointmentId={appt.id}
        displayName={user.name ?? "Paciente"}
        subject={`Consulta de ${appt.specialist.specialty}`}
      />
    </div>
  );
}
