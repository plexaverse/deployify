export interface DockerfileConfig {
    framework: string;
    buildEnvSection: string;
    outputDirectory?: string;
    buildCommand?: string;
    installCommand?: string;
}

export function getDockerfile(config: DockerfileConfig): string {
    switch (config.framework) {
        case 'astro':
            return generateAstroDockerfile(config);
        case 'vite':
            return generateViteDockerfile(config);
        case 'nextjs':
        default:
            return generateNextjsDockerfile(config);
    }
}

function generateAstroDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist' } = config;
    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
    else npm install; fi

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
${buildEnvSection}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/${outputDirectory} ./${outputDirectory}
COPY --from=builder /app/node_modules ./node_modules

CMD ["node", "./${outputDirectory}/server/entry.mjs"]`;
}

function generateNextjsDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection } = config;
    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
    else npm install; fi

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
${buildEnvSection}
# Generate Prisma client if prisma folder exists
RUN if [ -d "prisma" ]; then npx prisma generate; fi
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]`;
}

function generateViteDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build' } = config;

    // Nginx configuration for SPA routing
    // We use a simple echo approach to create the config file

    return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
    else npm install; fi

COPY . .
${buildEnvSection}
RUN ${buildCommand}

FROM nginx:alpine
COPY --from=builder /app/${outputDirectory} /usr/share/nginx/html
# Add custom nginx config for SPA
RUN echo 'server { \\
    listen 8080; \\
    server_name localhost; \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    location / { \\
        try_files $uri $uri/ /index.html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]`;
}
