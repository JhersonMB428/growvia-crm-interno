# Growvia CRM interno: una sola imagen con el backend (NestJS) que también sirve las pantallas (React)
# Se construye desde la raíz del repo:  az acr build -r growviaregistry -t growvia-crm-interno:v1 .

# ---------- 1. Pantallas (React + Vite) ----------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2. Backend (NestJS) ----------
FROM node:22-slim AS backend
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 3. Imagen final (solo lo necesario para correr) ----------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRAR_AL_INICIAR=true \
    TZ=America/Lima
WORKDIR /app
COPY --from=backend /app/backend/package.json ./
COPY --from=backend /app/backend/node_modules ./node_modules
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public
# No corre como administrador del contenedor
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]