import { getX402ContractId, type X402PremiumRouteConfig } from './x402-config';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const describeUnlock = (route: X402PremiumRouteConfig) => {
  if (route.accessMode === 'commerce') {
    return 'Unlocked via on-chain USDCx entitlement.';
  }
  if (route.accessMode === 'vault') {
    return 'Unlocked via on-chain sBTC premium reserve access.';
  }
  return 'Unlocked via verified on-chain commerce or premium reserve state.';
};

export const renderX402PremiumHtml = (route: X402PremiumRouteConfig) => {
  const title = escapeHtml(route.title);
  const slug = escapeHtml(route.slug);
  const contractId = escapeHtml(getX402ContractId(route.contract));
  const message = escapeHtml(describeUnlock(route));
  const assetId = route.assetId.toString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe7;
        --ink: #1f1812;
        --panel: #fffaf2;
        --edge: #d2c2a8;
        --accent: #9a3f16;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top right, rgba(154, 63, 22, 0.16), transparent 35%),
          linear-gradient(180deg, #f9f4ec 0%, var(--bg) 100%);
        color: var(--ink);
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        max-width: 880px;
        margin: 0 auto;
        padding: 40px 20px 72px;
      }
      .card {
        background: rgba(255, 250, 242, 0.96);
        border: 1px solid var(--edge);
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 18px 50px rgba(49, 32, 13, 0.08);
      }
      .eyebrow {
        display: inline-block;
        margin-bottom: 14px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(154, 63, 22, 0.1);
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 5vw, 56px);
        line-height: 0.96;
      }
      p {
        margin: 0 0 14px;
        font-size: 18px;
        line-height: 1.55;
      }
      dl {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 24px 0 0;
      }
      dt {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(31, 24, 18, 0.64);
      }
      dd {
        margin: 6px 0 0;
        font-size: 15px;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <div class="eyebrow">Xtrata x402 Demo</div>
        <h1>${title}</h1>
        <p>${message}</p>
        <p>This premium page is served by the x402 gateway after short-lived server session verification.</p>
        <dl>
          <div>
            <dt>Slug</dt>
            <dd>${slug}</dd>
          </div>
          <div>
            <dt>Asset ID</dt>
            <dd>${assetId}</dd>
          </div>
          <div>
            <dt>Core Contract</dt>
            <dd>${contractId}</dd>
          </div>
          <div>
            <dt>Access Mode</dt>
            <dd>${escapeHtml(route.accessMode)}</dd>
          </div>
        </dl>
      </div>
    </main>
  </body>
</html>`;
};
