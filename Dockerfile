FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 ADMIN_HOSTED=true PORT=3100
COPY --from=build --chown=node:node /app /app
# WORKDIR creates /app as root; provision the writable runtime directory explicitly.
RUN install -d -m 0700 -o node -g node /app/.data
USER node
# Fail the image build if the application user cannot create runtime files.
RUN node -e "const fs = require('node:fs'); const dir = fs.mkdtempSync('/app/.data/permissions-'); fs.writeFileSync(dir + '/probe', 'ok'); fs.rmSync(dir, { recursive: true });"
EXPOSE 3100
CMD ["npm", "run", "start:server"]
