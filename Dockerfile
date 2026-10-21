# Build stage: install everything, build client and server.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/game/package.json apps/game/
COPY server/package.json server/
COPY prototypes/package.json prototypes/
RUN npm ci
COPY apps/game apps/game
COPY server server
COPY prototypes prototypes
COPY story story
RUN npm run build

# Runtime stage: production deps, compiled server, static client.
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/game/package.json apps/game/
COPY server/package.json server/
COPY prototypes/package.json prototypes/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/apps/game/dist apps/game/dist
COPY --from=build /app/prototypes/dist prototypes/dist
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/index.js"]
