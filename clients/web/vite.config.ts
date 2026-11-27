import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // O Keycloak e o Kong só aceitam a origem http://localhost:5173.
    server: { port: 5173, strictPort: true },
});
