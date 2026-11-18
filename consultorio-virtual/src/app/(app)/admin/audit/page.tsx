import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/utils";

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { action?: string; q?: string; page?: string };
}) {
  await requireUser(["ADMIN"]);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const action = (searchParams.action ?? "").trim().toUpperCase();
  const q = (searchParams.q ?? "").trim();

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { contains: action } } : {}),
    ...(q
      ? {
          OR: [
            { user: { email: { contains: q, mode: "insensitive" } } },
            { entityId: { contains: q } },
            { ip: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const qs = new URLSearchParams({ page: String(p) });
    if (action) qs.set("action", action);
    if (q) qs.set("q", q);
    return `/admin/audit?${qs}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Auditoría</h1>
      <p className="text-sm text-slate-600">
        Registro de accesos y cambios (inicio de sesión, lectura y edición de historias clínicas, firmas, administración).
      </p>
      <form method="GET" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Acción contiene</label>
          <input className="input" name="action" defaultValue={action} placeholder="EHR, LOGIN, PATIENT..." />
        </div>
        <div>
          <label className="label">Usuario / ID / IP</label>
          <input className="input" name="q" defaultValue={q} />
        </div>
        <button className="btn">Filtrar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Fecha</th>
              <th className="th">Usuario</th>
              <th className="th">Acción</th>
              <th className="th">Entidad</th>
              <th className="th">IP</th>
              <th className="th">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</td>
                <td className="td text-xs">{r.user ? `${r.user.email} (${r.user.role})` : "—"}</td>
                <td className="td font-mono text-xs">{r.action}</td>
                <td className="td text-xs">{r.entity ? `${r.entity} ${r.entityId?.slice(0, 8) ?? ""}` : "—"}</td>
                <td className="td text-xs">{r.ip ?? "—"}</td>
                <td className="td max-w-xs truncate font-mono text-xs">{r.metadata ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={6}>
                  Sin registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {page > 1 && (
          <Link className="btn-secondary btn-sm" href={link(page - 1)}>
            ← Anterior
          </Link>
        )}
        <span>
          Página {page} de {pages} ({total} eventos)
        </span>
        {page < pages && (
          <Link className="btn-secondary btn-sm" href={link(page + 1)}>
            Siguiente →
          </Link>
        )}
      </div>
    </div>
  );
}
