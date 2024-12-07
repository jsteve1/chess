import type { Handle } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export const handle: Handle = async ({ event, resolve }) => {
    // Check for JWT token in cookies
    const token = event.cookies.get('chess_session');
    
    if (token) {
        try {
            // Verify and decode the token
            const session = jwt.verify(token, JWT_SECRET) as {
                gameId: string;
                playerId: string;
                role: string;
                isPrivate: boolean;
            };
            
            // Add session data to event.locals
            event.locals.user = session;
        } catch (err) {
            // Invalid token, clear it
            event.cookies.delete('chess_session', {
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                sameSite: 'strict'
            });
        }
    }

    // Add security headers
    const response = await resolve(event);
    
    if (process.env.NODE_ENV === 'production') {
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    
    return response;
}; 