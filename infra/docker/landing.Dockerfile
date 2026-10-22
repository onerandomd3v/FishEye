FROM node:22.22.0-bookworm-slim AS build

ARG PUBLIC_CONSOLE_URL=https://console.fisheye.invalid/login
ENV PUBLIC_CONSOLE_URL=${PUBLIC_CONSOLE_URL}

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fisheye/landing build

FROM nginx:1.29-alpine AS runtime

COPY --from=build /repo/apps/web/landing/dist/ /usr/share/nginx/html/
EXPOSE 80
