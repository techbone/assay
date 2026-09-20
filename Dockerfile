FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
VOLUME /app/data
CMD ["npx", "tsx", "src/collector/run.ts", "--interval", "120", "--db", "/app/data/assay.db"]
