# ============================================
# KOHOST TERMINAL - Docker Image
# ============================================
# Base image untuk isolated terminal environment
# Setiap user mendapatkan container terpisah
# 
# INCLUDES: Node.js 18, PHP 8.2, Composer, Git, NPM, Yarn
# All runtimes needed for php artisan, npm, composer commands

FROM node:18-bullseye

LABEL maintainer="KoHost Panel"
LABEL description="Isolated terminal environment for web hosting"

# ============================================
# INSTALL PHP 8.2 FROM SURY REPOSITORY
# ============================================
# Debian Bullseye default PHP is 7.4, we need 8.2 for Laravel 10/11/12

RUN apt-get update && apt-get install -y --no-install-recommends \
    apt-transport-https \
    lsb-release \
    ca-certificates \
    curl \
    wget \
    gnupg \
    && curl -sSLo /usr/share/keyrings/deb.sury.org-php.gpg https://packages.sury.org/php/apt.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list \
    && apt-get update

# ============================================
# INSTALL DEVELOPMENT TOOLS + PHP 8.2
# ============================================

RUN apt-get install -y --no-install-recommends \
    # Basic tools
    bash \
    nano \
    vim \
    git \
    unzip \
    zip \
    tar \
    gzip \
    # PHP 8.2 & Extensions (for Laravel 10/11/12)
    php8.2 \
    php8.2-cli \
    php8.2-common \
    php8.2-mbstring \
    php8.2-xml \
    php8.2-curl \
    php8.2-zip \
    php8.2-mysql \
    php8.2-pdo \
    php8.2-tokenizer \
    php8.2-bcmath \
    php8.2-gd \
    php8.2-intl \
    php8.2-sqlite3 \
    php8.2-dom \
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

# Set PHP 8.2 as default
RUN update-alternatives --set php /usr/bin/php8.2 || true

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
# GIT SAFE DIRECTORY (untuk mounted volumes)
# ============================================
RUN git config --global --add safe.directory '*'

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
