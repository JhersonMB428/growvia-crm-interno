# Cómo levantar el CRM de Growvia en tu laptop

Guía para trabajar en local (Windows). Tiempo aproximado: 20–30 minutos.

## 1. Instala esto una sola vez

| Programa | Dónde | Cómo comprobar |
|---|---|---|
| Git | https://git-scm.com | `git --version` |
| Node.js 22 LTS | https://nodejs.org | `node -v` → debe decir v22.x |
| Docker Desktop | https://www.docker.com/products/docker-desktop | `docker --version` |
| VS Code | https://code.visualstudio.com | — |

Después de instalar Docker Desktop, **ábrelo** y espera a que diga "Engine running".

## 2. Descarga el proyecto

En PowerShell, en la carpeta donde guardas tus proyectos:

```powershell
git clone https://github.com/<usuario-o-organizacion>/growvia-crm-interno.git
cd growvia-crm-interno
code .
```

(Jherson te pasa la URL exacta del repo. Si GitHub te pide iniciar sesión, usa tu cuenta: ya debes estar agregado como colaborador.)

## 3. Levanta la base de datos (Docker)

Un solo comando (todo en una línea):

```powershell
docker run -d --name growvia-crm-db -e POSTGRES_USER=growvia -e POSTGRES_PASSWORD=growvia_dev -e POSTGRES_DB=growvia_crm -p 5432:5432 -v growvia-crm-datos:/var/lib/postgresql/data postgres:16
```

Comprueba que está corriendo: `docker ps` → debe aparecer `growvia-crm-db`.

Los días siguientes no repitas ese comando; solo enciéndela con:

```powershell
docker start growvia-crm-db
```

## 4. Crea el archivo `.env`

En la **raíz del repo** (junto a `backend/` y `frontend/`), crea un archivo llamado `.env`:

```
DATABASE_URL=postgres://growvia:growvia_dev@localhost:5432/growvia_crm
PORT=3000
JWT_SECRET=PEGA_AQUI_TU_CLAVE
JWT_EXPIRES_IN=8h
FRONTEND_URL=http://localhost:5173
```

Para generar la clave de `JWT_SECRET`, ejecuta esto y pega el resultado:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

⚠️ El `.env` **nunca** se sube a GitHub (ya está en `.gitignore`). No lo compartas.

Sin datos de correo (SMTP) en el `.env`, el CRM funciona en **modo desarrollo**: los correos (por ejemplo, el código de acceso) no se envían, se muestran en la terminal del backend. Los archivos que subas (fotos, contratos) se guardan en `backend/almacen/`, que tampoco se sube a git.

## 5. Backend (terminal 1)

```powershell
cd backend
npm install
npm run migration:run
npm run start:dev
```

- `migration:run` crea todas las tablas y los usuarios de prueba.
- Espera a ver `Nest application successfully started`. Deja esta terminal abierta.

## 6. Frontend (terminal 2)

Abre otra terminal (en VS Code: botón **+** del panel de terminal):

```powershell
cd frontend
npm install
npm run dev
```

Abre **http://localhost:5173**

## 7. Entra al CRM

Contraseña para todos: `Growvia2026!`

| Correo | Rol |
|---|---|
| mrios@growvia.global | Asesora (Equipo 1) |
| cmendoza@growvia.global | Supervisor (Equipo 1) |
| lherrera@growvia.global | Gerente |
| rparedes@growvia.global | Back office |
| admin@growvia.global | Administrador |

La primera vez te pedirá un **código de 6 dígitos**: búscalo en la **terminal del backend** (línea `[MODO DESARROLLO] Correo a ...`).

Truco: cada pestaña del navegador guarda su propia sesión, así que puedes tener un rol distinto en cada pestaña (ábrelas con Ctrl+T, no duplicando).

**La base empieza sin empresas.** Para tener datos: entra como supervisor → *Cargar base* → descarga la plantilla, llénala con unas filas de prueba y súbela.

## 8. El día a día

Cada vez que empieces a trabajar:

```powershell
docker start growvia-crm-db
git pull
```

Si el `git pull` trajo cambios en `package.json`, corre `npm install` en esa carpeta. Si trajo migraciones nuevas (`backend/src/database/migrations/`), corre `npm run migration:run` dentro de `backend`. Luego levanta backend y frontend como en los pasos 5 y 6.

Para subir tus cambios:

```powershell
git add .
git commit -m "Descripción corta de lo que hiciste"
git push
```

Antes de hacer `git add .`, revisa con `git status` que no aparezca el `.env` ni la carpeta `almacen/`.

## 9. Problemas comunes

| Error | Solución |
|---|---|
| `npm error ENOENT ... package.json` | Estás en la raíz. Entra a `backend` o `frontend` antes de correr npm. |
| `port is already allocated` / el puerto 5432 está ocupado | Tienes otro PostgreSQL instalado. Detenlo (Servicios de Windows → postgresql → Detener) o cambia `-p 5432:5432` por `-p 5433:5432` y en el `.env` usa `localhost:5433`. |
| `password authentication failed` | El `DATABASE_URL` del `.env` no coincide con el usuario/clave del comando docker del paso 3. |
| `ECONNREFUSED 127.0.0.1:5432` | La base está apagada: `docker start growvia-crm-db` (y Docker Desktop abierto). |
| `Cannot find module './...'` en VS Code | Revisa que el archivo esté en la carpeta correcta; luego Ctrl+Shift+P → "TypeScript: Restart TS Server". |
| El login no avanza / error de red | El backend no está corriendo: revisa la terminal 1. |
| Quiero empezar la base de cero | `docker rm -f growvia-crm-db` y `docker volume rm growvia-crm-datos`, luego repite el paso 3 y `npm run migration:run`. (Borra todos los datos locales.) |

## Reglas del proyecto

- Nunca subir el `.env`, contraseñas ni la carpeta `almacen/`.
- Los usuarios y la clave `Growvia2026!` son **solo para local**; en producción quedan desactivados.
- Ante la duda, pregunta antes de hacer push.