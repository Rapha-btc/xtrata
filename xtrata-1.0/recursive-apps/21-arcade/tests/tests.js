/* Test Suite for Retro Arcade */
var ArcadeTests = (function(){
  var results = [];
  var totalPass = 0, totalFail = 0;

  function log(name, passed, detail){
    results.push({name:name, passed:passed, detail:detail||''});
    if(passed) totalPass++; else totalFail++;
  }

  function getResults(){ return {results:results, pass:totalPass, fail:totalFail}; }

  /* Render results to DOM */
  function renderResults(containerId){
    var el = document.getElementById(containerId);
    var r = getResults();
    var html = '<h2>Test Results: ' + r.pass + ' passed, ' + r.fail + ' failed, ' + (r.pass+r.fail) + ' total</h2>';
    html += '<div style="margin:10px 0;padding:10px;background:' + (r.fail===0?'#0a2':'#a00') + ';color:#fff;font-size:18px;border-radius:4px;">';
    html += r.fail===0 ? 'ALL TESTS PASSED' : r.fail + ' TEST(S) FAILED';
    html += '</div>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr><th style="text-align:left;padding:4px;border-bottom:1px solid #444;">Test</th><th style="width:80px;border-bottom:1px solid #444;">Status</th><th style="text-align:left;padding:4px;border-bottom:1px solid #444;">Detail</th></tr>';
    r.results.forEach(function(t){
      var color = t.passed ? '#0f0' : '#f44';
      html += '<tr><td style="padding:4px;border-bottom:1px solid #222;">'+t.name+'</td>';
      html += '<td style="color:'+color+';text-align:center;border-bottom:1px solid #222;">'+(t.passed?'PASS':'FAIL')+'</td>';
      html += '<td style="padding:4px;color:#888;border-bottom:1px solid #222;font-size:12px;">'+t.detail+'</td></tr>';
    });
    html += '</table>';
    el.innerHTML = html;
  }

  /* ========== SMOKE TESTS ========== */
  async function smokeTestAllGames(){
    var games = window.ArcadeLauncher.getGames();
    for(var g = 0; g < games.length; g++){
      var game = games[g];
      for(var attempt = 0; attempt < 2; attempt++){
        var testName = 'Smoke: ' + game.title + ' (attempt ' + (attempt+1) + ')';
        try {
          /* Launch */
          window.ArcadeLauncher.launchGame(g);
          await TestUtils.wait(1500);
          /* Check it's running */
          var active = window.ArcadeLauncher.getActiveGame();
          TestUtils.assertTrue(active, 'Game should be active');
          /* Exit */
          window.ArcadeLauncher.exitGame();
          await TestUtils.wait(300);
          var afterExit = window.ArcadeLauncher.getActiveGame();
          TestUtils.assertFalse(afterExit, 'Game should be null after exit');
          log(testName, true, 'Launched and exited cleanly');
        } catch(e) {
          log(testName, false, e.message);
          /* Try to recover */
          try { window.ArcadeLauncher.exitGame(); } catch(ex){}
          await TestUtils.wait(200);
        }
      }
    }
  }

  /* ========== LIFECYCLE CLEANUP TESTS ========== */
  async function lifecycleCleanupTests(){
    var games = window.ArcadeLauncher.getGames();
    for(var g = 0; g < games.length; g++){
      var game = games[g];
      var testName = 'Lifecycle: ' + game.title;
      try {
        window.ArcadeLauncher.launchGame(g);
        await TestUtils.wait(800);
        /* Destroy */
        window.ArcadeLauncher.exitGame();
        await TestUtils.wait(500);
        /* Check no active game */
        var active = window.ArcadeLauncher.getActiveGame();
        TestUtils.assertFalse(active, 'No active game after exit');
        /* Check container is clean */
        var container = document.getElementById('game-container');
        TestUtils.assertTrue(container.style.display === 'none' || container.innerHTML === '', 'Container should be hidden or empty');
        log(testName, true, 'Cleanup verified');
      } catch(e) {
        log(testName, false, e.message);
        try { window.ArcadeLauncher.exitGame(); } catch(ex){}
        await TestUtils.wait(200);
      }
    }
  }

  /* ========== LEVEL PROGRESSION TESTS ========== */
  async function levelProgressionTests(){
    var games = window.ArcadeLauncher.getGames();
    for(var g = 0; g < games.length; g++){
      var game = games[g];
      if(!game.hasLevels) continue;
      var testName = 'Levels: ' + game.title;
      try {
        window.ArcadeLauncher.launchGame(g);
        await TestUtils.wait(500);
        var hooks = game.getTestHooks ? game.getTestHooks() : null;
        if(!hooks || !hooks.completeLevel){
          log(testName, true, 'No completeLevel hook, skipped');
          window.ArcadeLauncher.exitGame();
          await TestUtils.wait(200);
          continue;
        }
        var initialState = hooks.getState();
        var initialLevel = initialState.level;
        /* Complete 3 levels */
        for(var lvl = 0; lvl < 3; lvl++){
          hooks.completeLevel();
          await TestUtils.wait(400);
          var s = hooks.getState();
          /* If game ended (won), that's fine */
          if(s.gameOver) break;
        }
        var finalState = hooks.getState();
        /* Verify level progressed or game completed */
        TestUtils.assertTrue(
          finalState.level > initialLevel || finalState.gameOver,
          'Level should have progressed from ' + initialLevel + ' to ' + finalState.level
        );
        /* Verify exit still works */
        window.ArcadeLauncher.exitGame();
        await TestUtils.wait(300);
        var afterExit = window.ArcadeLauncher.getActiveGame();
        TestUtils.assertFalse(afterExit, 'Should exit cleanly after level progression');
        log(testName, true, 'Progressed from level ' + initialLevel + ' to ' + finalState.level + (finalState.gameOver ? ' (completed)' : ''));
      } catch(e) {
        log(testName, false, e.message);
        try { window.ArcadeLauncher.exitGame(); } catch(ex){}
        await TestUtils.wait(200);
      }
    }
  }

  /* ========== HIGH SCORE TESTS ========== */
  async function highScoreTests(){
    var gameId = 'test_hs_game';
    var mode = 'score';
    var boardState = {};
    var captured = null;

    function bkey(id, m){ return id + '_' + m; }
    function clone(list){
      return (list || []).map(function(item){
        return {
          rank: item.rank,
          name: item.name,
          score: item.score,
          updatedAt: item.updatedAt || 0,
          player: item.player || null
        };
      });
    }

    try {
      localStorage.removeItem('retro_arcade_scores');
      localStorage.removeItem('retro_arcade_personal_bests');
    } catch(e){}

    boardState[bkey(gameId, mode)] = clone([
      { rank: 1, name: 'AAA', score: 1000, player: 'P1' },
      { rank: 2, name: 'BBB', score: 800, player: 'P2' },
      { rank: 3, name: 'CCC', score: 700, player: 'P3' }
    ]);
    boardState[bkey('test_hs_time', 'time')] = clone([
      { rank: 1, name: 'FAST', score: 3000, player: 'T1' },
      { rank: 2, name: 'GOOD', score: 4500, player: 'T2' },
      { rank: 3, name: 'SLOW', score: 7000, player: 'T3' }
    ]);

    HighScores.configureOnChain({
      enabled: true,
      network: 'testnet',
      contractAddress: 'STTESTADDRESS0000000000000000000000000',
      contractName: 'xtrata-arcade-scores-v1-0',
      functionName: 'submit-score',
      leaderboardFunctionName: 'get-top10',
      minRank: 10
    });

    HighScores.setOnChainLeaderboardFetcher(function(payload){
      return Promise.resolve(clone(boardState[bkey(payload.gameId, payload.mode)] || []));
    });

    HighScores.setOnChainSubmitter(function(payload){
      captured = payload;
      var key = bkey(payload.gameId, payload.mode);
      var current = clone(boardState[key] || []);
      var i;
      for(i = current.length - 1; i >= 0; i--){
        if(current[i].player === 'SIM_PLAYER'){
          current.splice(i, 1);
        }
      }
      var insertAt = current.length;
      for(i = 0; i < current.length; i++){
        if(payload.mode === 'time'){
          if(payload.score < current[i].score){ insertAt = i; break; }
        } else {
          if(payload.score > current[i].score){ insertAt = i; break; }
        }
      }
      current.splice(insertAt, 0, {
        name: payload.playerName,
        score: payload.score,
        player: 'SIM_PLAYER'
      });
      current = current.slice(0, 10);
      for(i = 0; i < current.length; i++){ current[i].rank = i + 1; }
      boardState[key] = current;
      return Promise.resolve({ txId: '0xabc123' });
    });

    /* Test 1: Empty on-chain leaderboard */
    try {
      var empty = await HighScores.fetchTop10('empty_game', 'score', { force: true });
      TestUtils.assertEqual(empty.length, 0, 'Empty chain leaderboard should return []');
      log('HS: Empty on-chain leaderboard', true, 'Returns empty array');
    } catch(e) { log('HS: Empty on-chain leaderboard', false, e.message); }

    /* Test 2: Fetch ordering (score mode) */
    try {
      var top = await HighScores.fetchTop10(gameId, mode, { force: true });
      TestUtils.assertEqual(top.length, 3, 'Should fetch 3 score entries');
      TestUtils.assertTrue(top[0].score >= top[1].score, 'Score board should be descending');
      TestUtils.assertEqual(top[0].score, 1000, 'Top score should be 1000');
      log('HS: Score ordering', true, 'Top score from chain is ' + top[0].score);
    } catch(e) { log('HS: Score ordering', false, e.message); }

    /* Test 3: Fetch ordering (time mode) */
    try {
      var timeTop = await HighScores.fetchTop10('test_hs_time', 'time', { force: true });
      TestUtils.assertEqual(timeTop.length, 3, 'Should fetch 3 time entries');
      TestUtils.assertTrue(timeTop[0].score <= timeTop[1].score, 'Time board should be ascending');
      TestUtils.assertEqual(timeTop[0].score, 3000, 'Best time should be lowest');
      log('HS: Time ordering', true, 'Best time from chain is ' + timeTop[0].score);
    } catch(e) { log('HS: Time ordering', false, e.message); }

    /* Test 4: Qualification check uses chain board */
    try {
      var current = await HighScores.fetchTop10(gameId, mode, { force: true });
      var qualifies = HighScores._qualifies(gameId, mode, 900, current);
      var notQualifies = HighScores._qualifies(gameId, mode, 1, current);
      TestUtils.assertTrue(qualifies, '900 should qualify in current board');
      TestUtils.assertFalse(notQualifies, '1 should not qualify');
      log('HS: Qualification check', true, 'Qualification now based on chain board');
    } catch(e) { log('HS: Qualification check', false, e.message); }

    /* Test 5: Local storage keeps personal best only */
    try {
      HighScores._recordPersonalBest(gameId, mode, 500);
      HighScores._recordPersonalBest(gameId, mode, 400);
      HighScores._recordPersonalBest(gameId, mode, 700);
      var best = HighScores.getBest(gameId, mode);
      TestUtils.assertEqual(best, 700, 'Personal best should keep improved score only');
      var pbRaw = localStorage.getItem('retro_arcade_personal_bests');
      TestUtils.assertTrue(!!pbRaw, 'PB key should exist');
      var legacyRaw = localStorage.getItem('retro_arcade_scores');
      TestUtils.assertFalse(!!legacyRaw, 'Legacy local leaderboard key should not be used');
      log('HS: Personal best storage', true, 'PB stored locally, leaderboard not local');
    } catch(e) { log('HS: Personal best storage', false, e.message); }

    /* Test 6: On-chain submission bridge + board update */
    try {
      var submitResult = await HighScores.submitOnChainScore({
        gameId: gameId,
        mode: 'score',
        score: 1200,
        playerName: 'TST',
        rank: 1
      });
      TestUtils.assertTrue(!!captured, 'Submitter should receive payload');
      TestUtils.assertEqual(captured.contractName, 'xtrata-arcade-scores-v1-0', 'Contract name should pass through');
      TestUtils.assertEqual(submitResult.txId, '0xabc123', 'submitOnChainScore should return tx id');

      var refreshed = await HighScores.fetchTop10(gameId, mode, { force: true });
      TestUtils.assertEqual(refreshed[0].score, 1200, 'Refreshed chain board should include verified score');
      log('HS: On-chain bridge', true, 'Submitter payload and refresh verified');
    } catch(e) { log('HS: On-chain bridge', false, e.message); }

    HighScores.setOnChainSubmitter(null);
    HighScores.setOnChainLeaderboardFetcher(null);
    HighScores.configureOnChain({
      enabled: true,
      contractAddress: '',
      contractName: 'xtrata-arcade-scores-v1-0',
      functionName: 'submit-score',
      leaderboardFunctionName: 'get-top10',
      network: 'mainnet',
      apiBaseUrl: 'https://api.mainnet.hiro.so',
      readSenderAddress: '',
      minRank: 10
    });

    try {
      localStorage.removeItem('retro_arcade_personal_bests');
    } catch(e){}
  }

  /* ========== RUN ALL ========== */
  async function runAll(){
    results = []; totalPass = 0; totalFail = 0;
    document.getElementById('test-output').innerHTML = '<p style="color:#0ff;">Running tests... please wait.</p>';

    await highScoreTests();
    await smokeTestAllGames();
    await lifecycleCleanupTests();
    await levelProgressionTests();

    renderResults('test-output');
  }

  return { runAll: runAll, getResults: getResults };
})();
