# Consultorio Virtual

Sistema de telemedicina para un consultorio con **5 especialistas**. Cada especialista tiene su propia agenda y espacio de trabajo; todos comparten la base de pacientes.

**Incluye:** autenticación con roles, gestión de citas con control de cruces, sala de espera virtual, videollamada (Jitsi Meet, una sala por cita), historia clínica electrónica SOAP con CIE-10, prescripciones, órdenes médicas, auditoría y panel de administración.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma · NextAuth (credenciales + JWT) · Zod · bcrypt · Recharts · Docker Compose (solo PostgreSQL) · Jitsi Meet por iframe.

## Puesta en marcha

Requisitos: Node 18.17+ (recomendado 20), Docker, npm.

```bash
cp .env.example .env          # y cambia NEXTAUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:up                 # PostgreSQL en Docker (puerto 5432)
npm run setup                 # prisma generate + db push + seed (datos demo y CIE-10)
npm run dev                   # http://localhost:3000
```

Otros scripts: `npm run db:studio`, `npm run db:migrate` (migraciones en lugar de `db push`), `npm run cie10:import -- ruta/cie10.csv`, `npm run typecheck`, `npm run build`.

## Cuentas demo

Contraseña de todas: **`Demo12345!`**

| Rol | Correo |
|---|---|
| Administrador | admin@consultorio.test |
| Recepción | recepcion@consultorio.test |
| Medicina General | medicina@consultorio.test |
| Cardiología | cardiologia@consultorio.test |
| Pediatría | pediatria@consultorio.test |
| Dermatología | dermatologia@consultorio.test |
| Psiquiatría | psiquiatria@consultorio.test |
| Paciente (portal) | paciente@consultorio.test |

### Probar el flujo completo en 2 minutos

El seed crea una cita para **María González con Medicina General que empieza en 10 minutos** (la sala abre 30 min antes).

1. Ventana normal: entra como `paciente@consultorio.test` → *Mis citas* → **Ingresar a la sala de espera**.
2. Ventana de incógnito: entra como `medicina@consultorio.test` → *Sala de espera* → **Atender**.
3. La videollamada se abre sola en ambos lados. El especialista completa la historia (SOAP, signos vitales, CIE-10, medicamentos, órdenes) y pulsa **Firmar y finalizar consulta**.
4. El paciente ve *Ver prescripción y órdenes* en su portal (imprimible / PDF).

## Roles y permisos

| Acción | Admin | Recepción | Especialista | Paciente |
|---|:-:|:-:|:-:|:-:|
| Ver agendas | todas | todas | solo la propia | solo sus citas |
| Crear/editar pacientes | ✔ | ✔ | ✔ | — |
| Agendar / confirmar / cancelar citas | ✔ | ✔ | solo su agenda | solicitar y cancelar las suyas |
| Sala de espera | ver | ver | ver y atender la suya | ingresar a la suya |
| Historia clínica (leer) | ✘ | ✘ | ✔ (base compartida) | solo su prescripción firmada |
| Historia clínica (editar/firmar) | ✘ | ✘ | solo el especialista de la consulta | ✘ |
| Usuarios, auditoría, estadísticas | ✔ | ✘ | ✘ | ✘ |

Las reglas se aplican en tres capas: `middleware.ts` (rutas), cada ruta API con `guard()` y cada Server Component con `requireUser()`.

## Decisiones técnicas y supuestos

- **Agendas independientes, pacientes compartidos.** `Specialist` tiene días, horario y duración de cita propios; `Patient` es único para todo el consultorio. Los especialistas pueden leer el historial firmado de cualquier paciente (continuidad de la atención) y cada lectura queda auditada. Si se requiere restringirlo por relación tratante, basta filtrar en `lib/clinical.ts`.
- **Mínimo privilegio:** administración y recepción no leen contenido clínico.
- **Citas sin cruces:** las franjas se calculan en `lib/slots.ts`; la creación valida la franja y revisa cruces del especialista **y** del paciente dentro de una transacción `Serializable` (los conflictos devuelven 409).
- **Zona horaria:** las franjas se calculan en la zona del servidor. Define `TZ` y `NEXT_PUBLIC_TZ` en `.env` (por defecto `America/Bogota`). Las fechas de nacimiento se tratan como fecha pura (UTC) para no desfasar el día.
- **Sala de espera:** el paciente hace check-in desde 30 min antes de la cita (`CHECKIN_MINUTES_BEFORE`). El panel del especialista se actualiza por sondeo cada 5 s (simple y sin infraestructura extra; sustituible por WebSockets/SSE). El nombre de la sala de video **no se revela** al paciente hasta que el especialista inicia la consulta (`/api/appointments/[id]/status`).
- **Videollamada:** Jitsi por iframe con sala única e impredecible por cita (`cv-` + 24 hex). El servidor público `meet.jit.si` es solo para demo (puede limitar el uso embebido); para producción usa un Jitsi propio o JaaS y cambia `NEXT_PUBLIC_JITSI_DOMAIN`. El vídeo es de extremo a servidor, no se almacena nada en este sistema.
- **Historia clínica:** formato SOAP + signos vitales + diagnósticos CIE-10 validados contra el catálogo. Autoguardado cada 30 s. **Al firmar queda inmutable** y la cita pasa a COMPLETADA; las correcciones se hacen con **adendas** (autor, fecha y texto).
- **CIE-10:** se incluye un catálogo demo (~90 códigos frecuentes, `prisma/cie10.csv`). Para el catálogo completo importa tu CSV `CODIGO,Descripción` con `npm run cie10:import -- ruta.csv` (inserción por lotes, ignora duplicados).
- **Autenticación:** NextAuth con credenciales, sesión JWT de 8 h, contraseñas con bcrypt (coste 12), política de mínimo 10 caracteres con letras y números, bloqueo de 15 min tras 5 intentos fallidos. Se usa el paquete `bcrypt` (nativo); si falla su instalación en tu sistema, cambia a `bcryptjs` (misma API).
- **Auditoría:** `AuditLog` registra inicio de sesión (y fallos), búsquedas y lecturas de pacientes, apertura de consulta, lectura/edición/firma de historia, adendas, prescripciones vistas y acciones de administración, con IP y user-agent. Es de mejor esfuerzo: un fallo al auditar no interrumpe la operación.
- **Cabeceras de seguridad** básicas en `next.config.mjs`. Validación de toda entrada con Zod.

## Estructura

```
prisma/            schema.prisma, seed.ts, cie10.csv
scripts/           import-cie10.ts, cie10-lib.ts
src/middleware.ts  protección de rutas por rol
src/lib/           auth, rbac, audit, slots, validators, clinical, utils
src/app/api/       auth, patients, specialists(+slots), appointments(+checkin/start/status),
                   waiting-room, encounters(+sign/addendum), cie10, admin/users
src/app/(app)/     dashboard, agenda, patients, appointments/new, waiting-room, consult/[id],
                   portal(+room), prescriptions/[encounterId], admin/{users,audit,stats}
src/components/    ConsultWorkspace, JitsiRoom, PatientRoom, WaitingRoomBoard, Cie10Search, ...
```

## Limitaciones conocidas (siguientes pasos)

- Sin notificaciones por correo/SMS ni recordatorios de cita.
- Sin pagos/facturación ni integración con aseguradoras.
- Sin pruebas automatizadas ni limitación de tasa a nivel de red (se recomienda un proxy/WAF en producción).
- El cumplimiento normativo real (habeas data, resolución de historia clínica electrónica, firma digital con validez legal, cifrado en reposo, copias de seguridad) debe validarse antes de usar con pacientes reales. Este proyecto es académico.
- Los archivos fueron revisados sintácticamente, pero no se ejecutó `npm install`/`build` en el entorno donde se generaron; si `npm run typecheck` reporta algo, suele ser un ajuste menor de tipos.
