import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { DAY_LABEL, ROLE_LABEL } from "@/lib/constants";
import { fmtDateTime } from "@/lib/utils";
import NewUserForm from "@/components/NewUserForm";
import UserActions from "@/components/UserActions";

export default async function AdminUsersPage() {
  const me = await requireUser(["ADMIN"]);
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { specialist: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usuarios y especialistas</h1>
      <NewUserForm />
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Nombre</th>
              <th className="th">Correo</th>
              <th className="th">Rol</th>
              <th className="th">Agenda</th>
              <th className="th">Último acceso</th>
              <th className="th">Estado</th>
              <th className="th">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">{ROLE_LABEL[u.role]}</td>
                <td className="td text-xs">
                  {u.specialist
                    ? `${u.specialist.specialty} · ${u.specialist.workDays.map((d) => DAY_LABEL[d]).join(" ")} ${u.specialist.startHour}-${u.specialist.endHour}h · ${u.specialist.slotMinutes} min`
                    : "—"}
                </td>
                <td className="td text-xs">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Nunca"}</td>
                <td className="td">
                  <span className={`badge ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="td">
                  <UserActions id={u.id} active={u.active} isSelf={u.id === me.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
