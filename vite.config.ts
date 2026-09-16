import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

// Add self-hosted origins here, e.g. 'https://sonar.example.com'
const HOSTS = ['https://sonarcloud.io'];

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'SonarQube Issues Copier',
        namespace: 'sonarqube-issues-copier',
        match: HOSTS.map((host) => `${host}/*`),
      },
    }),
  ],
});
