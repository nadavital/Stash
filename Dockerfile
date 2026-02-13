FROM node:22-slim

WORKDIR /app

COPY src/ ./src/
COPY public/ ./public/
COPY mcp/ ./mcp/
COPY openclaw/ ./openclaw/

RUN mkdir -p /app/data

EXPOSE 8787

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
