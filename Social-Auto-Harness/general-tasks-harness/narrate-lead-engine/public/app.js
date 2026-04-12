const state = {
  overview: null,
  selectedRun: null,
  selectedLead: null,
  runArtifacts: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

function renderMetrics(overview) {
  const metrics = document.getElementById("metrics");
  const entries = [
    ["Runs", overview.overview.runCount],
    ["Leads", overview.overview.leadCount],
    ["Hot Leads", overview.overview.hotLeadCount],
    ["Draft Ready", overview.overview.readyCount],
  ];

  metrics.innerHTML = entries
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <p class="label">${escapeHtml(label)}</p>
          <p class="value">${escapeHtml(value)}</p>
        </article>
      `
    )
    .join("");
}

function renderRuns(runs) {
  const container = document.getElementById("runs");
  if (!runs.length) {
    container.innerHTML = "No runs yet.";
    return;
  }

  container.innerHTML = runs
    .map(
      (run) => `
        <article class="run-item">
          <h3>${escapeHtml(run.name)}</h3>
          <div class="run-meta">
            <span class="chip">${escapeHtml(run.id)}</span>
            <span class="chip">${escapeHtml(run.status)}</span>
            <span class="chip">${escapeHtml(run.counts.hot || 0)} hot</span>
            <span class="chip">${escapeHtml(run.counts.drafted || 0)} drafted</span>
          </div>
          <p>${escapeHtml(run.objective)}</p>
          <button data-run-id="${escapeHtml(run.id)}">Open Run</button>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("button[data-run-id]").forEach((button) => {
    button.addEventListener("click", () => loadRun(button.dataset.runId));
  });
}

function renderLeads(leads) {
  const container = document.getElementById("leads");
  if (!leads.length) {
    container.innerHTML = "No leads in this run.";
    return;
  }

  container.innerHTML = leads
    .map(
      (lead) => `
        <article class="lead-row" data-lead-id="${escapeHtml(lead.leadId)}">
          <h3>${escapeHtml(lead.personOrCompany)}</h3>
          <div class="lead-meta">
            <span class="chip">${escapeHtml(lead.leadType)}</span>
            <span class="chip">score ${escapeHtml(lead.totalScore)}</span>
            <span class="chip">${escapeHtml(lead.status)}</span>
            <span class="chip">${escapeHtml(lead.evidence?.platform || "open-web")}</span>
          </div>
          <p>${escapeHtml(lead.evidence?.excerpt || lead.evidence?.title || "")}</p>
          <div class="lead-signals">
            ${(lead.detectedSignals || [])
              .slice(0, 4)
              .map((signal) => `<span class="chip">${escapeHtml(signal.type)}</span>`)
              .join("")}
          </div>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-lead-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const lead = leads.find((entry) => entry.leadId === row.dataset.leadId);
      state.selectedLead = lead;
      renderLeadDetail(lead);
    });
  });
}

function renderLeadDetail(lead) {
  const container = document.getElementById("detail");
  if (!lead) {
    container.innerHTML = "Select a lead.";
    return;
  }

  const draft = (state.runArtifacts?.outreach || []).find((entry) => entry.leadId === lead.leadId);

  container.innerHTML = `
    <div class="detail-grid">
      <section class="detail-card">
        <h3>${escapeHtml(lead.personOrCompany)}</h3>
        <div class="lead-meta">
          <span class="chip">${escapeHtml(lead.leadType)}</span>
          <span class="chip">score ${escapeHtml(lead.totalScore)}</span>
          <span class="chip">pain ${escapeHtml(lead.painScore)}</span>
          <span class="chip">fit ${escapeHtml(lead.fitScore)}</span>
          <span class="chip">reach ${escapeHtml(lead.reachabilityScore)}</span>
        </div>
        <p><strong>Source:</strong> ${lead.evidence?.url ? `<a href="${escapeHtml(lead.evidence.url)}" target="_blank" rel="noreferrer">${escapeHtml(lead.evidence.url)}</a>` : "n/a"}</p>
        <p><strong>Query:</strong> ${escapeHtml(lead.evidence?.query || "n/a")}</p>
        <p><strong>Signals:</strong> ${(lead.detectedSignals || []).map((signal) => escapeHtml(signal.matchedPhrase)).join(", ") || "n/a"}</p>
      </section>

      <section class="detail-card">
        <h3>Enrichment</h3>
        ${
          lead.enrichment
            ? `
              <p><strong>Website:</strong> ${lead.enrichment.website ? `<a href="${escapeHtml(lead.enrichment.website)}" target="_blank" rel="noreferrer">${escapeHtml(lead.enrichment.website)}</a>` : "n/a"}</p>
              <p><strong>Email:</strong> ${escapeHtml(lead.enrichment.email || "n/a")}</p>
              <p><strong>Contact Path:</strong> ${escapeHtml(lead.enrichment.contactPath || "n/a")}</p>
              <p><strong>Genre:</strong> ${escapeHtml(lead.enrichment.genre || "n/a")}</p>
              <p><strong>Notes:</strong> ${escapeHtml(lead.enrichment.notes || "n/a")}</p>
            `
            : "<p>No enrichment yet.</p>"
        }
      </section>

      <section class="detail-card">
        <h3>Evidence</h3>
        <pre>${escapeHtml(JSON.stringify(lead.evidence, null, 2))}</pre>
      </section>

      <section class="detail-card">
        <h3>Outreach Draft</h3>
        ${
          draft
            ? `
              <p><strong>Subject:</strong> ${escapeHtml(draft.value.subject)}</p>
              <pre>${escapeHtml(draft.value.body)}</pre>
              <p><strong>DM Variant:</strong> ${escapeHtml(draft.value.dmVariant)}</p>
            `
            : "<p>No draft for this lead yet.</p>"
        }
      </section>
    </div>
  `;
}

async function loadOverview() {
  state.overview = await getJson("/api/overview");
  renderMetrics(state.overview);
  renderRuns(state.overview.runs);
  renderLeads(state.overview.leads.slice(0, 20));

  const input = document.getElementById("job-file");
  if (!input.value) {
    input.value = state.overview.exampleJobPath;
  }
}

async function loadRun(runId) {
  state.runArtifacts = await getJson(`/api/runs/${encodeURIComponent(runId)}`);
  state.selectedRun = runId;
  renderLeads(state.runArtifacts.leads || []);
  renderLeadDetail((state.runArtifacts.leads || [])[0] || null);
}

async function handleRunSubmit(event) {
  event.preventDefault();
  const jobFilePath = document.getElementById("job-file").value.trim();
  const status = document.getElementById("run-status");
  const button = document.getElementById("run-button");

  button.disabled = true;
  status.textContent = "Running discovery. This can take a while if browser search and ChatGPT enrichment are enabled.";

  try {
    const result = await getJson("/api/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobFilePath }),
    });

    status.textContent = `Run ${result.runId} finished. ${result.counts.hot} hot leads, ${result.counts.drafted} drafted.`;
    await loadOverview();
    await loadRun(result.runId);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document.getElementById("run-form").addEventListener("submit", handleRunSubmit);
loadOverview().catch((error) => {
  document.getElementById("run-status").textContent = error.message;
});
