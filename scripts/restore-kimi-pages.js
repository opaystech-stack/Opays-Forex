import fs from 'fs';
import path from 'path';

const root = path.resolve('c:/LAPOSTE/Projets/FOREX');
const kimiRoot = path.join(root, 'Kimi_Agent_SAS Front‑End & Tarifs/app/src');
const outputComponents = path.join(root, 'src/components');

const transformTsxToJs = (content) => {
  return content
    .replace(/import \{ Link \} from 'react-router';\n/g, '')
    .replace(/ : React\.FormEvent/g, '')
    .replace(/ as const/g, '')
    .replace(/<Link([^>]*)>([\s\S]*?)<\/Link>/g, '<a$1>$2</a>')
    .replace(/href="\/"/g, 'href="/"')
    .replace(/to="\/register"/g, 'href="?auth=signup"')
    .replace(/to="\/login"/g, 'href="?auth=signin"')
    .replace(/to="\/"/g, 'href="/"')
    .replace(/to="#"/g, 'href="#"')
    .replace(/<a href="?auth=signup"/g, '<a href="?auth=signup"')
    .replace(/<a href="?auth=signin"/g, '<a href="?auth=signin"')
    .replace(/<a href="\//g, '<a href="/')
    .replace(/\bReact\.FormEvent\b/g, 'Event')
    .replace(/import type \{ .*? \};\n/g, '')
    .replace(/import \{ motion \} from 'framer-motion';\n/g, "import { motion } from 'framer-motion';\n");
};

const writeFile = (filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf8');
};

const copyFile = (src, dest) => {
  fs.copyFileSync(src, dest);
};

const restoreFile = (sourceRel, targetRel) => {
  const src = path.join(kimiRoot, sourceRel);
  const dest = path.join(root, targetRel);
  let content = fs.readFileSync(src, 'utf8');
  if (sourceRel.endsWith('.tsx')) {
    content = transformTsxToJs(content);
  }
  writeFile(dest, content);
  console.log(`restored ${targetRel}`);
};

const pages = ['pages/Home.tsx', 'pages/SignIn.tsx', 'pages/SignUp.tsx'];
for (const page of pages) {
  restoreFile(page, `src/pages/${path.basename(page, '.tsx')}.jsx`);
}

const sections = ['sections/Hero.tsx', 'sections/Features.tsx', 'sections/Pricing.tsx', 'sections/CTA.tsx', 'sections/Footer.tsx'];
for (const section of sections) {
  restoreFile(section, `src/sections/${path.basename(section, '.tsx')}.jsx`);
}

// Restore MeshGradient
let mesh = fs.readFileSync(path.join(kimiRoot, 'components/MeshGradient.tsx'), 'utf8');
mesh = mesh
  .replace(/interface Blob \{[\s\S]*?\}\n\n/, '')
  .replace(/const canvasRef = useRef<HTMLCanvasElement>\(null\);/g, 'const canvasRef = useRef(null);')
  .replace(/const blobsRef = useRef<Blob\[\]>\(\[\]\);/g, 'const blobsRef = useRef([]);')
  .replace(/const rafRef = useRef<number>\(0\);/g, 'const rafRef = useRef(0);')
  .replace(/const containerRef = useRef<HTMLDivElement>\(null\);/g, 'const containerRef = useRef(null);')
  .replace(/ctx!\./g, 'ctx.')
  .replace(/canvas!\./g, 'canvas.');
writeFile(path.join(outputComponents, 'MeshGradient.jsx'), mesh);
console.log('restored src/components/MeshGradient.jsx');

// Copy assets from Kimi public
const assets = ['public/logo-opays.png', 'public/hero-dashboard.jpg'];
for (const asset of assets) {
  copyFile(path.join(root, 'Kimi_Agent_SAS Front‑End & Tarifs/app', asset), path.join(root, asset));
  console.log(`copied ${asset}`);
}

const indexCss = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --deep-navy: #080E1A;
    --card-navy: #0D1526;
    --border-navy: #1A2642;
    --electric-blue: #2563EB;
    --blue-glow: #3B82F6;
    --cyan-accent: #06B6D4;
    --white: #F8FAFC;
    --muted-white: #94A3B8;
    --input-bg: #111827;
    --white-pure: #FFFFFF;

    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.625rem;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    font-family: 'Inter', sans-serif;
    background-color: var(--deep-navy);
    color: var(--white);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: 'Space Grotesk', sans-serif;
  }

  .animate-bounce-subtle {
    animation: bounce-subtle 1.5s ease-in-out infinite;
  }

  @keyframes bounce-subtle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(8px); }
  }
}
`;
writeFile(path.join(root, 'src/index.css'), indexCss);

const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(8px)' },
        },
      },
      animation: {
        'bounce-subtle': 'bounce-subtle 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
`;
writeFile(path.join(root, 'tailwind.config.js'), tailwindConfig);

console.log('restore completed');
