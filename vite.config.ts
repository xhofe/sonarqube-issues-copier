import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'SonarQube Issues Copier',
        namespace: 'sonarqube-issues-copier',
        match: ['*://*/*'],
        author: 'Andy Hsu',
        description: 'Copy issues from SonarQube to clipboard',
        license: 'MIT',
        icon: 'https://sonarcloud.io/favicon.ico',
      },
    }),
  ],
});
