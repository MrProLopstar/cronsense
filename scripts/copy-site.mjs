import { copyFileSync, cpSync } from 'node:fs';

copyFileSync('site/index.html', 'site-dist/index.html');
cpSync('node_modules/@mrprolopstar/prodcal/src', 'site-dist/vendor/prodcal', { recursive: true, filter: (path) => !path.endsWith('.ts') });
