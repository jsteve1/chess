import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [sveltekit()],
    server: {
        port: 5173,
        proxy: {
            '/socket.io': {
                target: 'ws://localhost:3000',
                ws: true
            }
        }
    }
}); 