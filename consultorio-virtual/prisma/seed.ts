import path from "path";
import bcrypt from "bcrypt";
import { addDays, addMinutes, set } from "date-fns";
import { PrismaClient, type Role } from "@prisma/client";
import { importCie10 } from "../scripts/cie10-lib";

const prisma = new PrismaClient();
const PASSWORD = "Demo12345!";
// Hosts como Vercel fijan TZ=UTC: este desfase (horas) ajusta los horarios demo a la zona local. Ej. Bolivia = 4
const HOUR_OFFSET = Number(process.env.SEED_HOUR_OFFSET ?? 0);

async function user(email: string, name: string, role: Role) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  // CIE-10
  const cie = await importCie10(prisma, path.join(__dirname, "cie10.csv"));
  console.log(`CIE-10: ${cie.inserted} códigos nuevos (${cie.total} en el archivo)`);

  // Personal administrativo
  await user("admin@consultorio.test", "Administrador General", "ADMIN");
  await user("recepcion@consultorio.test", "Laura Recepción", "RECEPTION");

  // 5 especialistas, cada uno con su propia agenda
  const doctors = [
    { email: "medicina@consultorio.test", name: "Dr. Andrés Mejía", specialty: "Medicina General", license: "RM-10001", days: [1, 2, 3, 4, 5], start: 8, end: 16, slot: 30 },
    { email: "cardiologia@consultorio.test", name: "Dra. Carolina Ruiz", specialty: "Cardiología", license: "RM-10002", days: [1, 3, 5], start: 9, end: 17, slot: 40 },
    { email: "pediatria@consultorio.test", name: "Dr. Felipe Ortega", specialty: "Pediatría", license: "RM-10003", days: [1, 2, 3, 4], start: 8, end: 14, slot: 30 },
    { email: "dermatologia@consultorio.test", name: "Dra. Natalia Vargas", specialty: "Dermatología", license: "RM-10004", days: [2, 4, 6], start: 10, end: 18, slot: 20 },
    { email: "psiquiatria@consultorio.test", name: "Dr. Sebastián Rojas", specialty: "Psiquiatría", license: "RM-10005", days: [1, 2, 3, 4, 5], start: 13, end: 19, slot: 50 },
  ];
  const specialists = [];
  for (const d of doctors) {
    const u = await user(d.email, d.name, "DOCTOR");
    const s = await prisma.specialist.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        specialty: d.specialty,
        licenseNumber: d.license,
        workDays: d.days,
        startHour: d.start + HOUR_OFFSET,
        endHour: d.end + HOUR_OFFSET,
        slotMinutes: d.slot,
      },
    });
    specialists.push(s);
  }

  // Pacientes compartidos
  const patientsData = [
    { documentId: "1001001001", firstName: "María", lastName: "González", birthDate: "1985-03-14", sex: "F" as const, phone: "3001112233", email: "paciente@consultorio.test", allergies: "Penicilina", insurance: "Sura" },
    { documentId: "1001001002", firstName: "Juan", lastName: "Pérez", birthDate: "1972-11-02", sex: "M" as const, phone: "3002223344", email: "juan.perez@example.com", allergies: null, insurance: "Sanitas" },
    { documentId: "1001001003", firstName: "Sofía", lastName: "Ramírez", birthDate: "2018-07-21", sex: "F" as const, phone: "3003334455", email: null, allergies: "Ninguna conocida", insurance: "Particular" },
    { documentId: "1001001004", firstName: "Carlos", lastName: "Herrera", birthDate: "1959-01-30", sex: "M" as const, phone: "3004445566", email: null, allergies: "AINEs", insurance: "Nueva EPS" },
    { documentId: "1001001005", firstName: "Valentina", lastName: "Castro", birthDate: "1996-09-09", sex: "F" as const, phone: "3005556677", email: null, allergies: null, insurance: "Compensar" },
  ];
  const patients = [];
  for (const p of patientsData) {
    const patient = await prisma.patient.upsert({
      where: { documentId: p.documentId },
      update: {},
      create: { ...p, birthDate: new Date(p.birthDate) },
    });
    patients.push(patient);
  }

  // Cuenta de portal para la primera paciente
  const portalUser = await user("paciente@consultorio.test", "María González", "PATIENT");
  await prisma.patient.update({ where: { id: patients[0].id }, data: { userId: portalUser.id } });

  // Citas demo (solo si no hay ninguna)
  if ((await prisma.appointment.count()) === 0) {
    const rnd = () => `cv-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
    const now = new Date();
    const mk = (pi: number, si: number, start: Date, reason: string, status: "SCHEDULED" | "CONFIRMED" = "SCHEDULED") =>
      prisma.appointment.create({
        data: {
          patientId: patients[pi].id,
          specialistId: specialists[si].id,
          startsAt: start,
          endsAt: addMinutes(start, doctors[si].slot),
          reason,
          status,
          roomName: rnd(),
        },
      });

    // Cita "ahora": permite probar de inmediato sala de espera + videollamada
    await mk(0, 0, addMinutes(now, 10), "Control de presión arterial", "CONFIRMED");
    await mk(1, 1, addMinutes(now, 25), "Dolor torácico ocasional");
    const tomorrow = addDays(now, 1);
    await mk(2, 2, set(tomorrow, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }), "Control de crecimiento", "CONFIRMED");
    await mk(3, 0, set(tomorrow, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 }), "Renovación de fórmula");
    await mk(4, 4, set(addDays(now, 2), { hours: 14, minutes: 0, seconds: 0, milliseconds: 0 }), "Ansiedad e insomnio");
  }

  console.log("\nSeed completado. Contraseña de todas las cuentas demo:", PASSWORD);
  console.log("  admin@consultorio.test, recepcion@consultorio.test, paciente@consultorio.test");
  console.log("  medicina@ / cardiologia@ / pediatria@ / dermatologia@ / psiquiatria@consultorio.test");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
