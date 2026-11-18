import { requireUser } from "@/lib/rbac";
import WaitingRoomBoard from "@/components/WaitingRoomBoard";

export default async function WaitingRoomPage() {
  const user = await requireUser(["ADMIN", "DOCTOR", "RECEPTION"]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sala de espera virtual</h1>
      <p className="text-sm text-slate-600">
        {user.role === "DOCTOR"
          ? "Pacientes de su agenda que ya ingresaron. Se actualiza cada 5 segundos."
          : "Vista general de todas las agendas. Se actualiza cada 5 segundos."}
      </p>
      <WaitingRoomBoard role={user.role} />
    </div>
  );
}
