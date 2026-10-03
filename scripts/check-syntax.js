#!/usr/bin/env node
// Parses/transforms the given files (default: all app JS) with the project's Babel config.
// Usage: node scripts/check-syntax.js [file ...]
const fs   = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const defaults = () => {
    const out = [ 'App.js' ];
    for (const dir of [ 'components', 'includes', 'plugins' ]) {
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); } else if (p.endsWith('.js')) { out.push(path.relative(root, p)); }
        });
        if (fs.existsSync(path.join(root, dir))) { walk(path.join(root, dir)); }
    }
    return out;
};

const files = process.argv.length > 2 ? process.argv.slice(2) : defaults();
let failed = 0;

for (const file of files) {
    try {
        const abs = path.resolve(root, file);
        babel.transformFileSync(abs, { cwd: root, configFile: path.join(root, 'babel.config.js'), code: false });
        // Relative imports must resolve to an existing file.
        const source = fs.readFileSync(abs, 'utf8');
        for (const match of source.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const base = path.resolve(path.dirname(abs), match[1]);
            const candidates = [ base, `${base}.js`, `${base}.json`, path.join(base, 'index.js') ];
            if (!candidates.some(c => fs.existsSync(c) && fs.statSync(c).isFile())) {
                throw new Error(`unresolved import '${match[1]}'`);
            }
        }
    } catch (error) {
        failed++;
        console.error(`✗ ${file}\n  ${error.message.split('\n').slice(0, 6).join('\n  ')}`);
    }
}

console.log(failed ? `${failed}/${files.length} files failed` : `ok: ${files.length} files`);
process.exit(failed ? 1 : 0);
