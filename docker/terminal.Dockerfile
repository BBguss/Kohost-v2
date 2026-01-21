# ============================================
# KOHOST TERMINAL - Docker Image
# ============================================
# Base image untuk isolated terminal environment
# Setiap user mendapatkan container terpisah
# 
# INCLUDES: Node.js 18, PHP 8.x, Composer, Git, NPM, Yarn
# All runtimes needed for php artisan, npm, composer commands

FROM node:18-bullseye

LABEL maintainer="KoHost Panel"
LABEL description="Isolated terminal environment for web hosting"

# ============================================
# INSTALL DEVELOPMENT TOOLS
# ============================================

# Add PHP 8.x repository for latest PHP
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Basic tools
    bash \
    curl \
    wget \
    nano \
    vim \
    git \
    unzip \
    zip \
    tar \
    gzip \
    ca-certificates \
    gnupg \
    lsb-release \
    # PHP 8.x & Extensions (for Laravel)
    php \
    php-cli \
    php-mbstring \
    php-xml \
    php-curl \
    php-zip \
    php-mysql \
    php-pdo \
    php-json \
    php-tokenizer \
    php-bcmath \
    php-gd \
    php-intl \
    # MySQL client
    default-mysql-client \
    # Build tools (for native npm modules)
    build-essential \
    python3 \
    # Process management
    procps \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================
# INSTALL COMPOSER (PHP Package Manager)
# ============================================
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer \
    && chmod +x /usr/local/bin/composer

# ============================================
# INSTALL YARN & PNPM (Alternative package managers)
# ============================================
# Yarn might already exist in node image, so use --force
RUN npm install -g yarn pnpm --force || true

# ============================================
# VERIFY INSTALLATIONS
# ============================================
RUN echo "=== Verifying installations ===" \
    && node --version \
    && npm --version \
    && php --version \
    && composer --version \
    && yarn --version \
    && git --version \
    && echo "=== All tools installed successfully ==="

# ============================================
# SECURITY CONFIGURATION
# ============================================

# Create non-root user for terminal
RUN useradd -m -s /bin/bash terminal_user

# Remove sudo (security)
RUN apt-get purge -y sudo 2>/dev/null || true

# Set workspace directory
WORKDIR /workspace

# Create workspace with proper permissions
RUN mkdir -p /workspace && chown -R terminal_user:terminal_user /workspace

# ============================================
# ENVIRONMENT
# ============================================

# Full PATH including all runtime binaries
ENV HOME=/home/terminal_user
ENV PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
ENV TERM=xterm-256color
ENV NODE_ENV=development
ENV COMPOSER_HOME=/home/terminal_user/.composer
ENV NPM_CONFIG_PREFIX=/home/terminal_user/.npm-global

# Create npm global directory for non-root user
RUN mkdir -p /home/terminal_user/.npm-global \
    && mkdir -p /home/terminal_user/.composer \
    && chown -R terminal_user:terminal_user /home/terminal_user

# Switch to non-root user
USER terminal_user

# Add npm global to PATH for user
ENV PATH="/home/terminal_user/.npm-global/bin:$PATH"

# Default shell
CMD ["/bin/bash"]
