import fs from "fs";
import type { PrismaClient } from "@prisma/client";

export type Cie10Row = { code: string; description: string };

/** Lee un CSV `codigo,descripcion` (acepta separador coma o punto y coma, con o sin cabecera). */
export function parseCie10Csv(content: string): Cie10Row[] {
  const rows: Cie10Row[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes(",") ? "," : ";";
    const idx = line.indexOf(sep);
    if (idx < 0) continue;
    const code = line.slice(0, idx).trim().replace(/^"|"$/g, "").toUpperCase();
    const description = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!code || !description) continue;
    if (["CODE", "CODIGO", "CÓDIGO"].includes(code)) continue; // cabecera
    rows.push({ code, description });
  }
  return rows;
}

export async function importCie10(prisma: PrismaClient, filePath: string) {
  const rows = parseCie10Csv(fs.readFileSync(filePath, "utf8"));
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await prisma.cie10.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    inserted += res.count;
  }
  return { total: rows.length, inserted };
}
