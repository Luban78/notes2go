FROM node:22-alpine
WORKDIR /app
RUN npm install --no-audit --no-fund --omit=dev --save-exact web-push@3.6.7
COPY worker.mjs /app/worker.mjs
CMD ["node", "/app/worker.mjs"]
