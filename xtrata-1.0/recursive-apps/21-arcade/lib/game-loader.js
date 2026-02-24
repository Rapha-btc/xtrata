/* Arcade game loader: resolves latest available game version per slot. */
(function(){
  var DEFAULT_MAIN_SCRIPT = 'main.js?v=wallet-debug-2026-02-20-12';
  var FALLBACK_GAME_SCRIPTS = [
    'games/game01_astro_blaster.js',
    'games/game02_neon_runner.js',
    'games/game03_block_drop.js',
    'games/game04_maze_escape.js',
    'games/game05_paddle_punk.js',
    'games/game06_meteor_miner.js',
    'games/game07_sky_racer.js',
    'games/game08_laser_defender.js',
    'games/game09_snakebyte.js',
    'games/game10_cipher_quest.js',
    'games/game11_memory_matrix.js',
    'games/game12_tile_flip.js',
    'games/game13_robot_sokoban.js',
    'games/game14_bubble_pop.js',
    'games/game15_stealth_grid.js',
    'games/game16_platform_micro.js',
    'games/game17_typing_invaders.js',
    'games/game18_fishing_byte.js',
    'games/game19_duel_at_dawn.js',
    'games/game20_circuit_builder.js',
    'games/game21_boss_rush_mini.js'
  ];

  var GAME_FILE_RE = /^(game\d{2}_[a-z0-9_]+?)(?:-v([a-z0-9][a-z0-9._-]*))?\.js$/i;
  var loadedScripts = {};

  function log(level, message, detail){
    if(typeof console === 'undefined') return;
    var fn = console[level];
    if(typeof fn !== 'function') fn = console.log;
    if(typeof detail === 'undefined'){
      fn.call(console, '[ArcadeLoader] ' + message);
    } else {
      fn.call(console, '[ArcadeLoader] ' + message, detail);
    }
  }

  function loadScript(src){
    if(loadedScripts[src]){
      return Promise.resolve(src);
    }

    return new Promise(function(resolve, reject){
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = function(){
        loadedScripts[src] = true;
        resolve(src);
      };
      script.onerror = function(){ reject(new Error('Failed to load script: ' + src)); };
      document.body.appendChild(script);
    });
  }

  function tokenizeVersion(versionRaw){
    if(!versionRaw) return [];
    return String(versionRaw)
      .split(/[._-]+/)
      .filter(Boolean)
      .map(function(token){
        return /^\d+$/.test(token) ? Number(token) : token.toLowerCase();
      });
  }

  function compareToken(a, b){
    var aIsNum = typeof a === 'number';
    var bIsNum = typeof b === 'number';

    if(aIsNum && bIsNum){
      if(a === b) return 0;
      return a > b ? 1 : -1;
    }
    if(aIsNum !== bIsNum){
      return aIsNum ? 1 : -1;
    }

    var cmp = String(a).localeCompare(String(b));
    if(cmp === 0) return 0;
    return cmp > 0 ? 1 : -1;
  }

  function compareVersion(a, b){
    if(!a && !b) return 0;
    if(!a) return -1;
    if(!b) return 1;

    var ta = tokenizeVersion(a);
    var tb = tokenizeVersion(b);
    var maxLen = Math.max(ta.length, tb.length);
    var i;

    for(i = 0; i < maxLen; i += 1){
      if(typeof ta[i] === 'undefined' && typeof tb[i] === 'undefined') return 0;
      if(typeof ta[i] === 'undefined') return -1;
      if(typeof tb[i] === 'undefined') return 1;
      var cmp = compareToken(ta[i], tb[i]);
      if(cmp !== 0) return cmp;
    }

    return 0;
  }

  function parseGameScriptPath(pathValue){
    if(typeof pathValue !== 'string') return null;
    var cleaned = pathValue.trim();
    if(!cleaned) return null;

    var noQuery = cleaned.split('?')[0];
    var fileName = noQuery.split('/').pop();
    if(!fileName) return null;

    var match = fileName.match(GAME_FILE_RE);
    if(!match) return null;

    return {
      script: cleaned,
      fileName: fileName,
      gameId: match[1],
      version: match[2] || null,
      slot: Number(match[1].slice(4, 6))
    };
  }

  function pickLatestByGameId(parsedScripts){
    var byGameId = {};
    var i;

    for(i = 0; i < parsedScripts.length; i += 1){
      var entry = parsedScripts[i];
      if(!entry) continue;

      var existing = byGameId[entry.gameId];
      if(!existing){
        byGameId[entry.gameId] = entry;
        continue;
      }

      var cmp = compareVersion(entry.version, existing.version);
      if(cmp > 0){
        byGameId[entry.gameId] = entry;
      } else if(cmp === 0 && entry.script.localeCompare(existing.script) > 0){
        byGameId[entry.gameId] = entry;
      }
    }

    return Object.keys(byGameId)
      .map(function(gameId){ return byGameId[gameId]; })
      .sort(function(a, b){ return a.slot - b.slot; })
      .map(function(entry){ return entry.script; });
  }

  function resolveFromManifest(){
    var manifest = window.ARCADE_GAME_SCRIPT_MANIFEST;
    if(!manifest) return null;

    if(Array.isArray(manifest.scripts) && manifest.scripts.length > 0){
      return {
        scripts: manifest.scripts.slice(),
        mainScript: manifest.mainScript || window.ARCADE_MAIN_SCRIPT || DEFAULT_MAIN_SCRIPT,
        source: 'manifest'
      };
    }

    if(Array.isArray(manifest.games) && manifest.games.length > 0){
      var scripts = manifest.games
        .map(function(entry){
          if(entry && typeof entry.script === 'string') return entry.script;
          if(entry && typeof entry.file === 'string') return 'games/' + entry.file;
          return null;
        })
        .filter(Boolean);

      if(scripts.length > 0){
        return {
          scripts: scripts,
          mainScript: manifest.mainScript || window.ARCADE_MAIN_SCRIPT || DEFAULT_MAIN_SCRIPT,
          source: 'manifest-games'
        };
      }
    }

    return null;
  }

  function resolveFromDirectoryListing(){
    if(typeof fetch !== 'function'){
      return Promise.resolve(null);
    }

    return fetch('games/?_=' + Date.now(), { cache: 'no-store' })
      .then(function(response){
        if(!response.ok) return null;
        return response.text();
      })
      .then(function(html){
        if(!html || typeof html !== 'string') return null;

        var regex = /href=["']([^"']*game\d{2}_[a-z0-9_]+(?:-v[a-z0-9._-]+)?\.js(?:\?[^"']*)?)["']/ig;
        var match;
        var parsed = [];

        while((match = regex.exec(html)) !== null){
          var href = match[1] || '';
          var normalized = href;
          if(normalized.indexOf('games/') < 0){
            normalized = normalized.replace(/^\.\//, '');
            normalized = normalized.replace(/^\//, '');
            normalized = 'games/' + normalized;
          }
          parsed.push(parseGameScriptPath(normalized));
        }

        var scripts = pickLatestByGameId(parsed);
        if(scripts.length === 0) return null;

        return {
          scripts: scripts,
          mainScript: window.ARCADE_MAIN_SCRIPT || DEFAULT_MAIN_SCRIPT,
          source: 'directory-listing'
        };
      })
      .catch(function(){
        return null;
      });
  }

  function resolveFallback(){
    return {
      scripts: FALLBACK_GAME_SCRIPTS.slice(),
      mainScript: window.ARCADE_MAIN_SCRIPT || DEFAULT_MAIN_SCRIPT,
      source: 'fallback'
    };
  }

  function loadSequentially(scripts){
    var sequence = Promise.resolve();
    scripts.forEach(function(scriptSrc){
      sequence = sequence.then(function(){ return loadScript(scriptSrc); });
    });
    return sequence;
  }

  function loadFromResolution(resolved){
    log('info', 'Loading game scripts', resolved);
    return loadSequentially(resolved.scripts.concat([resolved.mainScript]));
  }

  function bootstrap(){
    var fromManifest = resolveFromManifest();
    if(fromManifest){
      return loadFromResolution(fromManifest).catch(function(error){
        log('warn', 'Manifest load failed, retrying via discovery fallback', error);
        return resolveFromDirectoryListing().then(function(discovered){
          return loadFromResolution(discovered || resolveFallback());
        });
      });
    }

    return resolveFromDirectoryListing().then(function(discovered){
      return loadFromResolution(discovered || resolveFallback());
    });
  }

  bootstrap().catch(function(error){
    log('error', 'Game loader failed', error);
  });
})();
