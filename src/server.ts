import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { createSocketServer } from './lib/server/socket.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Create Socket.IO server with CORS and security configuration
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket']
});

// Initialize socket handlers
createSocketServer(io);

// Serve static files from the build directory
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const staticPath = resolve(currentDirPath, '../build/client');

// In production, serve the static files
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(staticPath, {
        maxAge: '1d',
        index: false
    }));
}

// Handle SvelteKit routes
app.use('*', async (req, res) => {
    try {
        const handler = await import('../build/handler.js');
        handler.handler(req, res, (err?: Error | null) => {
            if (err) {
                console.error('SvelteKit error:', err);
                res.status(500).send('Internal Server Error');
            } else {
                // In production, serve index.html for unmatched routes
                if (process.env.NODE_ENV === 'production') {
                    res.sendFile(resolve(staticPath, 'index.html'));
                } else {
                    res.status(404).send('Not Found');
                }
            }
        });
    } catch (err) {
        console.error('Error handling request:', err);
        res.status(500).send('Internal Server Error');
    }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 