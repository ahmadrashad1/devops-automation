FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY services ./services
RUN npm install -g pnpm && pnpm install --filter worker...
RUN pnpm --filter worker build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/worker/dist ./dist
COPY services/worker/package.json ./
RUN npm install -g pnpm && pnpm install --prod
CMD ["node", "dist/main.js"]

