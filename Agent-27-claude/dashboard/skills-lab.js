(function initSkillsLabModule() {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function previewValue(value, limit = 180) {
    const text = typeof value === 'string'
      ? value
      : JSON.stringify(value || {}, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  onReady(() => {
    const els = {
      skill: document.getElementById('skill-lab-skill'),
      scenario: document.getElementById('skill-lab-scenario'),
      mode: document.getElementById('skill-lab-mode'),
      model: document.getElementById('skill-lab-model'),
      budget: document.getElementById('skill-lab-budget'),
      run: document.getElementById('btn-skill-lab-run'),
      cancel: document.getElementById('btn-skill-lab-cancel'),
      status: document.getElementById('skill-lab-status'),
      meta: document.getElementById('skill-lab-meta'),
      scenarioSpec: document.getElementById('skill-lab-scenario-spec'),
      assertions: document.getElementById('skill-lab-assertions'),
      history: document.getElementById('skill-lab-history'),
      summary: document.getElementById('skill-lab-summary'),
      trace: document.getElementById('skill-lab-trace'),
      prompt: document.getElementById('skill-lab-prompt'),
      output: document.getElementById('skill-lab-output'),
      timer: document.getElementById('skill-lab-timer'),
      timerLabel: document.getElementById('skill-lab-timer-label'),
      timerElapsed: document.getElementById('skill-lab-timer-elapsed'),
      timerFill: document.getElementById('skill-lab-timer-fill')
    };

    if (!els.skill || !els.scenario || !els.budget) return;

    const state = {
      skills: [],
      status: { running: null, recentRuns: [] },
      selectedSkillId: '',
      selectedScenarioId: '',
      selectedRun: null
    };

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }

    function fmtTime(value) {
      if (!value) return '--:--';
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? '--:--'
        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function fmtDuration(ms) {
      if (ms == null) return '--';
      const total = Math.max(0, Math.round(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    function parseBudgetValue() {
      const value = Number(els.budget.value);
      return Number.isFinite(value) ? value : NaN;
    }

    function fetchJson(url) {
      return fetch(url).then((res) => {
        if (!res.ok) {
          const error = new Error(`${url} returned ${res.status}`);
          error.status = res.status;
          throw error;
        }
        return res.json();
      });
    }

    function setRegistryError(err) {
      const isMissingRoute = err?.status === 404 || String(err?.message || '').includes('/api/skill-tests returned 404');
      els.status.className = 'skills-lab-status fail';
      els.status.textContent = isMissingRoute
        ? 'Skills Lab API missing on the running dashboard server. Restart `cd dashboard && npm run dev` so server.js reloads the new /api/skill-tests routes.'
        : `Failed to load Skills Lab registry: ${err.message}`;
    }

    function postJson(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }).then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || `${url} returned ${res.status}`);
        }
        return payload;
      });
    }

    function getSelectedSkill() {
      return state.skills.find((skill) => skill.id === state.selectedSkillId) || null;
    }

    function getSelectedScenario() {
      const skill = getSelectedSkill();
      return skill?.scenarios.find((scenario) => scenario.id === state.selectedScenarioId) || null;
    }

    function applySkillDefaults(skill) {
      if (!skill) return;
      els.mode.value = skill.defaults?.mode || 'dry-run';
      els.model.value = skill.defaults?.model || 'sonnet';
      els.budget.value = Number(skill.defaults?.budget || 0.5).toFixed(2);
    }

    function renderSkillOptions() {
      const previousSkillId = state.selectedSkillId;
      els.skill.innerHTML = '';

      if (state.skills.length === 0) {
        els.skill.innerHTML = '<option value="">No tested skills found</option>';
        state.selectedSkillId = '';
        renderScenarioOptions();
        return;
      }

      state.skills.forEach((skill) => {
        const option = document.createElement('option');
        option.value = skill.id;
        option.textContent = `${skill.title} (${skill.scenarioCount} scenarios)`;
        els.skill.appendChild(option);
      });

      const preferred = state.skills.find((skill) => skill.id === previousSkillId && skill.scenarioCount > 0)
        || state.skills.find((skill) => skill.scenarioCount > 0)
        || state.skills[0];

      state.selectedSkillId = preferred.id;
      els.skill.value = preferred.id;
      applySkillDefaults(preferred);
      renderScenarioOptions();
    }

    function renderScenarioOptions() {
      const skill = getSelectedSkill();
      const previousScenarioId = state.selectedScenarioId;
      els.scenario.innerHTML = '';

      if (!skill || !skill.scenarios || skill.scenarios.length === 0) {
        els.scenario.innerHTML = '<option value="">No scenarios configured</option>';
        state.selectedScenarioId = '';
        renderAll();
        return;
      }

      skill.scenarios.forEach((scenario) => {
        const option = document.createElement('option');
        option.value = scenario.id;
        option.textContent = scenario.title;
        els.scenario.appendChild(option);
      });

      const preferred = skill.scenarios.find((scenario) => scenario.id === previousScenarioId) || skill.scenarios[0];
      state.selectedScenarioId = preferred.id;
      els.scenario.value = preferred.id;
      renderAll();
    }

    function renderMeta() {
      const skill = getSelectedSkill();
      const scenario = getSelectedScenario();
      if (!skill) {
        els.meta.innerHTML = 'No skill selected.';
        return;
      }

      const rows = [
        ['Skill', skill.title],
        ['Path', skill.path],
        ['Description', skill.description || 'No description'],
        ['Scenario', scenario?.title || 'No scenario'],
        ['Summary', scenario?.summary || 'No scenario summary'],
        ['Mode', els.mode.value],
        ['Model', els.model.value],
        ['Budget', Number.isFinite(parseBudgetValue()) ? `$${parseBudgetValue().toFixed(2)}` : 'Invalid']
      ];

      els.meta.innerHTML = `<div class="skills-lab-kv">${rows.map(([label, value]) => `
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
      `).join('')}</div>`;
    }

    function renderScenarioSpec() {
      const scenario = getSelectedScenario();
      if (!scenario) {
        els.scenarioSpec.innerHTML = 'No scenario selected.';
        return;
      }

      const sections = [
        `<div style="margin-bottom:0.5rem;"><strong>${escapeHtml(scenario.title)}</strong><br><span style="color:#888">${escapeHtml(scenario.summary || '')}</span></div>`,
        '<div style="margin-bottom:0.35rem; color:#87CEEB;">Instructions</div>',
        `<ul class="skills-lab-note-list">${(scenario.instructions || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>No extra instructions.</li>'}</ul>`,
        '<div style="margin:0.75rem 0 0.35rem; color:#87CEEB;">Deliverables</div>',
        `<ul class="skills-lab-note-list">${(scenario.deliverables || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>No deliverables listed.</li>'}</ul>`,
        '<div style="margin:0.75rem 0 0.35rem; color:#87CEEB;">Assertions</div>',
        `<ul class="skills-lab-note-list">${(scenario.assertions || []).map((item) => `<li>[${escapeHtml(item.severity || 'important')}] ${escapeHtml(item.label)}</li>`).join('') || '<li>No assertions configured.</li>'}</ul>`
      ];

      els.scenarioSpec.innerHTML = sections.join('');
    }

    function statusClassFor(run) {
      if (!run) return '';
      if (run.status === 'running') return 'running';
      if (run.verdict === 'PASS' || run.score?.verdict === 'PASS') return 'pass';
      if (run.verdict === 'PARTIAL' || run.score?.verdict === 'PARTIAL') return 'partial';
      return 'fail';
    }

    function renderStatus() {
      const running = state.status.running;
      els.status.className = `skills-lab-status ${statusClassFor(running)}`.trim();

      if (running) {
        els.status.innerHTML = `
          <strong>Running:</strong> ${escapeHtml(running.skillTitle)} / ${escapeHtml(running.scenarioTitle)}<br>
          <strong>Mode:</strong> ${escapeHtml(running.mode)} | <strong>Model:</strong> ${escapeHtml(running.model)}<br>
          <strong>Started:</strong> ${escapeHtml(fmtTime(running.startedAt))}<br>
          <strong>Workspace:</strong> ${escapeHtml((running.workspaceFiles || []).join(', ') || '--')}<br>
          <strong>Trace Events:</strong> ${escapeHtml(running.eventCount)}
        `;
        return;
      }

      const run = state.selectedRun;
      if (run) {
        els.status.className = `skills-lab-status ${statusClassFor(run)}`.trim();
        els.status.innerHTML = `
          <strong>Last verdict:</strong> ${escapeHtml(run.score?.verdict || run.status || 'unknown')}<br>
          <strong>Scenario:</strong> ${escapeHtml(run.scenarioTitle)}<br>
          <strong>Summary:</strong> ${escapeHtml(run.score?.summary || run.error || 'No summary')}<br>
          <strong>Completed:</strong> ${escapeHtml(fmtTime(run.completedAt || run.startedAt))}
        `;
        return;
      }

      els.status.innerHTML = 'No Skills Lab run selected.';
    }

    function renderAssertions() {
      const run = state.selectedRun;
      if (!run || !run.score || !Array.isArray(run.score.assertions)) {
        els.assertions.innerHTML = 'No scored run selected.';
        return;
      }

      els.assertions.innerHTML = run.score.assertions.map((item) => {
        const klass = item.passed ? 'pass' : item.severity === 'important' ? 'partial' : 'fail';
        const verdict = item.passed ? 'PASS' : item.severity.toUpperCase();
        return `
          <div class="assertion-item ${klass}">
            <span class="assertion-label">${escapeHtml(item.label)} <span style="color:#777">[${escapeHtml(verdict)}]</span></span>
            <div class="assertion-detail">${escapeHtml(item.detail)}</div>
          </div>
        `;
      }).join('');
    }

    function renderHistory() {
      const runs = state.status.recentRuns || [];
      if (runs.length === 0) {
        els.history.innerHTML = 'No runs yet.';
        return;
      }

      els.history.innerHTML = '';
      runs.forEach((run) => {
        const button = document.createElement('button');
        button.className = `skill-history-item${state.selectedRun?.runId === run.runId ? ' active' : ''}`;
        button.innerHTML = `
          <span class="skill-history-title">${escapeHtml(run.skillTitle)} / ${escapeHtml(run.scenarioTitle)}</span>
          <span class="skill-history-meta">${escapeHtml(run.status)} | ${escapeHtml(run.verdict || 'pending')} | ${escapeHtml(fmtTime(run.startedAt))}</span>
          <span class="skill-history-meta">${escapeHtml(run.summary || '')}</span>
        `;
        button.addEventListener('click', () => {
          loadRun(run.runId);
        });
        els.history.appendChild(button);
      });
    }

    function renderSummary() {
      const run = state.selectedRun;
      if (!run) {
        els.summary.innerHTML = 'No run selected.';
        return;
      }

      const rows = [
        ['Run ID', run.runId],
        ['Status', run.status],
        ['Verdict', run.score?.verdict || '--'],
        ['Started', fmtTime(run.startedAt)],
        ['Completed', fmtTime(run.completedAt)],
        ['Duration', fmtDuration(run.durationMs)],
        ['Workspace', run.workspaceDir || '--'],
        ['Files', (run.workspaceFiles || []).join(', ') || '--'],
        ['Event Count', String(run.events?.length || 0)],
        ['Trace Entries', String(run.trace?.length || 0)],
        ['Raw Output Lines', String(run.rawOutput?.length || 0)],
        ['Error', run.error || '--']
      ];

      els.summary.innerHTML = `<div class="skills-lab-kv">${rows.map(([label, value]) => `
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
      `).join('')}</div>`;
    }

    function formatTraceEntry(entry) {
      if (entry.kind === 'tool_use') {
        return {
          kind: 'tool_use',
          message: `${entry.name || 'unknown'} ${previewValue(entry.input || {}, 140)}`
        };
      }
      if (entry.kind === 'thinking') {
        return {
          kind: 'thinking',
          message: entry.text || ''
        };
      }
      if (entry.kind === 'assistant_text') {
        return {
          kind: 'assistant_text',
          message: entry.text || ''
        };
      }
      if (entry.kind === 'tool_result') {
        return {
          kind: 'tool_result',
          message: entry.text || ''
        };
      }
      if (entry.kind === 'result') {
        return {
          kind: entry.isError ? 'error' : 'start',
          message: `turns=${entry.turns ?? '--'} duration=${entry.durationMs ?? '--'}ms cost=${entry.costUsd ?? '--'}`
        };
      }
      return {
        kind: entry.type || 'stdout',
        message: entry.line || ''
      };
    }

    function renderTrace() {
      const run = state.selectedRun;
      if (!run) {
        els.trace.textContent = 'No trace yet.';
        return;
      }

      const source = Array.isArray(run.trace) && run.trace.length > 0
        ? run.trace
        : Array.isArray(run.events)
          ? run.events
          : [];

      if (source.length === 0) {
        els.trace.textContent = 'No trace yet.';
        return;
      }

      els.trace.innerHTML = source.map((item) => {
        const traceItem = formatTraceEntry(item);
        const timestamp = item.timestamp || item.startedAt || null;
        return `
          <div class="skill-trace-line">
            <span class="skill-trace-ts">${escapeHtml(fmtTime(timestamp))}</span>
            <span class="skill-trace-kind">${escapeHtml(traceItem.kind)}</span>
            <span class="skill-trace-msg type-${escapeHtml(traceItem.kind)}">${escapeHtml(traceItem.message)}</span>
          </div>
        `;
      }).join('');
      els.trace.scrollTop = els.trace.scrollHeight;
    }

    function buildPromptPreview() {
      const skill = getSelectedSkill();
      const scenario = getSelectedScenario();
      if (!skill || !scenario) return 'No scenario selected.';

      return [
        `Skill: ${skill.title}`,
        `Scenario: ${scenario.title}`,
        `Mode: ${els.mode.value}`,
        `Model: ${els.model.value}`,
        `Budget: $${Number.isFinite(parseBudgetValue()) ? parseBudgetValue().toFixed(2) : 'invalid'}`,
        '',
        scenario.summary || '',
        '',
        'Instructions:',
        ...(scenario.instructions || []).map((line) => `- ${line}`),
        '',
        'Deliverables:',
        ...(scenario.deliverables || []).map((line) => `- ${line}`),
        '',
        'Assertions:',
        ...(scenario.assertions || []).map((item) => `- [${item.severity || 'important'}] ${item.label}`)
      ].join('\n').trim();
    }

    function renderPrompt() {
      const run = state.selectedRun;
      els.prompt.textContent = run?.prompt || buildPromptPreview();
    }

    function renderOutput() {
      const run = state.selectedRun;
      if (!run) {
        els.output.textContent = 'No run selected.';
        return;
      }

      const text = run.assistantText || run.error || 'No assistant text captured.';
      els.output.textContent = text;
    }

    function renderAll() {
      renderMeta();
      renderScenarioSpec();
      renderStatus();
      renderAssertions();
      renderHistory();
      renderSummary();
      renderPrompt();
      renderTrace();
      renderOutput();
      updateButtons();
    }

    function updateButtons() {
      const skill = getSelectedSkill();
      const scenario = getSelectedScenario();
      const running = !!state.status.running;
      const validBudget = Number.isFinite(parseBudgetValue()) && parseBudgetValue() > 0;

      els.run.disabled = running || !skill || !scenario || !validBudget;
      els.cancel.classList.toggle('visible', running);
      els.cancel.disabled = !running;
    }

    function updateTimer() {
      const running = state.status.running;
      if (!running || !running.startedAt) {
        els.timer.classList.remove('active');
        return;
      }

      const timeoutMs = 7 * 60 * 1000;
      const startedAt = new Date(running.startedAt).getTime();
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, (elapsed / timeoutMs) * 100);

      els.timer.classList.add('active');
      els.timerLabel.textContent = `${running.skillTitle} / ${running.scenarioTitle}`;
      els.timerElapsed.textContent = `${fmtDuration(elapsed)} / 7:00`;
      els.timerFill.style.width = `${pct}%`;
      els.timerFill.style.background = pct > 80 ? '#ff4d4d' : pct > 60 ? '#ff7900' : 'var(--accent)';
    }

    function mergeLiveEntry(runId, entry) {
      if (!state.selectedRun || state.selectedRun.runId !== runId) return;
      if (!Array.isArray(state.selectedRun.events)) state.selectedRun.events = [];
      state.selectedRun.events.push(entry);
      renderTrace();
      renderSummary();
    }

    function syncStatus(status) {
      state.status = status || { running: null, recentRuns: [] };
      renderAll();
      updateTimer();
    }

    function syncSelectionToRun(run) {
      const skillExists = state.skills.some((skill) => skill.id === run.skillId);
      if (!skillExists) return;

      state.selectedSkillId = run.skillId;
      els.skill.value = run.skillId;
      renderScenarioOptions();

      const scenarioExists = getSelectedSkill()?.scenarios.some((scenario) => scenario.id === run.scenarioId);
      if (scenarioExists) {
        state.selectedScenarioId = run.scenarioId;
        els.scenario.value = run.scenarioId;
      }
    }

    function loadRun(runId) {
      return fetchJson(`/api/skill-tests/runs/${encodeURIComponent(runId)}`).then((run) => {
        syncSelectionToRun(run);
        state.selectedRun = run;
        renderAll();
      }).catch((err) => {
        els.output.textContent = `Failed to load run: ${err.message}`;
      });
    }

    function refreshRegistry() {
      return fetchJson('/api/skill-tests').then((payload) => {
        state.skills = payload.skills || [];
        const selectedStillExists = state.skills.some((skill) => skill.id === state.selectedSkillId);
        if (!selectedStillExists) state.selectedSkillId = '';
        renderSkillOptions();
        syncStatus(payload.status || { running: null, recentRuns: [] });

        if (!state.selectedRun && payload.status?.recentRuns?.length) {
          return loadRun(payload.status.recentRuns[0].runId);
        }

        return null;
      }).catch((err) => {
        setRegistryError(err);
      });
    }

    els.skill.addEventListener('change', () => {
      state.selectedSkillId = els.skill.value;
      state.selectedRun = null;
      applySkillDefaults(getSelectedSkill());
      renderScenarioOptions();
    });

    els.scenario.addEventListener('change', () => {
      state.selectedScenarioId = els.scenario.value;
      state.selectedRun = null;
      renderAll();
    });

    els.mode.addEventListener('change', () => {
      state.selectedRun = null;
      renderAll();
    });
    els.model.addEventListener('change', () => {
      state.selectedRun = null;
      renderAll();
    });
    els.budget.addEventListener('input', () => {
      state.selectedRun = null;
      renderAll();
    });

    els.run.addEventListener('click', () => {
      const skill = getSelectedSkill();
      const scenario = getSelectedScenario();
      const budget = parseBudgetValue();
      if (!skill || !scenario || !Number.isFinite(budget) || budget <= 0) return;

      els.run.disabled = true;
      postJson('/api/skill-tests/run', {
        skillId: skill.id,
        scenarioId: scenario.id,
        mode: els.mode.value,
        model: els.model.value,
        budget
      }).then((result) => {
        if (!result.ok) throw new Error(result.error || 'Run failed');
        return refreshRegistry().then(() => loadRun(result.runId));
      }).catch((err) => {
        els.status.className = 'skills-lab-status fail';
        els.status.textContent = `Failed to start Skills Lab run: ${err.message}`;
      }).finally(() => {
        updateButtons();
      });
    });

    els.cancel.addEventListener('click', () => {
      els.cancel.disabled = true;
      postJson('/api/skill-tests/cancel', {}).then((result) => {
        if (!result.ok) throw new Error(result.error || 'Cancel failed');
        return refreshRegistry();
      }).catch((err) => {
        els.status.className = 'skills-lab-status fail';
        els.status.textContent = `Failed to cancel Skills Lab run: ${err.message}`;
      }).finally(() => {
        els.cancel.disabled = false;
      });
    });

    const evtSource = new EventSource('/events');
    evtSource.addEventListener('skill-test-start', (event) => {
      try {
        const payload = JSON.parse(event.data);
        refreshRegistry().then(() => loadRun(payload.runId));
      } catch {
        // ignore malformed event
      }
    });

    evtSource.addEventListener('skill-test-log', (event) => {
      try {
        const payload = JSON.parse(event.data);
        mergeLiveEntry(payload.runId, payload.entry);
      } catch {
        // ignore malformed event
      }
    });

    evtSource.addEventListener('skill-test-complete', (event) => {
      try {
        const payload = JSON.parse(event.data);
        refreshRegistry().then(() => loadRun(payload.runId));
      } catch {
        // ignore malformed event
      }
    });

    setInterval(() => {
      fetchJson('/api/skill-tests/status').then(syncStatus).catch(() => {});
    }, 20000);

    setInterval(updateTimer, 1000);

    refreshRegistry();
  });
})();
