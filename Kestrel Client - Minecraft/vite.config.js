import { defineConfig } from "vite";

// The dev server only needs to watch the web app, not the Rust/Java build output
// (Windows locks the .exe there while it's being rebuilt, which crashed the watcher).
export default defineConfig({
  server: {
    watch: { ignored: ["**/src-tauri/**", "**/website/**", "**/reference/**"] },
  },
});
