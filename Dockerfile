# syntax=docker/dockerfile:1

# WonderHome portal fetch worker (story 08-033): headless Playwright + the core
# engine. This image builds and runs apps/portal-worker ONLY — it is not the
# Next.js web app (that runs on Vercel). Deploys to Fly.
#
# The Playwright base image carries Chromium's system libraries; `npx playwright
# install chromium` then fetches the browser build matching the installed
# Playwright. Secrets (SUPABASE_SERVICE_ROLE_KEY etc.) are provided at runtime as
# Fly secrets, never baked into the image.

FROM mcr.microsoft.com/playwright:v1.56.1-jammy
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Copy the whole monorepo in one shot so npm can resolve the workspace graph.
# (The failed auto-generated Dockerfile ran `npm ci` with only the root
# package.json present, so workspace deps — including the web app's `next` —
# were never installed. This worker doesn't build the web app at all.)
COPY . .
RUN npm ci

# Ensure the Chromium build matching the installed Playwright is present.
RUN npx playwright install chromium

EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@wonderhome/portal-worker"]
