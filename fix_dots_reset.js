'use strict';
const fs = require('fs');
const FILE = '/root/zeroscreen/dist/server.js';
let src = fs.readFileSync(FILE, 'utf8');

const OLD = `      TIMELINE.forEach(function(row){
        var dot=ge('pm-dot-'+row.id);
        var rowEl=ge('pm-tl-'+row.id);
        if(!dot)return;
        var rowM=toMins(row.h,row.m);
        var isActive=nowM>=rowM&&nowM<rowM+3;
        var isDone=nowM>=rowM+3;
        if(isDone){dot.className='pm-tl-dot done';dot.textContent='\u2713';}
        else if(isActive){dot.className='pm-tl-dot active';dot.textContent='\u25b6';}
        else{dot.className='pm-tl-dot';dot.textContent='';}
      });`;

const NEW = `      // After market close (15:30), reset all dots to empty — fresh for next morning
      var marketClosed=nowM>=toMins(15,30);
      TIMELINE.forEach(function(row){
        var dot=ge('pm-dot-'+row.id);
        if(!dot)return;
        if(marketClosed){dot.className='pm-tl-dot';dot.textContent='';return;}
        var rowM=toMins(row.h,row.m);
        var isActive=nowM>=rowM&&nowM<rowM+3;
        var isDone=nowM>=rowM+3;
        if(isDone){dot.className='pm-tl-dot done';dot.textContent='\u2713';}
        else if(isActive){dot.className='pm-tl-dot active';dot.textContent='\u25b6';}
        else{dot.className='pm-tl-dot';dot.textContent='';}
      });`;

if (!src.includes(OLD)) { console.error('Anchor not found'); process.exit(1); }
src = src.replace(OLD, NEW);
fs.writeFileSync(FILE, src);
console.log('Done.');
