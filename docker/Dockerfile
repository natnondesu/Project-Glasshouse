# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f docker/Dockerfile -t oxygenai/glasshouse:$(git rev-parse --short HEAD) .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile
COPY . .
RUN VITE_GLASSHOUSE_SERVER=1 pnpm --filter @glasshouse/web exec vite build --outDir dist-server \
 && pnpm --filter @glasshouse/server build \
 && pnpm --filter @glasshouse/server deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 GLASSHOUSE_WEB_DIR=/app/web
WORKDIR /app
# So TZ=Asia/Bangkok applies to the server: the backup download's file name carries the local day, not the UTC day.
RUN apk add --no-cache tzdata
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist-server ./web
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:8787/api/ready || exit 1
CMD ["node", "dist/main.js"]
