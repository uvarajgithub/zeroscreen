const fs = require('fs');
const path = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(path, 'utf8');

let count = 0;

// Replace ALL backtick template literals of the form:
//   `<span style="color:#dc2626">ICON ${d.error || 'Failed'}</span>`
// with safe string concatenation (no nested backticks)
// Pattern: backtick, then content with ${d.error || 'Failed'}, then closing backtick + semicolon

// Strategy: find every occurrence of `<span...>${d.error || 'Failed'}</span>`
// and replace the whole thing
const regex = /`(<span[^`]*)\$\{d\.error \|\| '([^']+)'\}(<\/span>)`/g;
s = s.replace(regex, (match, before, fallback, after) => {
    count++;
    // before and after are literal strings, d.error is dynamic
    return `'${before}' + (d.error || '${fallback}') + '${after}'`;
});

// Also handle: `<span...>${d.error || "Failed"}</span>` with double quotes
const regex2 = /`(<span[^`]*)\$\{d\.error \|\| "([^"]+)"\}(<\/span>)`/g;
s = s.replace(regex2, (match, before, fallback, after) => {
    count++;
    return `'${before}' + (d.error || '${fallback}') + '${after}'`;
});

if (count === 0) {
    console.error('No backtick template literals found to fix!');
    process.exit(1);
}

fs.writeFileSync(path, s, 'utf8');
console.log('Fixed ' + count + ' backtick template literal(s) in server.js');
