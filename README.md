# Persona - Professional Character Simulation

A secure application for simulating professional character conversations with advanced memory compression and persistence.

## Features

- Character profiles with customizable traits and knowledge
- 2-Layer memory system (short-term and long-term memory)
- Memory compression for efficient context management
- Session persistence with save/load functionality
- Secure authentication and HTTPS support
- Support for various Claude models

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/persona.git
cd persona
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your Anthropic API key and other settings:
```
ANTHROPIC_API_KEY=your_api_key
AUTH_USERNAME=your_username
AUTH_PASSWORD=your_secure_password
SESSION_KEY=your_random_session_key
```

## Setting up on EC2

### Secure Deployment on AWS EC2

To deploy this application securely on an AWS EC2 instance:

1. Launch an EC2 instance with the appropriate security group settings:
   - Allow inbound traffic only on ports 22 (SSH), 80 (HTTP), and 443 (HTTPS)

2. Install Node.js and dependencies:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. Clone your repository to the EC2 instance

4. Install application dependencies:
```bash
cd persona
npm install
```

5. Set up SSL/TLS for HTTPS (if you have a domain):
```bash
sudo npm run setup-ssl
```
This will guide you through setting up Let's Encrypt certificates.

6. Update your security settings in the `.env` file:
```
AUTH_USERNAME=your_username
AUTH_PASSWORD=your_strong_password
USE_HTTPS=true
```

7. Start the application:
```bash
npm start
```

8. To keep the application running after you disconnect, use PM2:
```bash
sudo npm install -g pm2
pm2 start server.js
pm2 startup
pm2 save
```

### Accessing Your Application

- If using HTTPS with a domain: `https://yourdomain.com`
- If using HTTP only: `http://your-ec2-public-ip:3000`

You'll be prompted for the username and password you configured in the `.env` file.

## Usage

1. Start the server:
```bash
npm start
```

2. Access the application:
   - If running locally: http://localhost:3000
   - If running on EC2 with HTTPS: https://yourdomain.com

3. Log in with your configured credentials

4. Create a new session or load an existing one

5. Choose a character profile or create a custom one

## Security

This application includes:
- Basic authentication
- HTTPS support with Let's Encrypt
- Security headers with Helmet
- Session management
- Input validation

## License

MIT License