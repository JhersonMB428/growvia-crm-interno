# Growvia CRM interno

CRM de ventas corporativas de Growvia (líneas móviles y fijas).

- `backend/`: NestJS + TypeORM + PostgreSQL
- `frontend/`: React + Vite + TypeScript

## Levantar en local
1. `cp .env.example .env`
2. `docker compose up -d` (PostgreSQL y Redis)
3. Backend: `cd backend && npm install && npm run start:dev`
4. Frontend: `cd frontend && npm install && npm run dev`