export type DeployClarityVersion = 2 | 3;

const CLARITY_3_TEMPLATE_VERSIONS = new Set([
  'xtrata-collection-mint-v1.1',
  'xtrata-collection-mint-v1.2',
  'xtrata-collection-mint-v1.3',
  'xtrata-collection-mint-v1.4',
  'xtrata-preinscribed-collection-sale-v1.0'
]);

const CLARITY_3_SOURCE_MARKERS = [
  /\bstacks-block-height\b/,
  /\btenure-height\b/,
  /\bget-stacks-block-info\?\b/,
  /\bget-tenure-info\?\b/
];

const normalizeTemplateVersion = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/-v(\d+)-(\d+)/g, '-v$1.$2');

export const sourceRequiresClarity3 = (source?: string | null) => {
  const normalized = source ?? '';
  return CLARITY_3_SOURCE_MARKERS.some((pattern) => pattern.test(normalized));
};

export const resolveDeployClarityVersion = (params: {
  templateVersion?: string | null;
  source?: string | null;
}): DeployClarityVersion => {
  const templateVersion = normalizeTemplateVersion(params.templateVersion);
  if (CLARITY_3_TEMPLATE_VERSIONS.has(templateVersion)) {
    return 3;
  }
  return sourceRequiresClarity3(params.source) ? 3 : 2;
};
