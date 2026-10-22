FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY src ./src
COPY config ./config
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DB_PATH=/app/data/protocol-zero.sqlite
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/ready').then(x=>process.exit(x.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.js"]
