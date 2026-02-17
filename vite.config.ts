import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/national-economy/',
    server: {
        host: true,  // LANアクセスを許可（0.0.0.0でリッスン）
    },
})
