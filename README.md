# Real-Time Multiplayer Chess

A modern, real-time multiplayer chess application built with SvelteKit, Socket.IO, and Redis. Play chess with friends through shareable game links, featuring real-time moves, game state management, and WebSocket communication.

## 🚀 Features
- Real-time multiplayer gameplay
- Shareable game links with QR codes
- Game state persistence with Redis
- Secure WebSocket connections
- Mobile-responsive design
- Time controls for each player
- Move validation and chess rules enforcement

## 🛠 Tech Stack
- **Frontend**: SvelteKit, TypeScript
- **Backend**: Node.js, Express
- **Real-time**: Socket.IO
- **State Management**: Redis
- **Security**: Helmet, Rate Limiting
- **Deployment**: Docker, HTTPS/SSL

## 🏗 Architecture
```
+----------------+     WebSocket     +----------------+     Persist     +----------------+
|                | <--------------> |                | <------------> |                |
|  SvelteKit UI  |    Socket.IO     |  Express/Node  |     State      |     Redis      |
|                |                  |                |                |                |
+----------------+                  +----------------+                +----------------+
```

## 🔧 Setup & Development
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chess-app.git
   cd chess-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

5. For production build:
   ```bash
   npm run build
   npm run start
   ```

## 🐳 Docker Deployment
```bash
# Build and run with Docker Compose
docker compose up -d
```

## 📁 Project Structure
```
chess-app/
├── src/
│   ├── lib/           # Shared components and utilities
│   ├── routes/        # SvelteKit routes and pages
│   ├── server/        # Backend server code
│   └── server.ts      # Main server entry point
├── static/           # Static assets
├── certs/           # SSL certificates
└── docker-compose.yml
```

## 🔐 Security
- HTTPS/SSL encryption
- Rate limiting
- Helmet security headers
- WebSocket security
- Input validation

## 📝 License
MIT License - See LICENSE file for details

## 🤝 Contributing
Contributions welcome! Please read CONTRIBUTING.md for guidelines.
