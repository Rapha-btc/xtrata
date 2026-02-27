// dashboard/markdown.js
const fs = require('fs');
const path = require('path');

const WORKDIR = path.resolve(__dirname, '..');

// --- Helper Functions ---

function parseMarkdownTable(markdown, sectionHeader) {
  try {
    const sectionIdx = markdown.indexOf(`## ${sectionHeader}`);
    if (sectionIdx === -1) return [];
    
    const tableSlice = markdown.slice(sectionIdx);
    const lines = tableSlice.split(/\\r?\\n/);
    
    let inTable = false;
    let headers = null;
    const rows = [];

    for (const line of lines) {
      if (line.trim().startsWith('|')) {
        const cells = line.trim().split('|').slice(1, -1).map(c => c.trim());
        if (!inTable && cells.length > 0 && !line.includes('---')) {
          headers = cells;
          inTable = true;
        } else if (inTable && !line.includes('---')) {
          if (cells.length === headers.length) {
            let row = {};
            headers.forEach((h, i) => row[h.toLowerCase()] = cells[i]);
            rows.push(row);
          }
        }
      } else if (inTable) {
        break; // End of table
      }
    }
    return rows;
  } catch (e) {
    console.error(`Error parsing table "${sectionHeader}":`, e);
    return [];
  }
}

// --- Parsers ---

function parseResearchBuffer() {
  try {
    const raw = fs.readFileSync(path.join(WORKDIR, 'research-buffer.md'), 'utf8');
    const pulses = [];
    const sections = raw.split('## Pulse');
    
    for (let i = 1; i < sections.length; i++) {
        const content = sections[i];
        const headerMatch = content.match(/^ (\d+) — (.*)/m);
        if (!headerMatch) continue;

        pulses.push({
            pulseNumber: headerMatch[1],
            timestamp: headerMatch[2].trim(),
            content: content
        });
    }
    return { pulses: pulses.reverse(), raw }; // Newest first
  } catch (e) {
    if (e.code === 'ENOENT') return { pulses: [], raw: 'research-buffer.md not found.' };
    return { pulses: [], raw: `Error reading research-buffer.md: ${e.message}` };
  }
}

function parseLedger() {
  try {
    const raw = fs.readFileSync(path.join(WORKDIR, 'ledger.md'), 'utf8');
    return {
      onChainCosts: parseMarkdownTable(raw, 'On-Chain Costs (STX)'),
      computeCosts: parseMarkdownTable(raw, 'Compute Costs (Claude Pro Allocation)'),
      runningTotals: parseMarkdownTable(raw, 'Running Totals'),
      raw
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { onChainCosts: [], computeCosts: [], runningTotals: [], raw: 'ledger.md not found.' };
    return { onChainCosts: [], computeCosts: [], runningTotals: [], raw: `Error reading ledger.md: ${e.message}` };
  }
}

function parseIdeas() {
    try {
        const raw = fs.readFileSync(path.join(WORKDIR, 'future-inscription-ideas.md'), 'utf8');
        // Simple raw content for now
        return { raw };
    } catch (e) {
        if (e.code === 'ENOENT') return { raw: 'future-inscription-ideas.md not found.'};
        return { raw: `Error reading future-inscription-ideas.md: ${e.message}`};
    }
}

function parseAgents() {
    try {
        const raw = fs.readFileSync(path.join(WORKDIR, 'AGENTs.md'), 'utf8');
        return {
            journalLog: parseMarkdownTable(raw, 'Journal Log'),
            raw
        };
    } catch(e) {
        if (e.code === 'ENOENT') return { journalLog: [], raw: 'AGENTs.md not found.' };
        return { journalLog: [], raw: `Error reading AGENTs.md: ${e.message}` };
    }
}

module.exports = {
    parseResearchBuffer,
    parseLedger,
    parseIdeas,
    parseAgents
};
