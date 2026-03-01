/**
 * Built-in project templates for "Ava: New from Template" command.
 */
import type { AvaProjectTemplate } from '../common/ava-agent-protocol';

export const BUILTIN_TEMPLATES: AvaProjectTemplate[] = [
  {
    id: 'react-vite-ts',
    name: 'React (Vite + TypeScript)',
    description: 'Modern React app with Vite, TypeScript, and hot reload',
    icon: 'codicon-symbol-namespace',
    openFile: 'src/App.tsx',
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "{{PROJECT_NAME}}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "~5.7.0",
    "vite": "^6.0.0"
  }
}`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}`,
      },
      {
        path: 'vite.config.ts',
        content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`,
      },
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{PROJECT_NAME}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      },
      {
        path: 'src/main.tsx',
        content: `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);`,
      },
      {
        path: 'src/App.tsx',
        content: `import { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>{{PROJECT_NAME}}</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

React + TypeScript project using Vite.

## Conventions
- Use functional components with hooks
- Prefer named exports
- TypeScript strict mode enabled`,
      },
    ],
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework with App Router',
    icon: 'codicon-globe',
    openFile: 'app/page.tsx',
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "{{PROJECT_NAME}}",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "~5.7.0"
  }
}`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`,
      },
      {
        path: 'next.config.js',
        content: `/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;`,
      },
      {
        path: 'app/layout.tsx',
        content: `export const metadata = {
  title: '{{PROJECT_NAME}}',
  description: 'Created with Ava | Supernova',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`,
      },
      {
        path: 'app/page.tsx',
        content: `export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>{{PROJECT_NAME}}</h1>
      <p>Edit <code>app/page.tsx</code> to get started.</p>
    </main>
  );
}`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

Next.js project with App Router.

## Conventions
- Use Server Components by default
- Add 'use client' only when needed
- Use TypeScript strictly`,
      },
    ],
  },
  {
    id: 'python-flask',
    name: 'Python Flask',
    description: 'Lightweight Python web application',
    icon: 'codicon-beaker',
    openFile: 'app.py',
    files: [
      {
        path: 'app.py',
        content: `from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", title="{{PROJECT_NAME}}")


if __name__ == "__main__":
    app.run(debug=True)`,
      },
      {
        path: 'requirements.txt',
        content: `flask>=3.0.0`,
      },
      {
        path: 'templates/index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>
</head>
<body>
    <h1>{{ title }}</h1>
    <p>Edit <code>app.py</code> to get started.</p>
</body>
</html>`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

Python Flask web application.

## Setup
\`\`\`
pip install -r requirements.txt
python app.py
\`\`\``,
      },
    ],
  },
  {
    id: 'python-fastapi',
    name: 'Python FastAPI',
    description: 'High-performance async Python API',
    icon: 'codicon-zap',
    openFile: 'main.py',
    files: [
      {
        path: 'main.py',
        content: `from fastapi import FastAPI

app = FastAPI(title="{{PROJECT_NAME}}")


@app.get("/")
async def root():
    return {"message": "Hello from {{PROJECT_NAME}}"}


@app.get("/health")
async def health():
    return {"status": "ok"}`,
      },
      {
        path: 'requirements.txt',
        content: `fastapi>=0.115.0
uvicorn[standard]>=0.30.0`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

Python FastAPI application.

## Setup
\`\`\`
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\``,
      },
    ],
  },
  {
    id: 'node-express-ts',
    name: 'Node.js API (Express + TypeScript)',
    description: 'REST API with Express and TypeScript',
    icon: 'codicon-server',
    openFile: 'src/index.ts',
    files: [
      {
        path: 'package.json',
        content: `{
  "name": "{{PROJECT_NAME}}",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^5.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "~5.7.0"
  }
}`,
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}`,
      },
      {
        path: 'src/index.ts',
        content: `import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from {{PROJECT_NAME}}' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

Node.js REST API using Express and TypeScript.

## Setup
\`\`\`
npm install
npm run dev
\`\`\``,
      },
    ],
  },
  {
    id: 'rust-cli',
    name: 'Rust CLI',
    description: 'Command-line application in Rust',
    icon: 'codicon-terminal',
    openFile: 'src/main.rs',
    files: [
      {
        path: 'Cargo.toml',
        content: `[package]
name = "{{PROJECT_NAME}}"
version = "0.1.0"
edition = "2021"

[dependencies]`,
      },
      {
        path: 'src/main.rs',
        content: `fn main() {
    println!("Hello from {{PROJECT_NAME}}!");
}`,
      },
      {
        path: '.ava/instructions.md',
        content: `# {{PROJECT_NAME}}

Rust CLI application.

## Build & Run
\`\`\`
cargo run
cargo build --release
\`\`\``,
      },
    ],
  },
];
