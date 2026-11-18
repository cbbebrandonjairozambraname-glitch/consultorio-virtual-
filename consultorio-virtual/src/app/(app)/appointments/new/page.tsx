import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import NewAppointmentForm from "@/components/NewAppointmentForm";

export default async function NewAppointmentPage({ searchParams }: { searchParams: { patientId?: string } }) {
  const user = await requireUser();

  const specialists = (
    await prisma.specialist.findMany({
      where: { user: { active: true } },
      select: { id: true, specialty: true, user: { select: { name: true } } },
      orderBy: { specialty: "asc" },
    })
  ).map((s) => ({ id: s.id, specialty: s.specialty, name: s.user.name }));

  const initialPatient =
    user.role !== "PATIENT" && searchParams.patientId
      ? await prisma.patient.findUnique({
          where: { id: searchParams.patientId },
          select: { id: true, documentId: true, firstName: true, lastName: true },
        })
      : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{user.role === "PATIENT" ? "Solicitar cita" : "Nueva cita"}</h1>
      <NewAppointmentForm
        role={user.role}
        specialists={specialists}
        initialPatient={initialPatient}
        defaultSpecialistId={user.role === "DOCTOR" ? user.specialistId ?? undefined : undefined}
      />
    </div>
  );
}
