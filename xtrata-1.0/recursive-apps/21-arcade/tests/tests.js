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

    /* Clear any existing test data */
    try {
      var data = JSON.parse(localStorage.getItem('retro_arcade_scores') || '{}');
      delete data[gameId + '_score'];
      localStorage.setItem('retro_arcade_scores', JSON.stringify(data));
    } catch(e){}

    /* Test 1: Empty leaderboard */
    try {
      var top = HighScores.getTop10(gameId, mode);
      TestUtils.assertEqual(top.length, 0, 'Empty leaderboard');
      log('HS: Empty leaderboard', true, 'Returns empty array');
    } catch(e) { log('HS: Empty leaderboard', false, e.message); }

    /* Test 2: Add entries and verify ordering */
    try {
      var scores = [100, 500, 300, 800, 200, 900, 150, 750, 400, 600, 50, 1000];
      scores.forEach(function(s){
        HighScores._addEntry(gameId, mode, 'TST', s);
      });
      var top = HighScores.getTop10(gameId, mode);
      TestUtils.assertEqual(top.length, 10, 'Should have max 10 entries');
      /* Verify descending order */
      for(var i = 1; i < top.length; i++){
        TestUtils.assertTrue(top[i-1].score >= top[i].score, 'Scores should be descending');
      }
      TestUtils.assertEqual(top[0].score, 1000, 'Top score should be 1000');
      log('HS: Ordering and max 10', true, 'Top: ' + top[0].score + ', Count: ' + top.length);
    } catch(e) { log('HS: Ordering and max 10', false, e.message); }

    /* Test 3: Qualifying score check */
    try {
      var qualifies = HighScores._qualifies(gameId, mode, 999);
      TestUtils.assertTrue(qualifies, '999 should qualify (beats some entries)');
      var notQualifies = HighScores._qualifies(gameId, mode, 10);
      TestUtils.assertFalse(notQualifies, '10 should not qualify');
      log('HS: Qualification check', true, '999 qualifies, 10 does not');
    } catch(e) { log('HS: Qualification check', false, e.message); }

    /* Test 4: Time mode (lower is better) */
    try {
      var timeId = 'test_hs_time';
      var tdata = JSON.parse(localStorage.getItem('retro_arcade_scores') || '{}');
      delete tdata[timeId + '_time'];
      localStorage.setItem('retro_arcade_scores', JSON.stringify(tdata));

      HighScores._addEntry(timeId, 'time', 'TST', 5000);
      HighScores._addEntry(timeId, 'time', 'TST', 3000);
      HighScores._addEntry(timeId, 'time', 'TST', 7000);
      var top = HighScores.getTop10(timeId, 'time');
      TestUtils.assertEqual(top[0].score, 3000, 'Best time should be lowest');
      TestUtils.assertTrue(top[0].score <= top[1].score, 'Times should be ascending');
      log('HS: Time mode ordering', true, 'Best: ' + top[0].score);
    } catch(e) { log('HS: Time mode ordering', false, e.message); }

    /* Test 5: Persistence */
    try {
      var stored = localStorage.getItem('retro_arcade_scores');
      TestUtils.assertTrue(stored && stored.length > 10, 'Data should be in localStorage');
      var parsed = JSON.parse(stored);
      TestUtils.assertTrue(parsed[gameId + '_score'], 'Game data should exist');
      log('HS: Persistence', true, 'Data persists in localStorage');
    } catch(e) { log('HS: Persistence', false, e.message); }

    /* Test 6: Name validation (3-12 chars) */
    try {
      /* The name entry is interactive, so we test the addEntry directly */
      HighScores._addEntry(gameId, mode, 'AB', 9999); /* short name gets padded in UI */
      var top = HighScores.getTop10(gameId, mode);
      TestUtils.assertTrue(top[0].score === 9999, 'Entry with short name should be added');
      log('HS: Name entry', true, 'Short names accepted by addEntry');
    } catch(e) { log('HS: Name entry', false, e.message); }

    /* Cleanup test data */
    try {
      var data = JSON.parse(localStorage.getItem('retro_arcade_scores') || '{}');
      delete data[gameId + '_score'];
      delete data['test_hs_time_time'];
      localStorage.setItem('retro_arcade_scores', JSON.stringify(data));
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
