#!/bin/bash

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# Get domain name
read -p "Enter your domain name (e.g., example.com): " DOMAIN

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
  echo "Certbot not found. Installing..."
  
  # Detect OS
  if [ -f /etc/debian_version ]; then
    # Debian/Ubuntu
    apt-get update
    apt-get install -y certbot
  elif [ -f /etc/redhat-release ]; then
    # CentOS/RHEL/Fedora
    yum install -y certbot
  else
    echo "Unsupported OS. Please install Certbot manually."
    exit 1
  fi
fi

# Generate SSL certificate
echo "Generating SSL certificate for $DOMAIN..."
certbot certonly --standalone -d $DOMAIN --agree-tos --email admin@$DOMAIN --non-interactive

# Check if successful
if [ $? -ne 0 ]; then
  echo "Certificate generation failed. Please check error messages."
  exit 1
fi

# Update .env file with certificate paths
echo "Updating .env file with certificate paths..."
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "Creating .env file..."
  cp .env.example .env
fi

# Update .env file
sed -i "s|CERT_PATH=.*|CERT_PATH=$CERT_PATH|" .env
sed -i "s|KEY_PATH=.*|KEY_PATH=$KEY_PATH|" .env
sed -i "s|USE_HTTPS=.*|USE_HTTPS=true|" .env

echo "SSL setup complete!"
echo "Certificate: $CERT_PATH"
echo "Private key: $KEY_PATH"
echo "USE_HTTPS set to true in .env"

echo "Now update your AUTH_USERNAME and AUTH_PASSWORD in .env for security!"
echo "Then restart your application with 'npm start'"