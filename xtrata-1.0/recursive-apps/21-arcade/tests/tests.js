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

    /* Test 4: Qualification with open slots (less than top 10 filled) */
    try {
      var current = await HighScores.fetchTop10(gameId, mode, { force: true });
      var qualifiesStrong = HighScores._qualifies(gameId, mode, 900, current);
      var qualifiesWeak = HighScores._qualifies(gameId, mode, 1, current);
      TestUtils.assertTrue(qualifiesStrong, '900 should qualify in current board');
      TestUtils.assertTrue(qualifiesWeak, 'Any positive score should qualify while fewer than 10 slots are filled');
      log('HS: Qualification with open slots', true, 'Open slots allow rank insertion up to #10');
    } catch(e) { log('HS: Qualification with open slots', false, e.message); }

    /* Test 4b: Placeholder/invalid rows must not block open-slot ranking */
    try {
      var malformedBoard = [
        { rank: 1, name: 'AAA', score: 1000, player: 'P1' },
        { rank: 2, name: 'BBB', score: 800, player: 'P2' },
        { rank: 3, name: '', score: 0, player: null },
        { rank: 4, name: '', score: 0, player: null },
        { rank: 5, name: '', score: 0, player: null },
        { rank: 6, name: '', score: 0, player: null },
        { rank: 7, name: '', score: 0, player: null },
        { rank: 8, name: '', score: 0, player: null },
        { rank: 9, name: '', score: 0, player: null },
        { rank: 10, name: '', score: 0, player: null }
      ];
      var malformedRank = HighScores._computeInsertRank(malformedBoard, mode, 1);
      TestUtils.assertEqual(malformedRank, 3, 'Malformed placeholder rows should collapse and allow rank #3');
      TestUtils.assertTrue(HighScores._qualifies(gameId, mode, 1, malformedBoard), 'Score should qualify when only 2 valid rows exist');
      log('HS: Placeholder rows do not block ranking', true, 'Invalid/zero rows are ignored before rank calculation');
    } catch(e) { log('HS: Placeholder rows do not block ranking', false, e.message); }

    /* Test 5: Qualification threshold at rank #10 when board is full */
    try {
      boardState[bkey(gameId, mode)] = clone([
        { rank: 1, name: 'A1', score: 1000, player: 'P1' },
        { rank: 2, name: 'A2', score: 900, player: 'P2' },
        { rank: 3, name: 'A3', score: 800, player: 'P3' },
        { rank: 4, name: 'A4', score: 700, player: 'P4' },
        { rank: 5, name: 'A5', score: 600, player: 'P5' },
        { rank: 6, name: 'A6', score: 500, player: 'P6' },
        { rank: 7, name: 'A7', score: 400, player: 'P7' },
        { rank: 8, name: 'A8', score: 300, player: 'P8' },
        { rank: 9, name: 'A9', score: 200, player: 'P9' },
        { rank: 10, name: 'A10', score: 100, player: 'P10' }
      ]);
      var fullScoreBoard = await HighScores.fetchTop10(gameId, mode, { force: true });
      TestUtils.assertEqual(fullScoreBoard.length, 10, 'Full score board should have 10 entries');
      TestUtils.assertTrue(HighScores._qualifies(gameId, mode, 101, fullScoreBoard), '101 should qualify above current #10');
      TestUtils.assertFalse(HighScores._qualifies(gameId, mode, 100, fullScoreBoard), '100 should not qualify when equal to #10');
      TestUtils.assertFalse(HighScores._qualifies(gameId, mode, 99, fullScoreBoard), '99 should not qualify below #10');

      var fullTimeBoardInput = [
        { rank: 1, name: 'T1', score: 100, player: 'T1' },
        { rank: 2, name: 'T2', score: 200, player: 'T2' },
        { rank: 3, name: 'T3', score: 300, player: 'T3' },
        { rank: 4, name: 'T4', score: 400, player: 'T4' },
        { rank: 5, name: 'T5', score: 500, player: 'T5' },
        { rank: 6, name: 'T6', score: 600, player: 'T6' },
        { rank: 7, name: 'T7', score: 700, player: 'T7' },
        { rank: 8, name: 'T8', score: 800, player: 'T8' },
        { rank: 9, name: 'T9', score: 900, player: 'T9' },
        { rank: 10, name: 'T10', score: 1000, player: 'T10' }
      ];
      TestUtils.assertTrue(HighScores._qualifies('full_time_game', 'time', 999, fullTimeBoardInput), '999 should qualify above current #10 time');
      TestUtils.assertFalse(HighScores._qualifies('full_time_game', 'time', 1000, fullTimeBoardInput), '1000 should not qualify when equal to #10 time');
      TestUtils.assertFalse(HighScores._qualifies('full_time_game', 'time', 1200, fullTimeBoardInput), '1200 should not qualify below #10 time');
      log('HS: Qualification threshold at #10', true, 'Threshold follows rank #10 when board is full');
    } catch(e) { log('HS: Qualification threshold at #10', false, e.message); }

    /* Test 6: On-chain offer rank gate is top 10 */
    try {
      HighScores.configureOnChain({
        enabled: true,
        network: 'testnet',
        contractAddress: 'STTESTADDRESS0000000000000000000000000',
        contractName: 'xtrata-arcade-scores-v1-3',
        functionName: 'submit-score',
        leaderboardFunctionName: 'get-top10',
        minRank: 1
      });
      TestUtils.assertTrue(HighScores._shouldOfferOnChain(1), '#1 should be offerable');
      TestUtils.assertTrue(HighScores._shouldOfferOnChain(3), '#3 should be offerable');
      TestUtils.assertTrue(HighScores._shouldOfferOnChain(10), '#10 should be offerable');
      TestUtils.assertFalse(HighScores._shouldOfferOnChain(11), '#11 should not be offerable');
      log('HS: On-chain offer top10 gate', true, 'Offer gate is rank 1..10');
    } catch(e) { log('HS: On-chain offer top10 gate', false, e.message); }

    /* Test 7: Local storage keeps personal best only */
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

    /* Test 8: On-chain submission bridge + board update */
    try {
      HighScores.configureOnChain({
        enabled: true,
        network: 'testnet',
        contractAddress: 'STTESTADDRESS0000000000000000000000000',
        contractName: 'xtrata-arcade-scores-v1-0',
        functionName: 'submit-score',
        leaderboardFunctionName: 'get-top10',
        minRank: 10,
        useDenyModePostConditions: true,
        fallbackToAllowModeOnPostConditionFailure: false
      });
      var submitResult = await HighScores.submitOnChainScore({
        gameId: gameId,
        mode: 'score',
        score: 1200,
        playerName: 'TST',
        rank: 1
      });
      TestUtils.assertTrue(!!captured, 'Submitter should receive payload');
      TestUtils.assertEqual(captured.contractName, 'xtrata-arcade-scores-v1-0', 'Contract name should pass through');
      TestUtils.assertTrue(captured.useDenyModePostConditions === true, 'Deny-mode post-condition config should pass through');
      TestUtils.assertTrue(captured.fallbackToAllowModeOnPostConditionFailure === false, 'Strict post-condition fallback flag should pass through');
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
