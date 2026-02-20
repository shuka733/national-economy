import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/national-economy/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                test: resolve(__dirname, 'test.html'),
            },
        },
    },
    server: {
        host: true,  // LANアクセスを許可（0.0.0.0でリッスン）
    },
})
