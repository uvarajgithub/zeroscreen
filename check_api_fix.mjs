import http from 'http';
http.get('http://localhost:4000/api/bot/status', (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const j = JSON.parse(d);
    console.log('today.pnl=', j.today?.pnl, 'today.pnlRs=', j.today?.pnlRs);
    console.log('weekly.pnlRs=', j.weekly?.pnlRs);
    console.log('todayTrades count=', j.todayTrades?.length ?? 'MISSING');
  });
});
