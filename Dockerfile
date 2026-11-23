# syntax=docker/dockerfile:1
# DocuLens frontend: production Angular build served by unprivileged nginx, which also proxies /api to the backend
# so the browser sees a single origin (ADR-035). No secrets are baked into this image.

FROM node:24.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npx ng build --configuration production

FROM nginxinc/nginx-unprivileged:1.30-alpine
# Where nginx forwards /api/*. Overridden per environment; the default matches the Docker Compose service name.
ENV DOCULENS_BACKEND_ORIGIN=http://backend:8080 \
    NGINX_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER=^(DOCULENS_|NGINX_RESOLVER)
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/doculens-frontend/browser /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
