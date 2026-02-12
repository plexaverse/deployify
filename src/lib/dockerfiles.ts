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
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build', rootDirectory } = config;

    const buildCmd = rootDirectory ? `cd ${rootDirectory} && ${buildCommand}` : buildCommand;
    const sourcePath = rootDirectory ? `${rootDirectory}/${outputDirectory}` : outputDirectory;

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
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/${sourcePath} ./${outputDirectory}

EXPOSE 8080
CMD ["node", "./${outputDirectory}/server/entry.mjs"]`;
}

function generateRemixDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'npm run build', rootDirectory } = config;

    const buildCmd = rootDirectory ? `cd ${rootDirectory} && ${buildCommand}` : buildCommand;
    const buildPath = rootDirectory ? `${rootDirectory}/build` : 'build';
    const publicPath = rootDirectory ? `${rootDirectory}/public` : 'public';
    const packageJsonPath = rootDirectory ? `${rootDirectory}/package.json` : 'package.json';

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
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/${packageJsonPath} ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/${buildPath} ./build
COPY --from=builder /app/${publicPath} ./public

EXPOSE 8080
CMD ["npm", "start"]`;
}

function generateNextjsDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, restoreCache, rootDirectory } = config;

    // Default build command is npm run build, but if rootDirectory is set, we need to cd into it
    // However, usually the build command provided in config already includes 'npm run build' or similar.
    // In generateNextjsDockerfile, 'buildCommand' isn't explicitly used in the template below for the RUN instruction
    // (it hardcodes `RUN npm run build`).
    // Wait, the original code had `RUN npm run build` hardcoded!
    // I should probably fix that to use `config.buildCommand` if available, or just prepend cd if rootDirectory is there.
    // But safely, I will stick to modifying what's there to support rootDirectory.
    // If rootDirectory is set, we do `cd rootDirectory && npm run build`.

    const buildCmd = rootDirectory ? `cd ${rootDirectory} && npm run build` : 'npm run build';
    const prismaCmd = rootDirectory
        ? `if [ -d "${rootDirectory}/prisma" ]; then cd ${rootDirectory} && npx prisma generate; fi`
        : `if [ -d "prisma" ]; then npx prisma generate; fi`;

    const cachePath = rootDirectory ? `${rootDirectory}/.next/` : '.next/';
    const publicPath = rootDirectory ? `${rootDirectory}/public` : 'public';
    const standalonePath = rootDirectory ? `${rootDirectory}/.next/standalone` : '.next/standalone';
    const staticPath = rootDirectory ? `${rootDirectory}/.next/static` : '.next/static';
    const serverPath = rootDirectory ? `${rootDirectory}/server.js` : 'server.js';

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
RUN ${prismaCmd}
${restoreCache ? `# Copy restored cache to .next/cache\nCOPY restore_cache/ ${cachePath}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/${publicPath} ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/${standalonePath} ./
COPY --from=builder --chown=nextjs:nodejs /app/${staticPath} ./.next/static
USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "${serverPath}"]`;
}

function generateViteDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build', rootDirectory } = config;

    const buildCmd = rootDirectory ? `cd ${rootDirectory} && ${buildCommand}` : buildCommand;
    const sourcePath = rootDirectory ? `${rootDirectory}/${outputDirectory}` : outputDirectory;

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
RUN ${buildCmd}

FROM nginx:alpine
COPY --from=builder /app/${sourcePath} /usr/share/nginx/html
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
