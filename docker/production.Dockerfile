FROM node:22-alpine AS frontend
WORKDIR /build
COPY front/package*.json ./
RUN npm ci
COPY front/ ./
RUN npm run build

FROM dunglas/frankenphp:1-php8.3
RUN install-php-extensions pdo_pgsql intl zip opcache redis apcu \
 && apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
ENV APP_ENV=prod APP_DEBUG=0 COMPOSER_ALLOW_SUPERUSER=1
COPY api/ ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts
COPY --from=frontend /build/dist /app/public
COPY docker/production.Caddyfile /etc/frankenphp/Caddyfile

COPY docker/uploads.ini /usr/local/etc/php/conf.d/sofia-uploads.ini
