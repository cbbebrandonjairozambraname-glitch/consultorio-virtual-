import { requireUser } from "@/lib/rbac";
import PatientForm from "@/components/PatientForm";

export default async function NewPatientPage() {
  await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nuevo paciente</h1>
      <PatientForm />
    </div>
  );
}
