/**
 * Importa el catálogo CIE-10 desde un CSV (por defecto prisma/cie10.csv).
 *
 *   npm run cie10:import                      -> usa el catálogo demo incluido
 *   npm run cie10:import -- ruta/al/cie10.csv -> importa el catálogo oficial completo
 *
 * Formato: una fila por código, "CODIGO,Descripción". Los códigos existentes se omiten.
 */
import path from "path";
import { PrismaClient } from "@prisma/client";
import { importCie10 } from "./cie10-lib";

async function main() {
  const prisma = new PrismaClient();
  const file = process.argv[2] ?? path.join(__dirname, "..", "prisma", "cie10.csv");
  const { total, inserted } = await importCie10(prisma, file);
  console.log(`CIE-10: ${total} filas leídas, ${inserted} nuevas insertadas (${file})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
