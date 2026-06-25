# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:22-alpine AS backend-builder
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/ .

# Stage 3: Runtime (Nginx + Node API via supervisord)
FROM nginx:stable-alpine

# Install Node.js and supervisor in Alpine
RUN apk add --no-cache nodejs npm supervisor curl \
  && rm -f /etc/nginx/conf.d/default.conf \
  && rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
  && mkdir -p /var/log/nginx /tmp /usr/share/nginx/html /var/cache/nginx/client_temp /var/log/supervisor /app/api \
  && sed -i 's|^pid.*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && sed -i '/^user /d' /etc/nginx/nginx.conf

# Copy frontend, backend, nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=backend-builder /app/api /app/api

# Supervisor config
RUN mkdir -p /etc/supervisor.d
COPY supervisord.conf /etc/supervisor.d/supervisord.conf

# Healthcheck on Nginx root (API may take longer to start; separate API monitoring via /api/health once warm)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

EXPOSE 80

WORKDIR /app/api
CMD ["supervisord", "-c", "/etc/supervisor.d/supervisord.conf", "-n"]
