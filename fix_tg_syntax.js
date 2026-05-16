const fs = require('fs');
const path = '/root/zeroscreen/dist/server.js';
let s = fs.readFileSync(path, 'utf8');

// Fix the backtick template literal inside an outer template literal (server HTML string)
// Line ~3408: else st.innerHTML = `<span style="color:#dc2626">&#x274C; ${d.error || 'Failed'}</span>`;
// Replace with string concatenation to avoid backtick-in-backtick syntax error
const BAD = 'else st.innerHTML = `<span style="color:#dc2626">&#x274C; ${d.error || \'Failed\'}</span>`;';
const GOOD = "else st.innerHTML = '<span style=\"color:#dc2626\">&#x274C; ' + (d.error || 'Failed') + '</span>';";

if (!s.includes(BAD)) {
    // try without escaped quotes
    const BAD2 = 'else st.innerHTML = `<span style="color:#dc2626">&#x274C; ${d.error || \'Failed\'}</span>`;';
    console.log('Trying alternate match...');
    // Search by splitting on known unique parts
    const idx = s.indexOf('else st.innerHTML = `<span style="color:#dc2626">&#x274C;');
    if (idx < 0) { console.error('BAD string not found'); process.exit(1); }
    const lineEnd = s.indexOf('\n', idx);
    const originalLine = s.substring(idx, lineEnd);
    console.log('Found line:', originalLine);
    s = s.substring(0, idx) + GOOD + s.substring(lineEnd);
} else {
    s = s.replace(BAD, GOOD);
}

fs.writeFileSync(path, s, 'utf8');
console.log('Fixed backtick syntax error in server.js');
