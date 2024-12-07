import { io } from 'socket.io-client';

export function createSocket() {
    const isLocalhost = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1');
    
    // Check if we're running in development mode (localhost:3000/5173) or production mode (localhost:443)
    const isDev = isLocalhost && window.location.port !== '443';
    
    const socketUrl = isDev ? 'http://localhost:3000' : window.location.origin;
    console.log('Socket connecting to:', socketUrl, { isDev, port: window.location.port });
    
    return io(socketUrl, {
        transports: ['websocket'],
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 10,
        path: '/socket.io'
    });
} 