import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// GitHub Pages serves the site from /<repo-name>/, so the base path must match.
// Override with VITE_BASE=/ when serving from a custom domain.
const base = process.env.VITE_BASE || (process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/')

export default defineConfig({
  base: process.env.SINGLEFILE ? './' : base,
  plugins: [react(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
})
