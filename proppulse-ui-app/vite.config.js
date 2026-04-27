import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/prophit/',   // 👈 THIS FIXES EVERYTHING
  plugins: [react()],
})
