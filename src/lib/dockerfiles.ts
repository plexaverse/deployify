export interface DockerfileConfig {
    framework: string;
    buildEnvSection: string;
    outputDirectory?: string;
    buildCommand?: string;
    installCommand?: string;
    restoreCache?: boolean;
    rootDirectory?: string;
}

export function getDockerfile(config: DockerfileConfig): string {
    switch (config.framework) {
        case 'astro':
            return generateAstroDockerfile(config);
        case 'vite':
            return generateViteDockerfile(config);
        case 'remix':
            return generateRemixDockerfile(config);
        case 'nextjs':
        default:
            return generateNextjsDockerfile(config);
    }
}

function generateAstroDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build' } = config;

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
RUN ${buildCommand}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/${outputDirectory} ./${outputDirectory}

EXPOSE 8080
CMD ["node", "./${outputDirectory}/server/entry.mjs"]`;
}

function generateRemixDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'npm run build' } = config;

    return `FROM node:20-alpine AS deps
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
RUN ${buildCommand}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public

EXPOSE 8080
CMD ["npm", "start"]`;
}

function generateNextjsDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, restoreCache, rootDirectory } = config;
    // For monorepos (rootDirectory set), we copy everything in deps stage to ensure workspace resolution works
    // For standard repos, we optimize by only copying package files first
    const depsCopy = rootDirectory
        ? 'COPY . .'
        : 'COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./';

    const workDirCommand = rootDirectory ? `WORKDIR /app/${rootDirectory}` : '';
    const publicCopy = rootDirectory
        ? `COPY --from=builder /app/${rootDirectory}/public ./${rootDirectory}/public`
        : 'COPY --from=builder /app/public ./public';
    const standaloneCopy = rootDirectory
        ? `COPY --from=builder /app/${rootDirectory}/.next/standalone ./`
        : 'COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./';
    const staticCopy = rootDirectory
        ? `COPY --from=builder /app/${rootDirectory}/.next/static ./${rootDirectory}/.next/static`
        : 'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static';
    const cmdPath = rootDirectory ? `${rootDirectory}/server.js` : 'server.js';

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
${depsCopy}
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
${workDirCommand}
# Generate Prisma client if prisma folder exists
RUN if [ -d "prisma" ]; then npx prisma generate; fi
${restoreCache ? '# Copy restored cache to .next/cache\nCOPY restore_cache/ .next/' : ''}
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
${publicCopy}
RUN mkdir .next && chown nextjs:nodejs .next
${standaloneCopy}
${staticCopy}
USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "${cmdPath}"]`;
}

function generateViteDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build' } = config;

    // Nginx configuration for SPA routing
    // We use a simple echo approach to create the config file

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
    else npm install; fi

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
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
