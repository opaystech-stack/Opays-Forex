# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Stage 2: Serve with Nginx (root inside isolated container for Dokploy reliability)
FROM nginx:stable-alpine

# Remove default config, ensure temp dirs, move PID to /tmp
RUN rm -f /etc/nginx/conf.d/default.conf \
  && rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
  && mkdir -p /var/log/nginx /tmp /usr/share/nginx/html /var/cache/nginx/client_temp \
  && sed -i 's|^pid.*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && sed -i '/^user /d' /etc/nginx/nginx.conf

# Copy nginx config and built assets
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Validate config
RUN nginx -t

# Healthcheck using IPv4 explicitly (Alpine resolves localhost to ::1)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
