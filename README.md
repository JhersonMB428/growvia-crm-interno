# Growvia CRM interno

CRM de ventas corporativas de Growvia (líneas móviles y fijas). Sirve para el día a día del equipo comercial: asesores, supervisores, back office y gerencia.

> **Uso interno y confidencial.** Este repositorio y su contenido son propiedad de Growvia. No se debe compartir fuera de la empresa.

## Qué hace

| Rol | Puede |
|---|---|
| **Asesor** | Tomar empresas libres del repositorio, registrar prospectos, gestiones y agenda, negociar y cerrar ventas, subir el expediente, ver sus renovaciones y subir bases (con aprobación). |
| **Supervisor** | Ver el avance de su equipo, aprobar ventas, definir metas, aprobar bases, ver embudo y pérdidas, y reasignar empresas. Solo ve **su** equipo. |
| **Back office** | Validar ventas con checklist y expediente, registrar la posventa hasta que el servicio queda activo, mantener los datos de empresas y crear usuarios. |
| **Gerencia** | Ver reportes generales, revisar ventas, ver embudo y renovaciones de toda la empresa, **exportar** a Excel, ver la bitácora y aprobar el acceso desde celular. |
| **Administrador** | Manejar usuarios, equipos, planes, operadores y parámetros del sistema. |

Para todos:
- Verificación por código en equipos nuevos.
- Notificaciones, buscador de empresas y foto de perfil.
- Modo claro, modo oscuro y modo lite.
- Guía de uso dentro del CRM.

### Reglas de seguridad

- **La información es unidireccional:** solo gerencia exporta, y cada exportación queda en la bitácora.
- Los contactos y la información comercial son privados del asesor dueño.
- Un supervisor no ve otros equipos.
- El acceso desde celular está bloqueado por defecto; gerencia lo aprueba con fecha de fin.
- La bitácora no se puede modificar ni borrar.

## Tecnología

| Parte | Stack |
|---|---|
| Backend | NestJS + TypeORM + PostgreSQL, monolito modular |
| Frontend | React + Vite + TypeScript |
| Despliegue | Docker (una sola imagen con backend y frontend) en Azure |

## Estructura

```
growvia-crm-interno/
├── backend/
│   └── src/
│       ├── auth/            Ingreso, verificación y permisos
│       ├── empresas/        Repositorio, fichas y reasignación
│       ├── gestiones/       Gestiones y agenda
│       ├── negociaciones/   Negociaciones, planes y renovaciones de contrato
│       ├── validacion/      Aprobación y validación de ventas
│       ├── expediente/      Documentos de cada venta
│       ├── renovaciones/    Contratos por vencer y avisos
│       ├── embudo/          Conversión y motivos de pérdida
│       ├── tableros/        Inicio por rol, reportes y metas
│       ├── bases/           Carga de empresas por Excel
│       ├── exportacion/     Exportación (solo gerencia)
│       ├── bitacora/        Auditoría
│       ├── accesos-movil/   Acceso desde celular
│       ├── administracion/  Usuarios, equipos y parámetros
│       ├── ...              Perfil, fotos, notificaciones, correo, almacenamiento, ubigeo
│       └── database/migrations/
├── frontend/
│   └── src/
│       ├── paginas/         Una carpeta por sección
│       ├── componentes/     Piezas reutilizables
│       ├── api/             Llamadas al backend
│       ├── sesion/          Sesión y rutas privadas
│       └── tema/            Modo claro/oscuro y lite
├── scripts/                 Despliegue
├── Dockerfile
└── INSTALACION.md           Cómo levantarlo en local
```

## Levantarlo en local

Sigue la guía **[INSTALACION.md](INSTALACION.md)**. Las credenciales de prueba las entrega el responsable del proyecto; no se publican en el repositorio.

## Comandos útiles

Se corren **dentro de `backend/`**:

| Comando | Para qué |
|---|---|
| `npm run start:dev` | Levanta el backend en modo desarrollo |
| `npm run migration:run` | Aplica las migraciones pendientes |
| `npm run migration:show` | Muestra las migraciones aplicadas |
| `npm run migration:revert` | Deshace la última migración |
| `npm run build` | Compila para producción |

Se corren **dentro de `frontend/`**:

| Comando | Para qué |
|---|---|
| `npm run dev` | Levanta el frontend |
| `npm run build` | Compila para producción |

**Regla:** la base de datos solo se cambia con migraciones nuevas en `backend/src/database/migrations/`. Nunca se edita una que ya fue aplicada.

## Configuración

La configuración va en variables de entorno. En local se ponen en un archivo `.env` en la raíz, que **no se sube a git**; en producción se configuran en Azure. Las variables necesarias están en INSTALACION.md. En producción, el backend no arranca si falta alguna obligatoria.

## Despliegue

El despliegue a Azure se hace con el script de `scripts/`, solo por personal autorizado.

## Reglas del repositorio

- **Nunca** subir el `.env`, contraseñas, claves o cadenas de conexión, ni la carpeta `backend/almacen/`.
- No subir datos reales de clientes (bases, Excel, documentos).
- Antes de hacer push, revisa `git status`.