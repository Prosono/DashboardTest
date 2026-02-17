ARG BUILD_FROM=node:20-alpine
FROM ${BUILD_FROM}

WORKDIR /app

# Native build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

# Remove build deps after install to keep image smaller
RUN apk del python3 make g++

COPY server ./server
COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=8099
ENV DATA_DIR=/config

EXPOSE 8099

CMD ["node", "server/index.js"]
