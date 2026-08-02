fetch("http://127.0.0.1:4000/api/tradeops/status")
  .then((r) => r.json())
  .then((j) => {
    console.log(JSON.stringify({
      ok: j.ok,
      mode: j.modeControl && j.modeControl.runningMode,
      pnl: j.today && j.today.pnl,
      realized: j.today && j.today.realized,
      source: j.today && j.today.source,
      tradeRows: j.trades && j.trades.length,
      historyRows: j.historyTrades && j.historyTrades.length,
      candles: j.candles && j.candles.length,
      execution: j.execution && j.execution.status,
      blockReason: j.execution && j.execution.blockReason,
    }, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
