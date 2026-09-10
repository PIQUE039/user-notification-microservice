FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# Run as a non-root user - default node image ships one already.
USER node

EXPOSE 4001
CMD ["node", "src/index.js"]
