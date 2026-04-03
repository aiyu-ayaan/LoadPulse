FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM grafana/k6:latest AS k6

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ARG BACKEND_PORT=4000
ENV REDIS_URL=""
ENV REDIS_DEFAULT_TTL_SECONDS=30

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=k6 /usr/bin/k6 /usr/bin/k6
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/.env.example ./.env.example

EXPOSE ${BACKEND_PORT}

CMD ["npm", "run", "start"]
