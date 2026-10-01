import { copyFileSync, cpSync } from 'node:fs';

copyFileSync('site/index.html', 'site-dist/index.html');
cpSync('node_modules/prodcalendar/dist', 'site-dist/vendor/prodcalendar', { recursive: true, filter: (path) => !path.endsWith('.ts') && !path.endsWith('.map') });
