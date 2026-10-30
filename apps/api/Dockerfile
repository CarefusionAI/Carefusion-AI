# CareFusion API (NestJS) - dev image. Build context is the monorepo root.
FROM node:22-slim
RUN npm install -g pnpm@9.12.0
WORKDIR /app

# Workspace files first (layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --filter @carefusion/api...

# Source
COPY packages/shared packages/shared
COPY apps/api apps/api

# Shared must be compiled first: the API imports @carefusion/shared from dist/
RUN pnpm --filter @carefusion/shared run build \
 && pnpm --filter @carefusion/api run build

WORKDIR /app/apps/api
ENV NODE_ENV=development PORT=3000
EXPOSE 3000
CMD ["node", "dist/main.js"]
