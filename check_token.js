require('dotenv').config({path:'/home/ubuntu/trading-bot/.env'});
const https=require('https');
const r=https.request({hostname:'api.kite.trade',path:'/user/profile',headers:{'X-Kite-Version':'3','Authorization':'token '+process.env.API_KEY+':'+process.env.ACCESS_TOKEN}},res=>{
  let d=''; res.on('data',c=>d+=c);
  res.on('end',()=>{
    const j=JSON.parse(d);
    if(j.data) console.log('Token VALID — user:',j.data.user_name);
    else console.log('Token INVALID:',j.message);
  });
});
r.end();
