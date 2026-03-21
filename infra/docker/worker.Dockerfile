# Worker — BullMQ executor (needs Docker CLI + Git + host socket)
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY services ./services
COPY libs ./libs

ENV CI=true
RUN pnpm install --frozen-lockfile
RUN pnpm --filter worker build

FROM node:20-alpine AS runner
RUN apk add --no-cache git docker-cli ca-certificates

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/services/worker/dist ./dist
COPY --from=build /app/services/worker/package.json ./package.json
RUN npm install --omit=dev

CMD ["node", "dist/main.js"]
