/**
 * Main server entry point for the Chess application.
 * Handles HTTP/HTTPS requests, WebSocket connections, and serves the SvelteKit application.
 * Implements security measures and integrates with Socket.IO for real-time gameplay.
 */

import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { createSocketServer } from './lib/server/socket.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Initialize Express application
const app = express();
const server = createServer(app);

/**
 * Security Configuration
 * Uses Helmet middleware to set security headers and implement CSP
 * CSP is configured to allow WebSocket connections and inline scripts/styles
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],  // Allow inline scripts for SvelteKit
            styleSrc: ["'self'", "'unsafe-inline'"],   // Allow inline styles for SvelteKit
            connectSrc: ["'self'", "ws:", "wss:"]      // Allow WebSocket connections
        }
    }
}));

/**
 * Rate Limiting Configuration
 * Protects against brute force and DDoS attacks
 * Limits each IP to 100 requests per 15 minutes
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

/**
 * Socket.IO Server Configuration
 * Sets up real-time WebSocket communication with security settings
 * Handles CORS in development and production environments
 */
const io = new Server(server, {
    cors: {
        // Only allow CORS in development
        origin: process.env.NODE_ENV === 'production' ? false : "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 60000,      // Connection timeout after 60s of inactivity
    pingInterval: 25000,     // Send ping every 25s to keep connection alive
    transports: ['websocket'] // Force WebSocket protocol
});

// Initialize Socket.IO event handlers
createSocketServer(io);

/**
 * Static File Serving Configuration
 * In production, serves the built SvelteKit application
 */
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const staticPath = resolve(currentDirPath, '../build/client');

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(staticPath, {
        maxAge: '1d',    // Cache static files for 1 day
        index: false     // Don't serve index.html directly
    }));
}

/**
 * SvelteKit Integration
 * Handles all routes through SvelteKit's server-side rendering
 * Falls back to static index.html in production for client-side routing
 */
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

/**
 * Server Startup
 * Listens on configured port or falls back to 3000
 * Logs server status on successful start
 */
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 