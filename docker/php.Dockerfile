FROM dunglas/frankenphp:1-php8.3
RUN install-php-extensions pdo_pgsql intl zip opcache redis apcu \
 && apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV COMPOSER_ALLOW_SUPERUSER=1
WORKDIR /app

COPY uploads.ini /usr/local/etc/php/conf.d/sofia-uploads.ini
