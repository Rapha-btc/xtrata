const MODE_COPY = {
  creator: {
    title: "Inscribe data on-chain in three clear steps.",
    text: "Browse real inscriptions, preview quickly, and mint without learning the full workspace first."
  },
  protocol: {
    title: "Build and publish on a verifiable on-chain data layer.",
    text: "Start with a simple homepage flow, then move to Workspace when you need deeper controls and diagnostics."
  }
};

const TOKENS = [
  {
    id: "18421",
    title: "Ritual Bloom",
    artist: "Sora Fields",
    mime: "image/png",
    listed: true,
    price: "32 STX",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23ffbc8a'/><stop offset='100%' stop-color='%23f66f5a'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><circle cx='140' cy='135' r='78' fill='%23ffe8d3'/><circle cx='262' cy='248' r='88' fill='%23ffffffaa'/><path d='M70 300C130 250 250 210 340 290' stroke='%23fff' stroke-width='16' stroke-linecap='round' fill='none'/></svg>"
  },
  {
    id: "18422",
    title: "Signal Temple",
    artist: "Hexa Works",
    mime: "image/svg+xml",
    listed: false,
    price: null,
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%239fd4ff'/><stop offset='100%' stop-color='%236a8eff'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><rect x='70' y='70' width='260' height='260' rx='24' fill='%230f1d3f' fill-opacity='.25'/><path d='M120 284L200 100L280 284Z' fill='%23fff'/><rect x='186' y='150' width='28' height='132' fill='%230f4f9b'/></svg>"
  },
  {
    id: "18423",
    title: "Night Loop",
    artist: "Mina Kai",
    mime: "video/mp4",
    listed: true,
    price: "18 STX",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23232f67'/><stop offset='100%' stop-color='%2356a2ff'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><circle cx='200' cy='200' r='120' fill='none' stroke='%23a7ceff' stroke-width='16'/><polygon points='170,145 280,200 170,255' fill='%23fff'/></svg>"
  },
  {
    id: "18424",
    title: "Core Lyrics",
    artist: "Nori Text",
    mime: "text/plain",
    listed: false,
    price: null,
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23ffe6d0'/><stop offset='100%' stop-color='%23f7b0c9'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><rect x='90' y='68' width='220' height='264' rx='18' fill='%23fff'/><path d='M130 140h140M130 180h140M130 220h100M130 260h140' stroke='%23f18a5d' stroke-width='12' stroke-linecap='round'/></svg>"
  },
  {
    id: "18425",
    title: "Pulse Choir",
    artist: "Echo Unit",
    mime: "audio/wav",
    listed: true,
    price: "9 STX",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23fce5a5'/><stop offset='100%' stop-color='%23f68e5f'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><circle cx='120' cy='200' r='52' fill='%23fff'/><path d='M200 154v92M232 134v132M264 164v72M296 146v108' stroke='%23fff' stroke-width='16' stroke-linecap='round'/></svg>"
  },
  {
    id: "18426",
    title: "Mesh Bloom",
    artist: "Luma Dot",
    mime: "image/jpeg",
    listed: true,
    price: "22 STX",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23dbf4cf'/><stop offset='100%' stop-color='%2363c2a8'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><path d='M65 280L132 122L212 236L282 146L338 280Z' fill='%23ffffffbb'/><circle cx='130' cy='116' r='30' fill='%23fff'/></svg>"
  },
  {
    id: "18427",
    title: "Glass Nodes",
    artist: "Unit_09",
    mime: "image/png",
    listed: false,
    price: null,
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23d8ddff'/><stop offset='100%' stop-color='%23859dff'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><rect x='80' y='80' width='240' height='240' rx='32' fill='%23ffffff66'/><path d='M125 260L200 130L276 260Z' fill='%23fff'/></svg>"
  },
  {
    id: "18428",
    title: "Afterlight Grid",
    artist: "Plex Arc",
    mime: "image/gif",
    listed: true,
    price: "14 STX",
    image:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23ffd2c8'/><stop offset='100%' stop-color='%23ffa46f'/></linearGradient></defs><rect width='400' height='400' fill='url(%23g)'/><path d='M90 90h220v220H90z' fill='none' stroke='%23fff' stroke-width='16'/><path d='M90 160h220M90 230h220M160 90v220M230 90v220' stroke='%23fff' stroke-width='10'/></svg>"
  }
];

let selectedTokenId = TOKENS[0].id;
let walletConnected = false;

const tokenGrid = document.getElementById("tokenGrid");
const previewImage = document.getElementById("previewImage");
const previewToken = document.getElementById("previewToken");
const previewArtist = document.getElementById("previewArtist");
const previewType = document.getElementById("previewType");
const previewStatus = document.getElementById("previewStatus");
const buyButton = document.getElementById("buyButton");
const walletButton = document.getElementById("walletButton");
const heroTitle = document.getElementById("heroTitle");
const heroText = document.getElementById("heroText");

const updatePreview = () => {
  const token = TOKENS.find((item) => item.id === selectedTokenId);
  if (!token) {
    return;
  }
  previewImage.src = token.image;
  previewToken.textContent = `#${token.id} ${token.title}`;
  previewArtist.textContent = token.artist;
  previewType.textContent = token.mime;
  if (token.listed) {
    previewStatus.textContent = `Listed for ${token.price}`;
    buyButton.disabled = false;
    buyButton.textContent = `Buy from preview (${token.price})`;
  } else {
    previewStatus.textContent = "Not listed";
    buyButton.disabled = true;
    buyButton.textContent = "Buy from preview (not listed)";
  }
};

const renderGrid = () => {
  tokenGrid.innerHTML = "";
  TOKENS.forEach((token) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wf-tile${token.id === selectedTokenId ? " is-selected" : ""}`;
    button.innerHTML = `
      <div class="wf-tile__img"><img alt="${token.title}" src="${token.image}" /></div>
      <strong>#${token.id}</strong>
      <span>${token.listed ? `Listed ${token.price}` : "Not listed"}</span>
    `;
    button.addEventListener("click", () => {
      selectedTokenId = token.id;
      renderGrid();
      updatePreview();
    });
    tokenGrid.appendChild(button);
  });
};

const setMode = (mode) => {
  const nextMode = mode === "protocol" ? "protocol" : "creator";
  document.body.dataset.mode = nextMode;
  const copy = MODE_COPY[nextMode];
  heroTitle.textContent = copy.title;
  heroText.textContent = copy.text;

  document.querySelectorAll("[data-mode-target]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.modeTarget === nextMode);
  });
};

document.querySelectorAll("[data-mode-target]").forEach((chip) => {
  chip.addEventListener("click", () => {
    setMode(chip.dataset.modeTarget);
  });
});

walletButton.addEventListener("click", () => {
  walletConnected = !walletConnected;
  walletButton.textContent = walletConnected ? "Wallet connected" : "Connect wallet";
});

buyButton.addEventListener("click", () => {
  if (buyButton.disabled) {
    return;
  }
  buyButton.textContent = "Buy flow triggered (wireframe)";
  window.setTimeout(() => {
    updatePreview();
  }, 900);
});

renderGrid();
updatePreview();
setMode("creator");
