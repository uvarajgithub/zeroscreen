#!/usr/bin/env node
const sqlite3=require('better-sqlite3');
const db=sqlite3('/root/zeroscreen/sessions.db');
const rows=db.prepare("SELECT sid,sess FROM sessions ORDER BY expired DESC LIMIT 5").all();
rows.forEach(r=>{
  try{
    const s=JSON.parse(r.sess);
    if(s.userRole==='admin'||s.userId){
      console.log('SID:', r.sid.substring(0,40));
      console.log('  role:', s.userRole, 'uid:', s.userId);
    }
  }catch(e){}
});
