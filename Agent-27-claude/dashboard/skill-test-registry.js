const fs = require('fs');
const path = require('path');
const { SKILLS_DIR, SKILL_TEST_SCENARIOS_DIR } = require('./config');

function resolveSkillDocPath(skillId) {
  const topLevelFile = path.join(SKILLS_DIR, `${skillId}.md`);
  if (fs.existsSync(topLevelFile)) return topLevelFile;

  const skillDir = path.join(SKILLS_DIR, skillId);
  if (!fs.existsSync(skillDir)) {
    throw new Error(`Unknown skill location for ${skillId}`);
  }

  const canonical = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(canonical)) return canonical;

  const matches = fs.readdirSync(skillDir)
    .filter((file) => /SKILL\.md$/i.test(file))
    .sort();

  if (matches.length === 0) {
    throw new Error(`No skill markdown found for ${skillId}`);
  }

  return path.join(skillDir, matches[0]);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};

  const lines = match[1].split('\n');
  const data = {};
  let currentKey = null;

  for (const line of lines) {
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, value] = keyMatch;
      currentKey = key;
      if (value === '>' || value === '|') {
        data[key] = '';
      } else {
        data[key] = value.trim().replace(/^['"]|['"]$/g, '');
      }
      continue;
    }

    if (currentKey && /^\s+/.test(line)) {
      data[currentKey] = `${data[currentKey] || ''} ${line.trim()}`.trim();
    }
  }

  return data;
}

function readSkillDocument(skillId) {
  const skillPath = resolveSkillDocPath(skillId);
  const raw = fs.readFileSync(skillPath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const titleMatch = raw.match(/^#\s+(.+)$/m);

  return {
    id: skillId,
    path: skillPath,
    relativePath: path.relative(process.cwd(), skillPath),
    raw,
    frontmatter,
    title: titleMatch ? titleMatch[1].trim() : skillId
  };
}

function listSkillIds() {
  try {
    const entries = fs.readdirSync(SKILLS_DIR);
    const ids = [];

    for (const entry of entries) {
      if (entry === 'testing') continue;

      const absolute = path.join(SKILLS_DIR, entry);
      const stat = fs.statSync(absolute);

      if (stat.isDirectory()) {
        try {
          if (fs.existsSync(resolveSkillDocPath(entry))) ids.push(entry);
        } catch {
          // ignore invalid skill dir
        }
        continue;
      }

      if (stat.isFile() && /^skill-.*\.md$/i.test(entry)) {
        ids.push(entry.replace(/\.md$/i, ''));
      }
    }

    return ids.sort();
  } catch {
    return [];
  }
}

function loadScenarioConfig(skillId) {
  const filePath = path.join(SKILL_TEST_SCENARIOS_DIR, `${skillId}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listSkillTests() {
  return listSkillIds().map((skillId) => {
    const skill = readSkillDocument(skillId);
    const scenarios = loadScenarioConfig(skillId);
    return {
      id: skillId,
      title: skill.title,
      description: skill.frontmatter.description || '',
      path: skill.relativePath,
      scenarioCount: scenarios?.scenarios?.length || 0,
      scenarios: (scenarios?.scenarios || []).map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        summary: scenario.summary,
        mode: scenario.mode || scenarios.defaultMode || 'dry-run',
        instructions: scenario.instructions || [],
        deliverables: scenario.deliverables || [],
        assertions: (scenario.assertions || []).map((assertion) => ({
          id: assertion.id,
          label: assertion.label,
          severity: assertion.severity || 'important'
        }))
      })),
      defaults: {
        mode: scenarios?.defaultMode || 'dry-run',
        model: scenarios?.defaultModel || 'sonnet',
        budget: scenarios?.defaultBudget || 0.5
      }
    };
  });
}

function getSkillTest(skillId) {
  const skill = readSkillDocument(skillId);
  const scenarioConfig = loadScenarioConfig(skillId);

  return {
    id: skillId,
    title: skill.title,
    description: skill.frontmatter.description || '',
    path: skill.path,
    relativePath: skill.relativePath,
    raw: skill.raw,
    scenarioConfig
  };
}

function getScenario(skillId, scenarioId) {
  const config = loadScenarioConfig(skillId);
  if (!config) return null;
  return config.scenarios.find((scenario) => scenario.id === scenarioId) || null;
}

function patternMatches(text, pattern) {
  if (!pattern) return false;
  try {
    return new RegExp(pattern, 'i').test(text);
  } catch {
    return String(text).toLowerCase().includes(String(pattern).toLowerCase());
  }
}

function evaluateAssertion(text, assertion) {
  const requiredAll = assertion.requiredAll || [];
  const requiredAny = assertion.requiredAny || [];
  const forbiddenAny = assertion.forbiddenAny || [];

  const missingAll = requiredAll.filter((pattern) => !patternMatches(text, pattern));
  const anySatisfied = requiredAny.length === 0 || requiredAny.some((pattern) => patternMatches(text, pattern));
  const forbiddenHits = forbiddenAny.filter((pattern) => patternMatches(text, pattern));
  const passed = missingAll.length === 0 && anySatisfied && forbiddenHits.length === 0;

  let detail = 'Matched.';
  if (!passed) {
    const parts = [];
    if (missingAll.length > 0) parts.push(`missing all-of: ${missingAll.join(', ')}`);
    if (!anySatisfied && requiredAny.length > 0) parts.push(`missing any-of: ${requiredAny.join(', ')}`);
    if (forbiddenHits.length > 0) parts.push(`forbidden matches: ${forbiddenHits.join(', ')}`);
    detail = parts.join(' | ');
  }

  return {
    id: assertion.id,
    label: assertion.label,
    severity: assertion.severity || 'important',
    passed,
    detail
  };
}

function scoreScenarioOutput(skillId, scenarioId, text) {
  const scenario = getScenario(skillId, scenarioId);
  if (!scenario) {
    return {
      verdict: 'FAIL',
      summary: 'No scenario configuration found.',
      assertions: []
    };
  }

  const assertions = (scenario.assertions || []).map((assertion) => evaluateAssertion(text, assertion));
  const criticalFailed = assertions.filter((item) => item.severity === 'critical' && !item.passed);
  const importantFailed = assertions.filter((item) => item.severity === 'important' && !item.passed);
  const minorFailed = assertions.filter((item) => item.severity === 'minor' && !item.passed);

  let verdict = 'PASS';
  if (criticalFailed.length > 0) verdict = 'FAIL';
  else if (importantFailed.length > 0) verdict = 'PARTIAL';

  const summaryParts = [
    `${assertions.filter((item) => item.passed).length}/${assertions.length} assertions passed`
  ];
  if (criticalFailed.length > 0) summaryParts.push(`${criticalFailed.length} critical failures`);
  if (importantFailed.length > 0) summaryParts.push(`${importantFailed.length} important gaps`);
  if (minorFailed.length > 0) summaryParts.push(`${minorFailed.length} minor gaps`);

  return {
    verdict,
    summary: summaryParts.join(' | '),
    assertions
  };
}

module.exports = {
  listSkillTests,
  getSkillTest,
  getScenario,
  scoreScenarioOutput
};
