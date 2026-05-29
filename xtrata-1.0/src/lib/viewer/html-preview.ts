const GRID_PREVIEW_MARKER = 'data-xtrata-grid-preview';

const buildGridPreviewStyle = () => `<style ${GRID_PREVIEW_MARKER}="true">
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 100% !important;
  min-height: 100% !important;
  overflow: hidden !important;
}

body {
  position: relative !important;
}

body > main:only-child,
body > div:only-child,
body > canvas:first-of-type,
body > svg:first-of-type,
body > img:first-of-type,
body > video:first-of-type {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  transform-origin: center center !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 100% !important;
  max-height: 100% !important;
}
</style>`;

const insertAfterTag = (html: string, tagName: string, content: string) => {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'i');
  const match = html.match(regex);
  if (!match || match.index === undefined) {
    return null;
  }
  const index = match.index + match[0].length;
  return `${html.slice(0, index)}${content}${html.slice(index)}`;
};

export const injectGridThumbnailHtml = (html: string) => {
  if (!html || html.includes(GRID_PREVIEW_MARKER)) {
    return html;
  }
  const style = buildGridPreviewStyle();
  if (html.includes('</head>')) {
    return html.replace('</head>', `${style}</head>`);
  }
  const afterHead = insertAfterTag(html, 'head', style);
  if (afterHead) {
    return afterHead;
  }
  const afterBody = insertAfterTag(html, 'body', style);
  if (afterBody) {
    return afterBody;
  }
  return `${style}${html}`;
};
