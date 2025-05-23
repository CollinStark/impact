#!/bin/bash

# Default to development mode if DEBUG is not set
if [ -z "$DEBUG" ] || [ "$DEBUG" = "True" ]; then
    CONFIG_PATH="/etc/nginx/dev/nginx.conf.template"
    echo "Starting Nginx in DEVELOPMENT mode (localhost, HTTP only)."
else
    CONFIG_PATH="/etc/nginx/prod/nginx.conf.template"
    echo "Starting Nginx in PRODUCTION mode (HTTPS, custom domain)."
fi

# Copy the correct config without modifying variables
cp "$CONFIG_PATH" /etc/nginx/nginx.conf

# Validate Nginx configuration before starting
nginx -t || exit 1

# Start Nginx
exec nginx -g 'daemon off;'
