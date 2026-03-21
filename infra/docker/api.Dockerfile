# API — NestJS control plane (monorepo root = build context)
FROM node:20-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY services ./services
COPY libs ./libs

ENV CI=true
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
RUN npm install --omit=dev

EXPOSE 3010
ENV PORT=3010
CMD ["node", "dist/main.js"]
