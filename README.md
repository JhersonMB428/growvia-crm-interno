# Growvia CRM interno

CRM de ventas corporativas de Growvia (líneas móviles y fijas). Sirve para el día a día del equipo comercial: asesores, supervisores, back office y gerencia.

> Es un sistema **separado** del Growvia CRM que se vende por suscripción a otras empresas.

## Qué hace

| Rol | Puede |
|---|---|
| **Asesor** | Tomar empresas libres del repositorio, registrar prospectos, gestiones y agenda, negociar y cerrar ventas, subir el expediente, ver sus renovaciones y subir bases (con aprobación). |
| **Supervisor** | Ver el avance de su equipo, aprobar ventas, definir metas, aprobar bases, ver embudo y pérdidas, y reasignar empresas. Solo ve **su** equipo. |
| **Back office** | Validar ventas con checklist y expediente, registrar la posventa hasta que el servicio queda activo, mantener los datos de empresas y crear usuarios. |
| **Gerencia** | Ver reportes generales (líneas, cargo fijo, metas, distritos, equipos, operadores), revisar ventas, ver embudo y renovaciones de toda la empresa, **exportar** a Excel, ver la bitácora y aprobar el acceso desde celular. |
| **Administrador** | Manejar usuarios, equipos, planes, operadores y parámetros del sistema. |

Para todos:
- Verificación por código en equipos nuevos.
- Notificaciones, buscador de empresas (sin importar tildes) y foto de perfil.
- Modo claro, modo oscuro y modo lite (para PCs con pocos recursos).
- Guía de uso dentro del CRM con recorrido de bienvenida por rol.

### Seguridad y reglas de negocio

- **La información es unidireccional:** los asesores no pueden descargar la base de clientes. **Solo gerencia exporta**, y cada exportación queda en la bitácora.
- Los datos generales de las empresas son comunes; los contactos y la información comercial son privados del asesor dueño.
- Un supervisor no ve otros equipos.
- El acceso desde celular está **bloqueado por defecto**. Gerencia lo aprueba con fecha de fin (máximo 30 días).
- **Bitácora** de ingresos, accesos denegados, exportaciones y cambios. No se puede modificar ni borrar.
- Si una empresa pasa demasiados días sin gestión, vuelve sola al repositorio.
- En producción, los usuarios de prueba quedan desactivados automáticamente.

## Tecnología

| Parte | Stack |
|---|---|
| Backend | NestJS 11 + TypeORM + PostgreSQL 16, monolito modular |
| Frontend | React 19 + Vite + TypeScript |
| Archivos | Azure Blob Storage en producción; carpeta `backend/almacen/` en local |
| Correo | SMTP en producción; en local se muestra en la terminal |
| Despliegue | Docker (una sola imagen con backend y frontend) en Azure Container Apps |

## Estructura

```
growvia-crm-interno/
├── backend/
│   └── src/
│       ├── auth/            Login, código de verificación, permisos
│       ├── empresas/        Repositorio, fichas, contactos, reasignación
│       ├── gestiones/       Llamadas, visitas y agenda
│       ├── negociaciones/   Negociaciones, planes y renovación de contratos
│       ├── validacion/      Aprobación del supervisor y validación de back office
│       ├── expediente/      Documentos de cada venta
│       ├── renovaciones/    Contratos por vencer y avisos automáticos
│       ├── embudo/          Conversión por etapa y motivos de pérdida
│       ├── tableros/        Inicio por rol, reportes y metas
│       ├── bases/           Carga masiva de empresas por Excel
│       ├── exportacion/     Exportación a Excel (solo gerencia)
│       ├── bitacora/        Registro de auditoría
│       ├── accesos-movil/   Permisos de acceso desde celular
│       ├── administracion/  Usuarios, equipos, planes, parámetros
│       ├── ...              (perfil, fotos, notificaciones, correo, almacenamiento, ubigeo)
│       └── database/migrations/   Todas las tablas y datos iniciales
├── frontend/
│   ├── public/img/          Logo y fondos
│   └── src/
│       ├── paginas/         Una carpeta por sección del CRM
│       ├── componentes/     Piezas reutilizables
│       ├── api/             Llamadas al backend
│       ├── sesion/          Sesión del usuario y rutas privadas
│       └── tema/            Modo claro/oscuro y modo lite
├── scripts/desplegar.ps1    Publica una nueva versión en Azure
├── Dockerfile
├── INSTALACION.md           Guía paso a paso para levantarlo en local
└── .env                     Variables locales (NO se sube a git)
```

## Levantarlo en local

La guía completa está en **[INSTALACION.md](INSTALACION.md)**. En resumen:

```powershell
# 1. Base de datos
docker run -d --name growvia-crm-db -e POSTGRES_USER=growvia -e POSTGRES_PASSWORD=growvia_dev -e POSTGRES_DB=growvia_crm -p 5432:5432 -v growvia-crm-datos:/var/lib/postgresql/data postgres:16

# 2. Crear .env en la raíz (ver INSTALACION.md)

# 3. Backend
cd backend
npm install
npm run migration:run
npm run start:dev

# 4. Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

Abrir http://localhost:5173

### Usuarios de prueba (solo local)

Contraseña para todos: `Growvia2026!`

| Correo | Rol |
|---|---|
| mrios@growvia.global | Asesora, Equipo 1 |
| cmendoza@growvia.global | Supervisor, Equipo 1 |
| lherrera@growvia.global | Gerente |
| rparedes@growvia.global | Back office |
| admin@growvia.global | Administrador |

El código de verificación aparece en la terminal del backend.

## Comandos útiles

Se corren **dentro de `backend/`**:

| Comando | Para qué |
|---|---|
| `npm run start:dev` | Levanta el backend con recarga automática |
| `npm run migration:run` | Aplica las migraciones pendientes |
| `npm run migration:show` | Muestra qué migraciones están aplicadas |
| `npm run migration:revert` | Deshace la última migración |
| `npm run build` | Compila para producción |

Se corren **dentro de `frontend/`**:

| Comando | Para qué |
|---|---|
| `npm run dev` | Levanta el frontend en http://localhost:5173 |
| `npm run build` | Compila para producción |

**Regla:** las tablas solo se crean o cambian con migraciones (`synchronize` está apagado). Para cambiar la base de datos se crea una migración nueva en `backend/src/database/migrations/`. Nunca se edita una que ya fue aplicada.

## Variables de entorno

| Variable | Local | Producción | Descripción |
|---|---|---|---|
| `DATABASE_URL` | ✔ | ✔ | Conexión a PostgreSQL |
| `JWT_SECRET` | ✔ | ✔ (mín. 32 caracteres) | Firma de las sesiones |
| `JWT_EXPIRES_IN` | ✔ | ✔ | Duración de la sesión (ej. `8h`) |
| `FRONTEND_URL` | ✔ | ✔ (https) | Dirección del CRM |
| `PORT` | opcional | — | Puerto del backend (3000) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | — | ✔ | Servidor de correo para los códigos |
| `CORREO_REMITENTE` | — | opcional | Remitente de los correos |
| `AZURE_STORAGE_CONNECTION_STRING` | — | ✔ | Almacenamiento de documentos y fotos |
| `AZURE_STORAGE_CONTAINER` | — | opcional | Contenedor (por defecto `expedientes`) |
| `CORREO_ADMIN_INICIAL` | — | primer arranque | Correo real del administrador |
| `MIGRAR_AL_INICIAR` | — | `true` (en el Dockerfile) | Aplica migraciones al arrancar |

En producción, el backend **no arranca** si falta alguna variable obligatoria.

## Despliegue en Azure

- Una sola imagen Docker: el backend sirve también el frontend compilado.
- Destino: Azure Container Apps (`growvia-crm`, grupo `growvia-crm-rg`), imagen en `growviaregistry`.
- Base de datos `growvia_crm` en el servidor PostgreSQL de Growvia; archivos en Azure Blob Storage.
- Dominio: `crm.growvia.global`.

Para publicar una nueva versión, primero haz commit y luego, desde la raíz:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\desplegar.ps1
```

## Reglas del repositorio

- **Nunca** subir el `.env`, contraseñas, claves de Azure ni la carpeta `backend/almacen/`.
- Los usuarios de prueba y la clave `Growvia2026!` son solo para local.
- Antes de hacer push, revisa `git status`.

---

Desarrollado por Corevia para Growvia · 2026