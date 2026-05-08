# Use Ubuntu as base image
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Update package lists and install required packages.
# Do not install Ubuntu's `chromium` package here because it is a snap wrapper in 24.04.
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
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    sqlite3 \
    ffmpeg \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome from the official repo, then provide chromium aliases
# so existing commands that call `chromium` or `chromium-browser` keep working.
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/chromium \
    && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/chromium-browser

# Install Node.js 24
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Puppeteer globally and use system Chrome (skip bundled browser download).
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install -g puppeteer

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
