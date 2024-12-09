/**
 * Client-side Socket.IO configuration and initialization.
 * Handles WebSocket connection setup with automatic environment detection
 * and connection fallback options.
 */

import { io } from 'socket.io-client';

/**
 * Creates and configures a Socket.IO client instance
 * 
 * @returns {Socket} Configured Socket.IO client instance
 * 
 * Environment Detection:
 * - Automatically detects localhost/production environment
 * - Uses appropriate port (3000 for dev, 443 for prod)
 * - Configures connection based on environment
 * 
 * Connection Settings:
 * - Uses WebSocket transport exclusively
 * - Implements reconnection with backoff
 * - Maintains consistent socket.io path
 */
export function createSocket() {
    // Detect if running on localhost
    const isLocalhost = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1');
    
    // Determine environment based on port
    // Port 443 indicates production HTTPS
    const isDev = isLocalhost && window.location.port !== '443';
    
    // Configure socket URL based on environment
    const socketUrl = isDev ? 'http://localhost:3000' : window.location.origin;
    console.log('Socket connecting to:', socketUrl, { isDev, port: window.location.port });
    
    // Create and return configured socket instance
    return io(socketUrl, {
        transports: ['websocket'],           // Force WebSocket protocol only
        reconnectionDelayMax: 10000,         // Maximum reconnection delay of 10 seconds
        reconnectionAttempts: 10,            // Try to reconnect 10 times
        path: '/socket.io'                   // Socket.IO endpoint path
    });
} 