const STYLE_ID = 'xtrata-template-cartridge-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ct-shell {
      border: 1px solid #3a4456;
      border-radius: 10px;
      padding: 12px;
      background: #121a26;
      color: #d9e7f7;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    }
    .ct-shell h3 {
      margin: 0 0 8px;
      font-size: 1rem;
    }
    .ct-shell p {
      margin: 0 0 10px;
      color: #9fb2c8;
      font-size: 0.9rem;
    }
    .ct-shell button {
      border: 1px solid #4d5f7a;
      border-radius: 8px;
      background: #1e334d;
      color: #e6f0fa;
      padding: 8px 10px;
      cursor: pointer;
      font-weight: 600;
    }
  `;

  document.head.appendChild(style);
}

export async function mountCartridge(root, api) {
  if (!root || !(root instanceof HTMLElement)) {
    throw new Error('mountCartridge requires a valid root element');
  }

  ensureStyles();
  root.innerHTML = '';

  const shell = document.createElement('section');
  shell.className = 'ct-shell';

  const title = document.createElement('h3');
  title.textContent = (api && api.cartridge && api.cartridge.title) || 'Template Cartridge';

  const description = document.createElement('p');
  description.textContent =
    (api && api.assets && api.assets.description) ||
    'Replace this module with your gameplay logic. Keep the export name mountCartridge.';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Ping Runtime';

  const output = document.createElement('p');
  output.textContent = 'No events yet.';

  const onClick = () => {
    const message = `Template cartridge ping at ${new Date().toISOString()}`;
    output.textContent = message;
    if (api && typeof api.log === 'function') {
      api.log(message);
    }
    if (api && typeof api.setStatus === 'function') {
      api.setStatus(message);
    }
  };

  button.addEventListener('click', onClick);

  shell.appendChild(title);
  shell.appendChild(description);
  shell.appendChild(button);
  shell.appendChild(output);

  root.appendChild(shell);

  if (api && typeof api.setStats === 'function') {
    api.setStats({
      Cartridge: (api.cartridge && api.cartridge.id) || 'template',
      Runtime: (api && api.runtimeVersion) || 'unknown',
      Status: 'Loaded'
    });
  }

  return {
    destroy() {
      button.removeEventListener('click', onClick);
      root.innerHTML = '';
    }
  };
}
