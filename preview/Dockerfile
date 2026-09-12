# Preview image for @groeponline/pi-tools.
# Packs the npm artifact and smoke-tests the exact files pi loads,
# inside a clean container. (Build context is the repo root; only the
# packages/pi-tools subpackage is packed.)
#
#   docker build -f preview/Dockerfile -t ghcr.io/groeponline/pi-tools-preview:local .
#   docker run --rm ghcr.io/groeponline/pi-tools-preview:local
FROM node:22 AS build
WORKDIR /src/packages/pi-tools
COPY packages/pi-tools/package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY packages/pi-tools/ ./
RUN mkdir -p /out && npm pack --pack-destination /out

FROM node:22-slim AS preview
WORKDIR /preview
COPY --from=build /out/*.tgz ./pkg.tgz
COPY preview/smoke.sh ./smoke.sh
RUN npm install ./pkg.tgz --prefix ./pkg --no-audit --no-fund && sh ./smoke.sh ./pkg
CMD ["sh", "./smoke.sh", "./pkg"]
