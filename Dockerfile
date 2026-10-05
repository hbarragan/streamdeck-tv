FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server/ ./server/
COPY public/ ./public/
ENV HOST=0.0.0.0 PORT=3477 NODE_OPTIONS=--max-old-space-size=128
USER node
EXPOSE 3477
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3477/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--env-file=/run/secrets/streamdeck.env", "server/index.js"]
