FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY index.html vite.config.js postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

RUN SKIP_POSTBUILD=1 npm run build

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev
RUN apk del python3 make g++

COPY server ./server
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8099
ENV DATA_DIR=/config

EXPOSE 8099

CMD ["node", "server/index.js"]
