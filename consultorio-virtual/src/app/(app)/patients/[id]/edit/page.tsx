import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import PatientForm from "@/components/PatientForm";

export default async function EditPatientPage({ params }: { params: { id: string } }) {
  await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  const p = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!p) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Editar paciente</h1>
      <PatientForm
        initial={{
          id: p.id,
          documentId: p.documentId,
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthDate.toISOString().slice(0, 10),
          sex: p.sex,
          phone: p.phone ?? "",
          email: p.email ?? "",
          address: p.address ?? "",
          allergies: p.allergies ?? "",
          insurance: p.insurance ?? "",
        }}
      />
    </div>
  );
}
