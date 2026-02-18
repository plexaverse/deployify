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

    // Helper to format path
    const getPath = (path: string) => {
        if (!rootDirectory || rootDirectory === '.') return path;
        const cleanPath = path.startsWith('./') ? path.substring(2) : path;
        return `${rootDirectory}/${cleanPath}`;
    };

    const buildCmd = rootDirectory && rootDirectory !== '.'
        ? `cd ${rootDirectory} && ${buildCommand}`
        : buildCommand;

    const outputPath = getPath(outputDirectory);

    const isSubdir = rootDirectory && rootDirectory !== '.';
    const copyFiles = isSubdir
        ? `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN mkdir -p ${rootDirectory}
COPY ${rootDirectory}/package.json ${rootDirectory}/package-lock.json* ${rootDirectory}/yarn.lock* ${rootDirectory}/pnpm-lock.yaml* ./${rootDirectory}/`
        : `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./`;

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
${copyFiles}
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
COPY --from=builder /app/${outputPath} ./${outputPath}

EXPOSE 8080
CMD ["node", "./${outputPath}/server/entry.mjs"]`;
}

function generateRemixDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'npm run build', rootDirectory } = config;

    // Helper to format path
    const getPath = (path: string) => {
        if (!rootDirectory || rootDirectory === '.') return path;
        const cleanPath = path.startsWith('./') ? path.substring(2) : path;
        return `${rootDirectory}/${cleanPath}`;
    };

    const buildCmd = rootDirectory && rootDirectory !== '.'
        ? `cd ${rootDirectory} && ${buildCommand}`
        : buildCommand;

    const isSubdir = rootDirectory && rootDirectory !== '.';
    const copyFiles = isSubdir
        ? `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN mkdir -p ${rootDirectory}
COPY ${rootDirectory}/package.json ${rootDirectory}/package-lock.json* ${rootDirectory}/yarn.lock* ${rootDirectory}/pnpm-lock.yaml* ./${rootDirectory}/`
        : `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./`;

    return `FROM node:20-alpine AS deps
WORKDIR /app
${copyFiles}
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

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/${getPath('build')} ./${getPath('build')}
COPY --from=builder /app/${getPath('public')} ./${getPath('public')}

EXPOSE 8080
CMD ["sh", "-c", "cd ${rootDirectory || '.'} && npm start"]`;
}

function generateNextjsDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, restoreCache, rootDirectory, buildCommand = 'npm run build' } = config;

    // Helper to format path
    const getPath = (path: string) => {
        if (!rootDirectory || rootDirectory === '.') return path;
        const cleanPath = path.startsWith('./') ? path.substring(2) : path;
        return `${rootDirectory}/${cleanPath}`;
    };

    const buildCmd = rootDirectory && rootDirectory !== '.'
        ? `cd ${rootDirectory} && ${buildCommand}`
        : buildCommand;

    const publicPath = getPath('public');
    const staticPath = getPath('.next/static');
    const standalonePath = getPath('.next/standalone');
    const isSubdir = rootDirectory && rootDirectory !== '.';
    const copyFiles = isSubdir
        ? `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN mkdir -p ${rootDirectory}
COPY ${rootDirectory}/package.json ${rootDirectory}/package-lock.json* ${rootDirectory}/yarn.lock* ${rootDirectory}/pnpm-lock.yaml* ./${rootDirectory}/`
        : `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./`;

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
${copyFiles}
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
RUN if [ -d "${getPath('prisma')}" ]; then cd ${rootDirectory || '.'} && npx prisma generate; fi
${restoreCache ? `# Copy restored cache to .next/cache\nCOPY ${getPath('restore_cache/')} ${getPath('.next/')}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/${publicPath} ./public
RUN mkdir -p .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/${standalonePath} ./
COPY --from=builder --chown=nextjs:nodejs /app/${staticPath} ./.next/static

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]`;
}

function generateViteDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build', rootDirectory } = config;

    // Helper to format path
    const getPath = (path: string) => {
        if (!rootDirectory || rootDirectory === '.') return path;
        const cleanPath = path.startsWith('./') ? path.substring(2) : path;
        return `${rootDirectory}/${cleanPath}`;
    };

    const buildCmd = rootDirectory && rootDirectory !== '.'
        ? `cd ${rootDirectory} && ${buildCommand}`
        : buildCommand;

    const distPath = getPath(outputDirectory);

    const isSubdir = rootDirectory && rootDirectory !== '.';
    const copyFiles = isSubdir
        ? `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN mkdir -p ${rootDirectory}
COPY ${rootDirectory}/package.json ${rootDirectory}/package-lock.json* ${rootDirectory}/yarn.lock* ${rootDirectory}/pnpm-lock.yaml* ./${rootDirectory}/`
        : `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./`;

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
${copyFiles}
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
COPY --from=builder /app/${distPath} /usr/share/nginx/html
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
