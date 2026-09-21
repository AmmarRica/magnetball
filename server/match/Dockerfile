# The match server image: Playwright's own Chromium image (browser and its system
# libraries already installed, pinned to the Playwright version in package.json), the
# game files, and this folder. Built by .github/workflows/azure.yml from the repo root:
#   docker build -f server/match/Dockerfile -t magnetball-match .
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PORT=8080 GAME_DIR=/app/game
# Only the runtime files of the game — the same set the site deploy stages.
COPY index.html sw.js manifest.json icon.svg /app/game/
COPY assets /app/game/assets
COPY server/match/package.json server/match/package-lock.json /app/match/
RUN cd /app/match && npm ci --omit=dev
COPY server/match/matchServer.mjs server/match/relay.mjs /app/match/
EXPOSE 8080
CMD ["node", "/app/match/matchServer.mjs"]
