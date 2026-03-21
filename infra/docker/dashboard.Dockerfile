# Dashboard — Next.js (browser calls API on host; bake public URL at build time)
FROM node:20-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY services ./services
COPY libs ./libs

ARG NEXT_PUBLIC_API_URL=http://localhost:3010
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV CI=true
RUN pnpm install --frozen-lockfile
RUN pnpm --filter dashboard build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/dashboard ./apps/dashboard

WORKDIR /app/apps/dashboard
EXPOSE 3001
# Listen on all interfaces so the container port publish works
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3001"]
