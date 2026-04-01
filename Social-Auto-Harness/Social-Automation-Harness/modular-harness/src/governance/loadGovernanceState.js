import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeHandle } from "../session/xSessionSignals.js";

export const REQUIRED_GOVERNANCE_FILE_NAMES = {
  twitterMode: "twitter-mode.md",
  diversityRules: "twitter-diversity-rules.md",
  postedThreads: "posted-threads-log.json",
  followRunLog: "follow_run_log.txt",
};

export const OPTIONAL_GOVERNANCE_FILE_NAMES = {
  pendingImprovements: "pending-improvements.md",
  followedAccounts: "followed_accounts_log.txt",
};

export const BLANK_PENDING_IMPROVEMENTS_MARKDOWN = `# Pending Improvements Queue

## Pending Action Items

No pending improvements yet.
`;

function splitMarkdownRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function toCamelCaseHeader(header) {
  const parts = header
    .replace(/[`*]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  if (parts.length === 0) return "";

  return parts
    .map((part, index) => {
      const normalized = part.replace(/^[A-Z]+$/, (value) => value.toLowerCase());
      if (index === 0) {
        return normalized.charAt(0).toLowerCase() + normalized.slice(1);
      }

      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join("");
}

function extractHeadingSections(markdown, level = 2) {
  const headingPrefix = `${"#".repeat(level)} `;
  const sections = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith(headingPrefix)) {
      if (currentSection) {
        currentSection.content = currentSection.lines.join("\n").trim();
        delete currentSection.lines;
        sections.push(currentSection);
      }

      currentSection = {
        heading: line.slice(headingPrefix.length).trim(),
        lines: [],
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    currentSection.content = currentSection.lines.join("\n").trim();
    delete currentSection.lines;
    sections.push(currentSection);
  }

  return sections;
}

function findSectionContent(sections, headingFragment) {
  const loweredHeadingFragment = headingFragment.toLowerCase();
  return (
    sections.find(({ heading }) => heading.toLowerCase().includes(loweredHeadingFragment))?.content ??
    ""
  );
}

function parseMarkdownTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  let tableStart = -1;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index].trim();
    const separatorLine = lines[index + 1].trim();
    if (headerLine.startsWith("|") && /^\|(?:\s*:?-+:?\s*\|)+\s*$/.test(separatorLine)) {
      tableStart = index;
      break;
    }
  }

  if (tableStart === -1) {
    return [];
  }

  const headers = splitMarkdownRow(lines[tableStart]).map(toCamelCaseHeader);
  const rows = [];

  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const row = lines[index].trim();
    if (!row.startsWith("|")) {
      break;
    }

    const cells = splitMarkdownRow(row);
    const parsedRow = {};

    headers.forEach((header, cellIndex) => {
      if (!header) return;
      parsedRow[header] = cells[cellIndex] ?? "";
    });

    rows.push(parsedRow);
  }

  return rows;
}

function extractCodeFences(markdown) {
  return [...markdown.matchAll(/```([\s\S]*?)```/g)].map((match) => match[1].trim());
}

function parseAssignmentsFromCodeFence(codeFence) {
  const assignments = {};

  for (const line of codeFence.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    assignments[match[1]] = match[2].trim();
  }

  return assignments;
}

function extractModeSections(markdown) {
  const sections = extractHeadingSections(markdown, 3);
  const modeSections = new Map();

  for (const section of sections) {
    const match = section.heading.match(/`([^`]+)`/);
    if (!match) continue;
    modeSections.set(match[1], section.content);
  }

  return modeSections;
}

function matchesCurrentModeConfig(currentMode, key) {
  switch (currentMode) {
    case "promotional-specific":
      return /^PROMO_/.test(key);
    case "engagement-specific":
      return /^ENGAGEMENT_/.test(key);
    case "collection-launch":
      return /^COLLECTION_/.test(key) || key === "LAUNCH_END_DATE";
    default:
      return false;
  }
}

function normalizeGovernanceTableRows(rows, handleFieldNames = []) {
  return rows.map((row) => {
    const normalizedRow = { ...row };
    for (const fieldName of handleFieldNames) {
      if (normalizedRow[fieldName]) {
        normalizedRow[`normalized${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`] =
          normalizeHandle(normalizedRow[fieldName]);
      }
    }
    return normalizedRow;
  });
}

function parseDateLabel(value) {
  if (!value?.trim()) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const normalized = new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    return value.trim();
  }

  return normalized.toISOString();
}

export function normalizeGovernanceUrl(value) {
  if (!value?.trim()) return null;

  const trimmed = value.trim();
  try {
    const parsedUrl = new URL(trimmed);
    parsedUrl.hash = "";
    parsedUrl.search = "";
    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function parseModeMarkdown(markdown) {
  const sections = extractHeadingSections(markdown, 2);
  const currentModeAssignments = extractCodeFences(findSectionContent(sections, "CURRENT MODE"))
    .map(parseAssignmentsFromCodeFence)
    .reduce((merged, assignments) => ({ ...merged, ...assignments }), {});
  const currentMode = currentModeAssignments.MODE?.toLowerCase() ?? null;

  const modeDefinitions = {};
  const modeSections = extractModeSections(markdown);
  for (const [modeName, modeContent] of modeSections.entries()) {
    const config = extractCodeFences(modeContent)
      .map(parseAssignmentsFromCodeFence)
      .reduce((merged, assignments) => ({ ...merged, ...assignments }), {});

    modeDefinitions[modeName] = {
      mode: modeName,
      config,
    };
  }

  const modeHistory = parseMarkdownTable(findSectionContent(sections, "Mode History"));
  const allConfigFields = Object.values(modeDefinitions).reduce(
    (merged, definition) => ({ ...merged, ...definition.config }),
    {}
  );
  delete allConfigFields.MODE;

  const currentConfig = Object.fromEntries(
    Object.entries(allConfigFields).filter(([key]) => matchesCurrentModeConfig(currentMode, key))
  );

  return {
    currentMode,
    currentConfig,
    allConfigFields,
    modeDefinitions,
    modeHistory,
  };
}

export function parseDiversityRulesMarkdown(markdown) {
  const sections = extractHeadingSections(markdown, 2);
  const searchNoiseSection = findSectionContent(sections, "Search Noise");
  const botPatternLine = searchNoiseSection
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes("bot pattern to auto-skip"));
  const cooldownMatch = markdown.match(/Author cooldown:\s*(\d+)\s*days/i);

  const strategyRotationLog = parseMarkdownTable(findSectionContent(sections, "Search Strategy Rotation Log"));
  const availableStrategies = parseMarkdownTable(findSectionContent(sections, "Available Search Strategies"));
  const cooldownAuthors = normalizeGovernanceTableRows(
    parseMarkdownTable(findSectionContent(sections, "Author Engagement History")),
    ["author"]
  ).map((row) => ({
    ...row,
    lastEngaged: parseDateLabel(row.lastEngaged),
    cooldownExpires: parseDateLabel(row.cooldownExpires),
  }));
  const excludedAccounts = normalizeGovernanceTableRows(
    parseMarkdownTable(searchNoiseSection),
    ["account"]
  );
  const followerSourceQuality = normalizeGovernanceTableRows(
    parseMarkdownTable(findSectionContent(sections, "Follower Source Quality Guide")),
    ["sourceAccount"]
  );
  const retweetLog = normalizeGovernanceTableRows(
    parseMarkdownTable(findSectionContent(sections, "Retweet Log")),
    ["accountRetweeted"]
  );
  const standaloneTweetAngles = parseMarkdownTable(findSectionContent(sections, "Standalone Tweet Angle Log"));
  const selfImprovementLog = parseMarkdownTable(findSectionContent(sections, "Self-Improvement Log"));

  return {
    cooldownDays: cooldownMatch ? Number.parseInt(cooldownMatch[1], 10) : null,
    strategyRotationLog,
    lastStrategyUsed: strategyRotationLog.at(-1)?.strategyUsed ?? null,
    availableStrategies,
    cooldownAuthors,
    excludedAccounts,
    botPattern: botPatternLine?.split(":").slice(1).join(":").trim() ?? null,
    followerSourceQuality,
    retweetLog,
    standaloneTweetAngles,
    lastStandaloneAngle: standaloneTweetAngles.at(-1)?.angleUsed ?? null,
    selfImprovementLog,
  };
}

export function parsePostedThreadsLog(markdown) {
  const parsed = JSON.parse(markdown);
  const threads = Array.isArray(parsed.threads)
    ? parsed.threads.map((thread) => ({
        ...thread,
        normalizedAuthor: normalizeHandle(thread.author),
        normalizedUrl: normalizeGovernanceUrl(thread.url),
      }))
    : [];

  return {
    description: parsed.description ?? "",
    threads,
    urls: [...new Set(threads.map((thread) => thread.normalizedUrl).filter(Boolean))],
  };
}

export function parseFollowRunLog(markdown, recentLineCount = 10) {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    lines,
    recentLines: lines.slice(-recentLineCount),
    lastLine: lines.at(-1) ?? null,
  };
}

export function parseFollowedAccountsLog(markdown) {
  const handles = [
    ...new Set(
      markdown
        .split(/\r?\n/)
        .map((line) => normalizeHandle(line))
        .filter(Boolean)
    ),
  ];

  return {
    handles,
  };
}

export function parsePendingImprovementsMarkdown(markdown) {
  const headerMatches = [...markdown.matchAll(/^### \[(PENDING|DONE(?:\s*-\s*[^\]]+)?)\]\s+(.+)$/gm)];
  const items = headerMatches.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = headerMatches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd).trim();
    const normalizedBody = body.replace(/\*\*/g, "");
    const statusLabel = match[1];
    const doneAt = statusLabel.startsWith("DONE")
      ? statusLabel.replace(/^DONE\s*-\s*/i, "").trim()
      : null;

    return {
      title: match[2].trim(),
      status: statusLabel.startsWith("DONE") ? "done" : "pending",
      doneAt,
      body,
      autoExecutable: /Auto-executable:\s*Yes/i.test(normalizedBody),
      requiresHumanDecision:
        /Auto-executable:\s*No/i.test(normalizedBody) ||
        /Human decision required/i.test(normalizedBody),
    };
  });

  return {
    items,
    pendingItems: items.filter((item) => item.status === "pending"),
    doneItems: items.filter((item) => item.status === "done"),
  };
}

async function readTextFile(filePath, { allowMissing = false } = {}) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function loadGovernanceState({
  baseDir = process.cwd(),
  createMissingPendingImprovements = false,
} = {}) {
  const warnings = [];
  const files = Object.fromEntries(
    [...Object.entries(REQUIRED_GOVERNANCE_FILE_NAMES), ...Object.entries(OPTIONAL_GOVERNANCE_FILE_NAMES)].map(
      ([key, fileName]) => [key, path.join(baseDir, fileName)]
    )
  );

  const requiredTexts = await Promise.all(
    Object.entries(REQUIRED_GOVERNANCE_FILE_NAMES).map(async ([key, fileName]) => {
      const filePath = path.join(baseDir, fileName);
      return [key, await readTextFile(filePath)];
    })
  );
  const requiredContent = Object.fromEntries(requiredTexts);

  let pendingImprovementsMarkdown = await readTextFile(files.pendingImprovements, { allowMissing: true });
  if (pendingImprovementsMarkdown === null) {
    warnings.push("Optional governance file pending-improvements.md is missing.");
    if (createMissingPendingImprovements) {
      pendingImprovementsMarkdown = BLANK_PENDING_IMPROVEMENTS_MARKDOWN;
      await writeFile(files.pendingImprovements, pendingImprovementsMarkdown, "utf8");
    }
  }

  const followedAccountsMarkdown = await readTextFile(files.followedAccounts, { allowMissing: true });
  if (followedAccountsMarkdown === null) {
    warnings.push("Optional governance file followed_accounts_log.txt is missing.");
  }

  return {
    baseDir,
    loadedAt: new Date().toISOString(),
    files,
    warnings,
    mode: parseModeMarkdown(requiredContent.twitterMode),
    diversity: parseDiversityRulesMarkdown(requiredContent.diversityRules),
    postedThreads: parsePostedThreadsLog(requiredContent.postedThreads),
    followRun: parseFollowRunLog(requiredContent.followRunLog),
    pendingImprovements: pendingImprovementsMarkdown
      ? parsePendingImprovementsMarkdown(pendingImprovementsMarkdown)
      : parsePendingImprovementsMarkdown(BLANK_PENDING_IMPROVEMENTS_MARKDOWN),
    followedAccounts: followedAccountsMarkdown
      ? parseFollowedAccountsLog(followedAccountsMarkdown)
      : { handles: [] },
  };
}
