import { defineConfig } from 'vite';

// GitHub Pages 公開時は LAP_ONE_BASE=/Lap-One/ を指定する
export default defineConfig({
  base: process.env.LAP_ONE_BASE ?? './',
  // 開発サーバーの番号 (ほかのアプリと重ならないように 5190 に固定)
  server: { port: 5190 },
});
