FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
RUN npm install -g pnpm && pnpm install --filter api...
RUN pnpm --filter api build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/package.json ./
RUN npm install -g pnpm && pnpm install --prod
CMD ["node", "dist/main.js"]

