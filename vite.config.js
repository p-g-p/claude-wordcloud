import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/claude-wordcloud/', // <-- change to '/<your-repo-name>/'
});
