# ==============================================================================
# BreatheWise AI — Production Frontend Dockerfile
# Multi-stage build: Node.js 20 build -> Nginx unprivileged Alpine runtime
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build static SPA assets
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies strictly matching the lockfile
RUN npm ci

# Copy frontend application source files
COPY . .

# Build-time environment arguments (Vite baked-in variables)
# Default API base URL is set to '/' for relative same-origin reverse-proxying
ARG VITE_API_BASE_URL=/
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_FIREBASE_MEASUREMENT_ID=""

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID

# Compile TypeScript and build production assets into dist/
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production unprivileged Nginx runtime
# ------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine-slim AS runtime

# Copy custom Nginx configuration for SPA routing and API reverse-proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose unprivileged Nginx listening port (8080)
EXPOSE 8080

# Default CMD starts Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
