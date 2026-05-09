FROM node:24-alpine AS base

ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    npm_config_registry=https://registry.npmmirror.com \
    PNPM_REGISTRY=https://registry.npmmirror.com \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN sed -i 's|https://dl-cdn.alpinelinux.org/alpine|https://mirrors.aliyun.com/alpine|g' /etc/apk/repositories \
    && apk add --no-cache tzdata \
    && corepack enable \
    && pnpm config set registry https://registry.npmmirror.com

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev

ENV NODE_ENV=development \
    HOSTNAME=0.0.0.0 \
    PORT=3000

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_AEGRA_API_URL=http://localhost:2026
ARG NEXT_PUBLIC_AEGRA_ASSISTANT_ID=feedmind
ARG NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_FEEDMIND_MODEL=

ENV NEXT_PUBLIC_AEGRA_API_URL=${NEXT_PUBLIC_AEGRA_API_URL} \
    NEXT_PUBLIC_AEGRA_ASSISTANT_ID=${NEXT_PUBLIC_AEGRA_ASSISTANT_ID} \
    NEXT_PUBLIC_BACKEND_API_URL=${NEXT_PUBLIC_BACKEND_API_URL} \
    NEXT_PUBLIC_FEEDMIND_MODEL=${NEXT_PUBLIC_FEEDMIND_MODEL}

RUN pnpm build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
RUN sed -i 's|https://dl-cdn.alpinelinux.org/alpine|https://mirrors.aliyun.com/alpine|g' /etc/apk/repositories \
    && apk add --no-cache tzdata \
    && addgroup -S nodejs -g 1001 \
    && adduser -S nextjs -u 1001 -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

EXPOSE 3000

USER nextjs

CMD ["node", "server.js"]
