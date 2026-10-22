FROM node:22.22.0-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fisheye/console build

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/console/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/console/.next/static ./apps/web/console/.next/static
COPY --from=build --chown=node:node /repo/apps/web/console/public ./apps/web/console/public

USER node
EXPOSE 3000
CMD ["node", "apps/web/console/server.js"]
