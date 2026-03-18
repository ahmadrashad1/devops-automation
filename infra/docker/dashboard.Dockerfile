FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
RUN npm install -g pnpm && pnpm install --filter dashboard...
RUN pnpm --filter dashboard build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/dashboard ./
RUN npm install -g pnpm
EXPOSE 3000
CMD ["pnpm", "start"]

