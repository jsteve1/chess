/**
 * Main server entry point for the Chess application.
 * Handles HTTP/HTTPS requests, WebSocket connections, and serves the SvelteKit application.
 * Implements security measures and integrates with Socket.IO for real-time gameplay.
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import type { ServerOptions } from 'https';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { createSocketServer } from './lib/server/socket.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { readFileSync } from 'fs';

// Initialize Express application
const app = express();

// Create HTTPS server with SSL certificates
const sslOptions: ServerOptions = {
    key: readFileSync(process.env.SSL_KEY || './certs/cert.key'),
    cert: readFileSync(process.env.SSL_CERT || './certs/cert.crt'),
    minVersion: 'TLSv1.2', // Enforce minimum TLS version
    ciphers: [
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
    ].join(':'), // Use only strong ciphers
};

const httpsServer = createHttpsServer(sslOptions, app);

// Create HTTP server for redirect
const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(301, { 
        Location: `https://${req.headers.host}${req.url}` 
    });
    res.end();
});

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
            connectSrc: ["'self'", "wss:"]      // Allow secure WebSocket connections only
        }
    },
    hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
    }
}));

// Force HTTPS
app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.secure) {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

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
const io = new Server(httpsServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? 'https://chess.bidseek.dev'
            : "http://localhost:5173",
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
app.use('*', async (req: Request, res: Response) => {
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
 * Listens on configured ports for HTTP and HTTPS
 * Logs server status on successful start
 */
const httpPort = process.env.HTTP_PORT || 80;
const httpsPort = process.env.HTTPS_PORT || 443;

httpServer.listen(httpPort, () => {
    console.log(`HTTP server running on port ${httpPort} (redirecting to HTTPS)`);
});

httpsServer.listen(httpsPort, () => {
    console.log(`HTTPS server running on port ${httpsPort}`);
}); 