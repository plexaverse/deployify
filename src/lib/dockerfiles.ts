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
        case 'nuxt':
            return generateNuxtDockerfile(config);
        case 'sveltekit':
            return generateSvelteKitDockerfile(config);
        case 'bun':
            return generateBunDockerfile(config);
        case 'nextjs':
        default:
            return generateNextjsDockerfile(config);
    }
}

function generateBunDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'bun run build', rootDirectory, outputDirectory = 'dist', restoreCache } = config;

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
        ? `COPY package.json bun.lockb* ./
RUN mkdir -p ${rootDirectory}
COPY ${rootDirectory}/package.json ${rootDirectory}/bun.lockb* ./${rootDirectory}/`
        : `COPY package.json bun.lockb* ./`;

    const outputPath = getPath(outputDirectory);

    return `FROM oven/bun:1-alpine AS deps
WORKDIR /app
${copyFiles}
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
${buildEnvSection}
${restoreCache ? `# Copy restored cache\nCOPY ${getPath('restore_cache/cache')} ${getPath('node_modules/.cache')}` : ''}
RUN ${buildCmd}

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 bunjs && adduser --system --uid 1001 bunjs --ingroup bunjs

COPY --from=builder --chown=bunjs:bunjs /app/package.json ./package.json
COPY --from=builder --chown=bunjs:bunjs /app/node_modules ./node_modules
COPY --from=builder --chown=bunjs:bunjs /app/${outputPath} ./${outputPath}

USER bunjs
EXPOSE 8080
WORKDIR /app/${rootDirectory || '.'}
CMD ["bun", "run", "start"]`;
}

function generateNuxtDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'npm run build', rootDirectory, restoreCache } = config;

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

    const outputServerPath = getPath('.output/server/index.mjs');
    const outputPublicPath = getPath('.output/public');

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
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
${restoreCache ? `# Copy restored cache to .nuxt/cache\nCOPY ${getPath('restore_cache/cache')} ${getPath('.nuxt/cache')}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs

COPY --from=builder --chown=nodejs:nodejs /app/${outputServerPath} ./${outputServerPath}
COPY --from=builder --chown=nodejs:nodejs /app/${outputPublicPath} ./${outputPublicPath}
# Copy the whole .output if needed for other nitro presets
COPY --from=builder --chown=nodejs:nodejs /app/${getPath('.output')} ./${getPath('.output')}

USER nodejs
EXPOSE 8080
CMD ["node", "./${outputServerPath}"]`;
}

function generateSvelteKitDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, buildCommand = 'npm run build', rootDirectory, restoreCache } = config;

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

    const buildPath = getPath('build');

    return `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
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
${restoreCache ? `# Copy restored cache to .svelte-kit\nCOPY ${getPath('restore_cache/cache')} ${getPath('.svelte-kit')}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs

COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/${buildPath} ./${buildPath}

USER nodejs
EXPOSE 8080
CMD ["node", "./${buildPath}/index.js"]`;
}

function generateAstroDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build', rootDirectory, restoreCache } = config;

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
${restoreCache ? `# Copy restored cache to .astro\nCOPY ${getPath('restore_cache/cache')} ${getPath('.astro')}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs

COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/${outputPath} ./${outputPath}

USER nodejs
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

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs --ingroup nodejs

COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
${rootDirectory && rootDirectory !== '.' ? `COPY --from=builder --chown=nodejs:nodejs /app/${getPath('package.json')} ./${getPath('package.json')}` : ''}
COPY --from=builder --chown=nodejs:nodejs /app/${getPath('build')} ./${getPath('build')}
COPY --from=builder --chown=nodejs:nodejs /app/${getPath('public')} ./${getPath('public')}

USER nodejs
EXPOSE 8080
WORKDIR /app/${rootDirectory || '.'}
CMD ["npm", "start"]`;
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

    const builderPublicPath = getPath('public');
    const builderStaticPath = getPath('.next/static');
    const builderStandalonePath = getPath('.next/standalone');

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
${restoreCache ? `# Copy restored cache to .next/cache\nCOPY ${getPath('restore_cache/cache')} ${getPath('.next/cache')}` : ''}
RUN ${buildCmd}

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/${builderPublicPath} ./public
RUN mkdir -p .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/${builderStandalonePath} ./
COPY --from=builder --chown=nextjs:nodejs /app/${builderStaticPath} ./.next/static

USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f \\\"${rootDirectory || '.'}/server.js\\\" ]; then node \\\"${rootDirectory || '.'}/server.js\\\"; else echo 'Error: server.js not found' && exit 1; fi"]`;
}

function generateViteDockerfile(config: DockerfileConfig): string {
    const { buildEnvSection, outputDirectory = 'dist', buildCommand = 'npm run build', rootDirectory, restoreCache } = config;

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
${restoreCache ? `# Copy restored cache to node_modules/.vite\nCOPY ${getPath('restore_cache/cache')} ${getPath('node_modules/.vite')}` : ''}
RUN ${buildCmd}

FROM nginx:alpine
# Copy build artifacts with proper ownership
COPY --from=builder /app/${distPath} /usr/share/nginx/html

# Add custom nginx config for SPA (standardize on port 8080 for Cloud Run)
RUN echo 'server { \\
    listen 8080; \\
    server_name localhost; \\
    root /usr/share/nginx/html; \\
    index index.html; \\
    location / { \\
        try_files $uri $uri/ /index.html; \\
    } \\
}' > /etc/nginx/conf.d/default.conf

# Standard nginx:alpine uses 'nginx' user, but run it explicitly
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]`;
}
