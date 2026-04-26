# Use Ubuntu as base image
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install required packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    bash \
    wget \
    vim \
    git \
    gnupg \
    xvfb \
    python3-pip \
    python3-dev \
    python3-venv \
    chromium \
    sqlite3 \
    ffmpeg \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and build this Node.js project (TypeScript → build/)
COPY package.json package-lock.json ./
RUN npm i

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

RUN mkdir -p data/ai-notes-xyz-shell-files dist

ENV NODE_ENV=production
ENV EXPRESS_PORT=2000

EXPOSE 2000

CMD ["npm", "start"]

# Build the image
# docker build -t ai-notes-xyz-shell .

# Run the container
# docker run -d -p 2000:2000 ai-notes-xyz-shell
