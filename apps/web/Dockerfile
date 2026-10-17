# CareFusion Web (React + Vite) - dev server image. Build context is the monorepo root.
FROM node:22-slim
RUN npm install -g pnpm@9.12.0
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @carefusion/web...

# Vite imports shared from source via resolve.alias, so no shared build is needed.
COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173"]
