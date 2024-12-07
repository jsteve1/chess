FROM node:20-alpine

# Install build dependencies for bcrypt
RUN apk add --no-cache make gcc g++ python3 libc-dev

# Create app directory
WORKDIR /app

# Install dependencies first (caching)
COPY package*.json ./
RUN npm ci

# Copy source and certificates
COPY . .
COPY certs /app/certs

# Build the app and rebuild bcrypt
RUN npm run build && \
    npm rebuild bcrypt --build-from-source

# Remove dev dependencies and build dependencies
RUN npm prune --production && \
    apk del make gcc g++ python3 libc-dev

# Don't run as root
USER node

ENV NODE_ENV=production
ENV PORT=443

EXPOSE 443

CMD ["node", "build/server.js"] 