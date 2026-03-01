// dashboard/watcher.js
const chokidar = require('chokidar');
const path = require('path');
const markdown = require('./markdown');

const WATCHED_FILES = [
  'research-buffer.md',
  'ledger.md',
  'future-inscription-ideas.md',
  'AGENTs.md',
  'EVOLUTION.md'
];

// Map filename to its parser
const PARSERS = {
  'research-buffer.md': () => ({ type: 'research', data: markdown.parseResearchBuffer() }),
  'ledger.md': () => ({ type: 'ledger', data: markdown.parseLedger() }),
  'future-inscription-ideas.md': () => ({ type: 'ideas', data: markdown.parseIdeas() }),
  'AGENTs.md': () => ({ type: 'agents', data: markdown.parseAgents() }),
  'EVOLUTION.md': () => ({ type: 'evolution', data: markdown.parseEvolution() })
};

let watcher = null;

function initWatcher(workdir, broadcast) {
  const paths = WATCHED_FILES.map((f) => path.join(workdir, f));

  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  });

  watcher.on('change', (filePath) => {
    const basename = path.basename(filePath);
    console.log(`File changed: ${basename}`);

    const parser = PARSERS[basename];
    if (parser) {
      try {
        const result = parser();
        broadcast({
          event: 'file-change',
          data: { file: basename, ...result }
        });
      } catch (err) {
        console.error(`Error re-parsing ${basename}:`, err.message);
      }
    }
  });

  console.log('File watcher started for:', WATCHED_FILES.join(', '));
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('File watcher stopped');
  }
}

module.exports = { initWatcher, stopWatcher };
