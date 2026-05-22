const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const candles=raw.map(c=>{
  const utc=new Date(c.date);
  const ist=new Date(utc.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const date=ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0');
  return{date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);
const today=candles.filter(c=>c.date==='2026-05-20');
today.forEach((c,i)=>console.log('C'+(i+1)+' '+c.h+':'+String(c.m).padStart(2,'0')+' O='+c.open+' H='+c.high+' L='+c.low+' C='+c.close+' '+(c.close>=c.open?'BULL':'BEAR')));
