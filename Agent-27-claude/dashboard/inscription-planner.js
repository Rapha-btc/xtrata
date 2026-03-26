(function () {
    const CHUNK_SIZE = 16384;
    const HELPER_LIMIT = 30;
    const ACTIVE_REFRESH_MS = 120000;

    const els = {
        refreshStamp: document.getElementById('refresh-stamp'),
        heroRelease: document.getElementById('hero-release'),
        heroRoot: document.getElementById('hero-root'),
        heroNext: document.getElementById('hero-next'),
        heroHardStops: document.getElementById('hero-hard-stops'),
        heroPaths: document.getElementById('hero-paths'),
        viewBvst: document.getElementById('view-bvst'),
        viewCanary: document.getElementById('view-canary'),
        runReleaseGate: document.getElementById('run-canary-gate'),
        startReleaseInscription: document.getElementById('start-canary-inscription'),
        snapshotCards: document.getElementById('snapshot-cards'),
        costCards: document.getElementById('cost-cards'),
        costPriorityNote: document.getElementById('cost-priority-note'),
        costNote: document.getElementById('cost-note'),
        timeCards: document.getElementById('time-cards'),
        nextActionPanel: document.getElementById('next-action-panel'),
        readyQueue: document.getElementById('ready-queue'),
        batchTimeline: document.getElementById('batch-timeline'),
        automationSummary: document.getElementById('automation-summary'),
        automationNote: document.getElementById('automation-note'),
        automationFiles: document.getElementById('automation-files'),
        automationLog: document.getElementById('automation-log'),
        safetySummary: document.getElementById('safety-summary'),
        safetySections: document.getElementById('safety-sections'),
        runtimeFiles: document.getElementById('runtime-files'),
        plannerDocs: document.getElementById('planner-docs'),
        intakeChecklist: document.getElementById('intake-checklist'),
        refreshRelease: document.getElementById('refresh-release'),
        filePicker: document.getElementById('file-picker'),
        directoryPicker: document.getElementById('directory-picker'),
        clearUpload: document.getElementById('clear-upload'),
        uploadSummary: document.getElementById('upload-summary'),
        uploadLargest: document.getElementById('upload-largest'),
        uploadStructure: document.getElementById('upload-structure'),
        canaryAchievement: document.getElementById('canary-achievement'),
        achievementNarrative: document.getElementById('achievement-narrative'),
        achievementStatus: document.getElementById('achievement-status'),
        achievementStats: document.getElementById('achievement-stats'),
        achievementGraph: document.getElementById('achievement-graph'),
        achievementBatches: document.getElementById('achievement-batches'),
        bvstAchievement: document.getElementById('bvst-achievement'),
        bvstAchievementTitle: document.getElementById('bvst-achievement-title'),
        bvstAchievementNarrative: document.getElementById('bvst-achievement-narrative'),
        bvstAchievementStatus: document.getElementById('bvst-achievement-status'),
        bvstAchievementStats: document.getElementById('bvst-achievement-stats'),
        bvstAchievementWhat: document.getElementById('bvst-achievement-what'),
        bvstAchievementHow: document.getElementById('bvst-achievement-how'),
        bvstAchievementWhy: document.getElementById('bvst-achievement-why'),
        bvstAchievementGraph: document.getElementById('bvst-achievement-graph'),
        bvstAchievementBatches: document.getElementById('bvst-achievement-batches'),
        depGraphSection: document.getElementById('dependency-graph-section'),
        depGraphContainer: document.getElementById('dep-graph-container'),
        depGraphSub: document.getElementById('dep-graph-sub'),
        depGraphLegend: document.getElementById('dep-graph-legend')
    };

    const state = {
        selectedRelease: new URLSearchParams(window.location.search).get('release') || 'bvst-first-wave',
        release: null,
        selectedFiles: [],
        refreshTimer: null,
        refreshInterval: null,
        releaseLoadPromise: null
    };

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function formatNumber(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
        return Number(value).toLocaleString();
    }

    function formatBytes(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
        const bytes = Number(value);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function formatStx(value) {
        if (value === null || value === undefined || value === '') return '--';
        const num = Number(value);
        if (!Number.isFinite(num)) return '--';
        return `${num.toLocaleString(undefined, { maximumFractionDigits: 6 })} STX`;
    }

    function formatUsd(value) {
        if (value === null || value === undefined || value === '') return '--';
        const num = Number(value);
        if (!Number.isFinite(num)) return '--';
        return `$${num.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
    }

    function formatTraceEntry(entry, prefix) {
        if (!entry) return null;
        if (entry.raw) return `${prefix} ${entry.raw}`;
        const at = formatDate(entry.at);
        const artifact = entry.artifact ? ` [${entry.artifact}]` : '';
        const summary = entry.summary || entry.type || 'trace';
        return `${prefix} [${at}] ${summary}${artifact}`;
    }

    function formatDate(value) {
        if (!value) return '--';
        const date = new Date(value);
        if (Number.isNaN(date.valueOf())) return value;
        const formatter = new Intl.DateTimeFormat('en-GB', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC'
        });
        return `${formatter.format(date)} UTC`;
    }

    function chunkCount(bytes) {
        return bytes === 0 ? 0 : Math.ceil(bytes / CHUNK_SIZE);
    }

    function routeForBytes(bytes) {
        return chunkCount(bytes) <= HELPER_LIMIT ? 'helper' : 'staged';
    }

    function estimateProtocolFeeStx(bytes, feeUnitMicroStx) {
        if (!feeUnitMicroStx) return null;
        const chunks = chunkCount(bytes);
        const begin = Number(feeUnitMicroStx);
        const seal = begin * (1 + Math.ceil(chunks / 50));
        return (begin + seal) / 1e6;
    }

    function computeTimeHeuristic(steps) {
        const helperCount = steps.filter(step => step.route === 'helper').length;
        const stagedCount = steps.filter(step => step.route === 'staged').length;
        const lowMinutes = helperCount * 0.75 + stagedCount * 2.5;
        const highMinutes = helperCount * 1.5 + stagedCount * 5;
        return {
            helperCount,
            stagedCount,
            lowMinutes,
            highMinutes
        };
    }

    function shortPath(value, segments = 3) {
        if (!value) return '--';
        const normalized = String(value).replaceAll('\\', '/');
        const parts = normalized.split('/').filter(Boolean);
        if (parts.length <= segments) return normalized;
        return `.../${parts.slice(-segments).join('/')}`;
    }

    function renderCopyButton(text, label, className = 'mini-action') {
        if (!text) return '';
        return `<button type="button" class="${className}" data-copy="${escapeHtml(encodeURIComponent(text))}" data-copy-label="${escapeHtml(label)}" title="${escapeHtml(text)}">${escapeHtml(label)}</button>`;
    }

    function renderPathChip(path, options = {}) {
        if (!path) return '';
        const segments = options.segments || 3;
        const label = options.label || shortPath(path, segments);
        return `<button type="button" class="chip chip-button" data-copy="${escapeHtml(encodeURIComponent(path))}" data-copy-label="Copy Path" title="${escapeHtml(path)}">${escapeHtml(label)}</button>`;
    }

    function classifyBlockedReason(item) {
        const notes = item?.notes || [];
        if (notes.some(note => note.includes('Prerequisite batches are not complete'))) return 'locked';
        if (notes.some(note => note.includes('Rendered catalog is not ready yet'))) return 'render';
        if (notes.some(note => note.includes('Direct dependencies are not fully resolved yet'))) return 'dependencies';
        return 'other';
    }

    function extractPrerequisiteBatches(item) {
        const notes = item?.notes || [];
        const matches = [];
        for (const note of notes) {
            const match = note.match(/Prerequisite batches are not complete:\s*(.+?)\.$/);
            if (!match) continue;
            const batches = match[1].split(',').map(value => value.trim()).filter(Boolean);
            matches.push(...batches);
        }
        return matches;
    }

    function formatPathValue(path, segments = 4) {
        if (!path) return '--';
        return `<span title="${escapeHtml(path)}">${escapeHtml(shortPath(path, segments))}</span>`;
    }

    function getArtifactPricing(data, name) {
        return data?.pricing?.artifactsByName?.[name] || null;
    }

    function getBatchPricing(data, batchName) {
        return data?.pricing?.batchesByName?.[batchName] || null;
    }

    function summarizePricing(pricing) {
        const batches = Object.values(pricing?.batchesByName || {});
        return batches.reduce((summary, batch) => {
            summary.protocolFeeStx += Number(batch.protocolFeeStx || 0);
            summary.liveMiningStx += Number(batch.liveMiningStx || 0);
            summary.totalProjectedStx += Number(batch.totalProjectedStx || 0);
            summary.artifactCount += Number(batch.artifactCount || 0);
            summary.liveEstimatedCount += Number(batch.liveEstimatedCount || 0);
            return summary;
        }, {
            protocolFeeStx: 0,
            liveMiningStx: 0,
            totalProjectedStx: 0,
            artifactCount: 0,
            liveEstimatedCount: 0
        });
    }

    function renderPricingChips(pricing, options = {}) {
        if (!pricing) return '';
        const labelPrefix = options.labelPrefix || '';
        const prefix = labelPrefix ? `${labelPrefix} ` : '';
        const chips = [];
        if (pricing.protocolFeeStx !== null && pricing.protocolFeeStx !== undefined) {
            chips.push(`<span class="chip chip-cost">${escapeHtml(`${prefix}Protocol ${formatStx(pricing.protocolFeeStx)}`)}</span>`);
        }
        if (pricing.liveEstimateAvailable) {
            chips.push(`<span class="chip chip-cost live">${escapeHtml(`${prefix}Mining ${formatStx(pricing.liveMiningStx)}`)}</span>`);
        } else if (options.includeUnavailable) {
            chips.push(`<span class="chip chip-cost warn">${escapeHtml(`${prefix}Mining Live N/A`)}</span>`);
        }
        if (pricing.totalProjectedStx !== null && pricing.totalProjectedStx !== undefined) {
            chips.push(`<span class="chip chip-cost total">${escapeHtml(`${prefix}Total ${formatStx(pricing.totalProjectedStx)}`)}</span>`);
        }
        if (options.includeCoverage && pricing.artifactCount) {
            if (pricing.nonLiveCount > 0) {
                chips.push(`<span class="chip chip-cost warn">${escapeHtml(`live coverage ${pricing.liveEstimatedCount}/${pricing.artifactCount}`)}</span>`);
            } else {
                chips.push(`<span class="chip chip-cost">${escapeHtml(`live coverage ${pricing.liveEstimatedCount}/${pricing.artifactCount}`)}</span>`);
            }
        }
        if (options.includeBytes && pricing.serializedBytes) {
            chips.push(`<span class="chip">${escapeHtml(`tx bytes ${formatNumber(pricing.serializedBytes)}`)}</span>`);
        }
        return chips.join('');
    }

    async function copyText(text) {
        if (!text) return false;
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        const probe = document.createElement('textarea');
        probe.value = text;
        probe.setAttribute('readonly', 'readonly');
        probe.style.position = 'absolute';
        probe.style.left = '-9999px';
        document.body.appendChild(probe);
        probe.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(probe);
        return copied;
    }

    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    }

    async function postJson(url) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed: ${response.status}`);
        }
        return response.json();
    }

    function updateReleaseUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set('release', state.selectedRelease);
        window.history.replaceState({}, '', url);
    }

    function setSelectedRelease(releaseId) {
        state.selectedRelease = releaseId;
        updateReleaseUrl();
    }

    async function loadReleaseData(options = {}) {
        if (state.releaseLoadPromise) return state.releaseLoadPromise;
        const silent = options.silent === true;
        if (!silent) {
            els.refreshStamp.textContent = 'Refreshing release data...';
        }
        state.releaseLoadPromise = fetchJson(`/api/inscription-planner/current-release?release=${encodeURIComponent(state.selectedRelease)}`)
            .then((data) => {
                state.release = data;
                renderRelease();
                return data;
            })
            .finally(() => {
                state.releaseLoadPromise = null;
            });
        return state.releaseLoadPromise;
    }

    function renderHero(data) {
        const status = data.status || {};
        const quote = data.quote || {};
        const nextReady = status.next_ready;

        els.refreshStamp.textContent = `Active release refreshed ${formatDate(data.generatedAt)}`;
        els.heroRelease.textContent = data.currentRelease?.name || '--';
        els.heroRoot.textContent = shortPath(data.currentRelease?.bundleRoot, 4);
        els.heroRoot.title = data.currentRelease?.bundleRoot || '';
        els.heroNext.textContent = nextReady ? nextReady.name : 'No ready artifact';
        els.heroHardStops.textContent = formatNumber(status.summary?.hard_stop || 0);

        const chips = [
            data.paths?.quote,
            data.paths?.status,
            data.paths?.safety
        ].filter(Boolean);
        els.heroPaths.innerHTML = chips.map(path => renderPathChip(path, { segments: 2 })).join('');
        els.viewBvst.classList.toggle('active', data.selectedRelease === 'bvst-first-wave');
        els.viewCanary.classList.toggle('active', data.selectedRelease === 'xtrata-canary');
        els.runReleaseGate.hidden = !data.plannerActions?.releaseRunnable;
        els.runReleaseGate.disabled = !data.plannerActions?.releaseRunEnabled;
        els.runReleaseGate.textContent = data.plannerActions?.releaseRunLabel || 'Run Release Gate';
        els.runReleaseGate.title = data.plannerActions?.releaseRunDisabledReason || '';
        els.startReleaseInscription.hidden = false;
        els.startReleaseInscription.disabled = !data.plannerActions?.releaseInscribeAvailable || !data.plannerActions?.releaseInscribeEnabled;
        els.startReleaseInscription.title = data.plannerActions?.releaseInscribeDisabledReason || (data.plannerActions?.releaseInscribeAvailable ? '' : 'Release is not auto-inscribeable — check that all modules use the helper route');
        if (data.automation?.activeRun) {
            els.startReleaseInscription.textContent = data.plannerActions?.releaseInscribeRunningLabel || 'Inscription Running';
        } else {
            els.startReleaseInscription.textContent = data.plannerActions?.releaseInscribeLabel || 'Inscribe Release';
        }
    }

    function renderSnapshot(data) {
        const quote = data.quote || {};
        const status = data.status || {};
        const verification = quote.verification || {};
        const steps = quote.execution?.steps || [];
        const routeCounts = verification.routeCounts || {};
        const leafCount = steps.filter(step => step.kind === 'leaf').length;
        const catalogCount = steps.filter(step => step.kind === 'catalog').length;
        const predicted = quote.quote?.predictedTokenRange;

        const cards = [
            {
                label: 'Artifacts',
                value: formatNumber(verification.moduleCount),
                subvalue: `${formatNumber(leafCount)} leaves / ${formatNumber(catalogCount)} catalogs`
            },
            {
                label: 'Bundle Size',
                value: formatBytes(verification.totalBytes),
                subvalue: `${formatNumber(verification.totalBytes)} bytes`
            },
            {
                label: 'Ready Now',
                value: formatNumber(status.summary?.ready),
                subvalue: `${formatNumber(status.summary?.blocked)} blocked / ${formatNumber(status.summary?.hard_stop)} hard-stop`
            },
            {
                label: 'Routes',
                value: `${formatNumber(routeCounts.helper || 0)} helper`,
                subvalue: `${formatNumber(routeCounts.staged || 0)} staged`
            },
            {
                label: 'Predicted Token Window',
                value: predicted ? `${predicted.start}–${predicted.end}` : '--',
                subvalue: quote.quote?.lastTokenId ? `last token ${quote.quote.lastTokenId}` : 'planning only'
            },
            {
                label: 'Duplicates',
                value: formatNumber(quote.quote?.duplicateCount),
                subvalue: 'dedupe checked during preflight'
            }
        ];

        els.snapshotCards.innerHTML = cards.map(card => `
            <div class="mini-stat accent">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');
    }

    function renderCosts(data) {
        const quote = data.quote?.quote || {};
        const pricingSummary = summarizePricing(data.pricing);
        const mining = quote.miningFee || {};
        const rough = mining.rough || {};
        const live = mining.live || {};
        const pricingBackfillAvailable = Boolean(data.pricing?.liveFeeRateMicroStxPerByte);
        const protocolStx = quote.protocolFeeStx !== null && quote.protocolFeeStx !== undefined
            ? Number(quote.protocolFeeStx || 0)
            : pricingSummary.protocolFeeStx;
        const liveMiningStx = live.available
            ? Number(live.estimatedStx || 0)
            : (pricingBackfillAvailable ? pricingSummary.liveMiningStx : null);
        const totalLive = live.available ? protocolStx + liveMiningStx : null;
        const effectiveTotal = live.available
            ? totalLive
            : (pricingBackfillAvailable ? pricingSummary.totalProjectedStx : protocolStx);
        const feeUnitLabel = quote.feeUnitStx !== null && quote.feeUnitStx !== undefined
            ? formatStx(quote.feeUnitStx)
            : formatStx(data.pricing?.feeUnitStx);
        const liveMiningSubvalue = live.available
            ? `${formatNumber(live.serializedBytesTotal)} serialized bytes at ${formatNumber(live.transferFeeRateMicroStxPerByte)} microSTX/byte`
            : (pricingBackfillAvailable
                ? `${formatNumber(pricingSummary.liveEstimatedCount)} helper tx estimates using the current BVST production fee snapshot`
                : (live.note || 'endpoint unavailable'));

        const cards = [
            {
                label: 'Projected Total',
                value: formatStx(effectiveTotal),
                subvalue: live.available
                    ? 'primary operator number: protocol + live mining estimate'
                    : (pricingBackfillAvailable
                        ? 'primary operator number using the BVST production fee snapshot'
                        : 'protocol only while live mining estimate is unavailable'),
                className: 'good'
            },
            {
                label: 'Live Mining Estimate',
                value: live.available || pricingBackfillAvailable ? formatStx(liveMiningStx) : 'Unavailable',
                subvalue: liveMiningSubvalue,
                className: 'accent'
            },
            {
                label: 'Protocol Fee',
                value: formatStx(protocolStx),
                subvalue: quote.live
                    ? `exact for this snapshot at fee-unit ${feeUnitLabel}`
                    : `derived at fee-unit ${feeUnitLabel}`,
                className: 'accent'
            },
            {
                label: 'Rough Mining Fallback',
                value: formatUsd(rough.estimatedUsd),
                subvalue: `coarse fallback only • ${formatBytes(rough.bytes)} at $1/MB`,
                className: 'warn'
            }
        ];

        els.costCards.innerHTML = cards.map((card, index) => `
            <div class="mini-stat ${card.className || 'accent'}">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');

        if (live.available) {
            els.costPriorityNote.className = 'notice good';
            els.costPriorityNote.textContent = 'Use the live mining estimate operationally. The $1/MB figure is only a rough directional fallback and is not directly comparable to the live STX estimate without a current STX/USD rate.';
        } else if (pricingBackfillAvailable) {
            els.costPriorityNote.className = 'notice warn';
            els.costPriorityNote.textContent = 'This release quote is offline, so live pricing is being overlaid from the current BVST production fee snapshot. That is suitable for canary planning, but refresh against a live quote before real minting.';
        } else {
            els.costPriorityNote.className = 'notice warn';
            els.costPriorityNote.textContent = 'Live mining data is unavailable, so the rough $1/MB fallback is only a planning placeholder until fee data can be refreshed.';
        }
        els.costNote.textContent = quote.note || 'No quote note available.';
    }

    function renderTimeHeuristic(data) {
        const steps = data.quote?.execution?.steps || [];
        const heuristic = computeTimeHeuristic(steps);
        const low = heuristic.lowMinutes;
        const high = heuristic.highMinutes;
        const cards = [
            {
                label: 'Operator-Active Range',
                value: `${low.toFixed(0)}–${high.toFixed(0)} min`,
                subvalue: 'wallet signing + broadcast cadence'
            },
            {
                label: 'Helper Transactions',
                value: formatNumber(heuristic.helperCount),
                subvalue: 'single-tx recursive/helper path'
            },
            {
                label: 'Staged Transactions',
                value: formatNumber(heuristic.stagedCount),
                subvalue: 'currently zero in the frozen bundle'
            },
            {
                label: 'Heuristic Basis',
                value: '0.75–1.5 min/helper',
                subvalue: '2.5–5 min/staged item'
            }
        ];
        els.timeCards.innerHTML = cards.map(card => `
            <div class="mini-stat">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');
    }

    function renderNextAction(data) {
        const nextReady = data.status?.next_ready;
        if (!nextReady) {
            els.nextActionPanel.className = 'empty-state';
            els.nextActionPanel.textContent = 'No mintable artifact is currently available.';
            return;
        }
        const pricing = getArtifactPricing(data, nextReady.name);
        const pricingChips = renderPricingChips(pricing, { includeUnavailable: true, includeBytes: true });

        els.nextActionPanel.className = '';
        els.nextActionPanel.innerHTML = `
            <div class="queue-item">
                <div class="queue-top">
                    <div class="queue-name">${escapeHtml(nextReady.name)}</div>
                    <div class="status-pill ready">${escapeHtml(nextReady.execution?.function || nextReady.route)}</div>
                </div>
                <div class="kv-list">
                    <div class="label">Batch</div><div class="value">${escapeHtml(nextReady.batch)}</div>
                    <div class="label">Source</div><div class="value">${formatPathValue(nextReady.source?.logical_path || '--')}</div>
                    <div class="label">Size</div><div class="value">${formatBytes(nextReady.source?.bytes)} / ${formatNumber(nextReady.source?.chunks)} chunks</div>
                    <div class="label">Dependencies</div><div class="value">${nextReady.execution?.recursive_dependencies?.length ? escapeHtml(nextReady.execution.recursive_dependencies.join(', ')) : 'None'}</div>
                    <div class="label">SHA-256</div><div class="value">${escapeHtml(nextReady.source?.sha256 || '--')}</div>
                </div>
                ${pricingChips ? `<div class="chip-row">${pricingChips}</div>` : ''}
                <div class="action-row">
                    ${renderCopyButton(nextReady.source?.absolute_path || nextReady.source?.logical_path, 'Copy Source Path')}
                    ${renderCopyButton(nextReady.execution?.apply_result_command, 'Copy Record Command')}
                </div>
                <div style="margin-top: 0.8rem;" class="tiny-label">Record Result After Mint</div>
                <div style="margin-top: 0.45rem;" class="code">${escapeHtml(nextReady.execution?.apply_result_command || '--')}</div>
            </div>
        `;
    }

    function renderReadyQueue(data) {
        const ready = data.status?.ready_now || [];
        if (ready.length === 0) {
            els.readyQueue.innerHTML = '<div class="empty-state">No artifacts are ready right now.</div>';
            return;
        }
        els.readyQueue.innerHTML = ready.slice(0, 8).map(item => {
            const pricingChips = renderPricingChips(getArtifactPricing(data, item.name), { includeUnavailable: true });
            return `
                <div class="queue-item">
                    <div class="queue-top">
                        <div class="queue-name">${escapeHtml(item.name)}</div>
                        <div class="status-pill ready">${escapeHtml(item.execution?.function || item.route)}</div>
                    </div>
                    <div class="kv-list">
                        <div class="label">Batch</div><div class="value">${escapeHtml(item.batch)}</div>
                        <div class="label">Source</div><div class="value">${formatPathValue(item.source?.logical_path || '--')}</div>
                        <div class="label">Size</div><div class="value">${formatBytes(item.source?.bytes)} / ${formatNumber(item.source?.chunks)} chunks</div>
                        <div class="label">Dependency IDs</div><div class="value">${item.execution?.recursive_dependencies?.length ? escapeHtml(item.execution.recursive_dependencies.join(', ')) : 'None'}</div>
                    </div>
                    ${pricingChips ? `<div class="chip-row">${pricingChips}</div>` : ''}
                    <div class="action-row">
                        ${renderCopyButton(item.source?.absolute_path || item.source?.logical_path, 'Copy Source Path')}
                        ${renderCopyButton(item.execution?.apply_result_command, 'Copy Record Command')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderBatchTimeline(data) {
        const batches = data.quote?.execution?.orderedBatches || [];
        const items = data.status?.items || [];
        const byBatch = new Map();
        for (const item of items) {
            if (!byBatch.has(item.batch)) byBatch.set(item.batch, []);
            byBatch.get(item.batch).push(item);
        }

        els.batchTimeline.innerHTML = batches.map(batch => {
            const batchItems = byBatch.get(batch.file) || [];
            const minted = batchItems.filter(item => item.status === 'minted').length;
            const ready = batchItems.filter(item => item.status === 'ready').length;
            const blocked = batchItems.filter(item => item.status === 'blocked').length;
            const hardStop = batchItems.filter(item => item.status === 'hard-stop').length;
            const locked = batchItems.filter(item => item.status === 'blocked' && classifyBlockedReason(item) === 'locked').length;
            const dependencyBlocked = batchItems.filter(item => item.status === 'blocked' && classifyBlockedReason(item) === 'dependencies').length;
            const renderBlocked = batchItems.filter(item => item.status === 'blocked' && classifyBlockedReason(item) === 'render').length;
            const otherBlocked = Math.max(0, blocked - locked - dependencyBlocked - renderBlocked);
            const completion = batch.artifactCount ? (minted / batch.artifactCount) * 100 : 0;
            const prerequisiteBatches = [...new Set(batchItems.flatMap(extractPrerequisiteBatches))];
            const chips = [
                `${formatNumber(ready)} ready`,
                locked ? `${formatNumber(locked)} locked` : null,
                dependencyBlocked ? `${formatNumber(dependencyBlocked)} dependency-pending` : null,
                renderBlocked ? `${formatNumber(renderBlocked)} render-pending` : null,
                otherBlocked ? `${formatNumber(otherBlocked)} blocked` : null,
                `${formatNumber(hardStop)} hard-stop`
            ].filter(Boolean);
            const pricing = getBatchPricing(data, batch.file);
            const pricingChips = renderPricingChips(pricing, { includeUnavailable: true, includeCoverage: true });
            return `
                <div class="batch-item">
                    <div class="batch-top">
                        <div>
                            <div class="batch-name">${escapeHtml(batch.release)}</div>
                            <div class="muted" style="font-size:12px; margin-top:0.25rem;">${escapeHtml(batch.file)} • ${formatNumber(batch.artifactCount)} artifacts • ${formatBytes(batch.bytes)}</div>
                        </div>
                        <div class="status-pill">${escapeHtml(`${minted}/${batch.artifactCount} minted`)}</div>
                    </div>
                    ${pricingChips ? `<div class="chip-row">${pricingChips}</div>` : ''}
                    <div class="progress-bar"><div class="progress-fill" style="width:${completion.toFixed(2)}%;"></div></div>
                    <div class="chip-row">
                        ${chips.map(chip => `<span class="chip">${escapeHtml(chip)}</span>`).join('')}
                    </div>
                    ${prerequisiteBatches.length
                        ? `<div class="notice locked" style="margin-top:0.7rem;">Locked behind ${escapeHtml(prerequisiteBatches.join(', '))}.</div>`
                        : ''}
                </div>
            `;
        }).join('');
    }

    function renderSafety(data) {
        const safety = data.safety || {};
        const summary = safety.summary || {};
        const sections = safety.sections || [];

        const cards = [
            { label: 'Passed', value: formatNumber(summary.passed), className: 'good' },
            { label: 'Warnings', value: formatNumber(summary.passed_with_warnings), className: 'warn' },
            { label: 'Skipped', value: formatNumber(summary.skipped), className: 'warn' },
            { label: 'Failed', value: formatNumber(summary.failed), className: 'bad' }
        ];
        els.safetySummary.innerHTML = cards.map(card => `
            <div class="mini-stat ${card.className}">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
            </div>
        `).join('');

        els.safetySections.innerHTML = sections.map(section => {
            const reason = section.details?.reason;
            const message = reason || section.errors?.[0] || section.warnings?.[0] || 'No additional detail.';
            return `
                <div class="safety-item">
                    <div class="safety-top">
                        <div class="safety-name">${escapeHtml(section.name)}</div>
                        <div class="status-pill ${escapeHtml(section.status)}">${escapeHtml(section.status)}</div>
                    </div>
                    <div class="muted">${escapeHtml(message)}</div>
                </div>
            `;
        }).join('');
    }

    function renderAutomation(data) {
        const automation = data.automation || {};
        const guardrails = automation.guardrails || {};
        const runLog = automation.runLog || {};
        const activeRun = automation.activeRun;
        const signerConfigured = Boolean(automation.signerConfigured);
        const eventTail = Array.isArray(automation.eventTail) ? automation.eventTail : [];
        const chainTail = Array.isArray(automation.chainTail) ? automation.chainTail : [];
        const failureSnapshot = automation.failureSnapshot || null;
        const releaseName = data.currentRelease?.name || 'Selected release';
        const releaseInscribeLabel = data.plannerActions?.releaseInscribeLabel || 'Inscribe Release';
        const recentLogs = activeRun?.recentLogs?.length
            ? activeRun.recentLogs
            : (automation.lastRun?.recentLogs?.length ? automation.lastRun.recentLogs : []);
        const progress = runLog.summary || {};

        const cards = [
            {
                label: 'Signer',
                value: signerConfigured ? 'Configured' : 'Missing',
                subvalue: signerConfigured ? 'Agent 27 autonomous signer path is available' : 'no usable Agent 27 signer source detected for live auto-inscription',
                className: signerConfigured ? 'good' : 'warn'
            },
            {
                label: 'Runner State',
                value: activeRun ? 'Running' : (runLog.status || 'Idle'),
                subvalue: activeRun
                    ? `started ${formatDate(activeRun.startedAt)}`
                    : (runLog.started_at ? `last start ${formatDate(runLog.started_at)}` : 'no live run started yet'),
                className: activeRun ? 'accent' : ((runLog.status === 'failed') ? 'bad' : 'accent')
            },
            {
                label: 'Mint Progress',
                value: progress.minted !== undefined && progress.remaining !== undefined
                    ? `${formatNumber(progress.minted)} minted`
                    : '--',
                subvalue: progress.remaining !== undefined ? `${formatNumber(progress.remaining)} remaining` : 'waiting for run data',
                className: 'accent'
            },
            {
                label: 'Run Log',
                value: data.paths?.autoRunLog ? shortPath(data.paths.autoRunLog, 2) : '--',
                subvalue: 'machine-readable runner state',
                className: 'accent'
            },
            {
                label: 'Trace Events',
                value: formatNumber(runLog.debug?.events_logged || eventTail.length || 0),
                subvalue: data.paths?.autoEventLog ? shortPath(data.paths.autoEventLog, 2) : 'structured lifecycle trace',
                className: 'accent'
            },
            {
                label: 'Chain Checks',
                value: formatNumber(runLog.debug?.chain_observations_logged || chainTail.length || 0),
                subvalue: data.paths?.autoChainLog ? shortPath(data.paths.autoChainLog, 2) : 'read-only checks and tx observations',
                className: failureSnapshot ? 'warn' : 'accent'
            }
        ];
        if (data.selectedRelease === 'bvst-first-wave') {
            cards.push({
                label: 'Gate',
                value: guardrails.gatePassed ? (guardrails.gateFresh === false ? 'Stale' : 'Passed') : 'Refresh On Start',
                subvalue: guardrails.gateGeneratedAt
                    ? `last rehearsal ${formatDate(guardrails.gateGeneratedAt)}`
                    : 'BVST start reruns the release gate with a live quote',
                className: guardrails.gatePassed ? (guardrails.gateFresh === false ? 'warn' : 'good') : 'accent'
            });
            cards.push({
                label: 'Balance Guard',
                value: guardrails.balanceSufficient === false ? 'Blocked' : (guardrails.balanceSufficient === true ? 'Pass' : 'Pending'),
                subvalue: `observed ${formatStx(guardrails.observedBalanceStx)} / need ${formatStx(guardrails.requiredBalanceStx)}`,
                className: guardrails.balanceSufficient === false ? 'bad' : (guardrails.balanceSufficient === true ? 'good' : 'accent')
            });
        }

        els.automationSummary.innerHTML = cards.map(card => `
            <div class="mini-stat ${card.className || 'accent'}">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');

        if (!data.plannerActions?.releaseInscribeAvailable) {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = `${releaseName} is not auto-inscribeable with the current runner. Only helper-only release plans are supported.`;
        } else if (!signerConfigured) {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = 'The runner cannot find Agent 27\'s signer path. Restore the autonomous signer configuration before starting auto-inscription.';
        } else if (data.selectedRelease === 'bvst-first-wave' && guardrails.balanceSufficient === false) {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = `${releaseInscribeLabel} is blocked by the current STX balance. Observed ${formatStx(guardrails.observedBalanceStx)} versus guarded minimum ${formatStx(guardrails.requiredBalanceStx)} for the current BVST quote.`;
        } else if (activeRun) {
            els.automationNote.className = 'notice good';
            els.automationNote.textContent = `${releaseName} runner is active. It mints one artifact at a time, verifies the result on-chain, records the token ID/tx/block, re-renders dependent catalogs, rebuilds status, then proceeds to the next ready item.`;
        } else if (runLog.status === 'failed') {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = 'The last automation run failed. Review the structured event log, chain-observation log, and failure snapshot before retrying.';
        } else if (runLog.status === 'completed') {
            els.automationNote.className = 'notice good';
            els.automationNote.textContent = 'The last automation run completed successfully. The runner left both lifecycle events and chain-verification traces behind for audit and debugging.';
        } else if (data.selectedRelease === 'bvst-first-wave') {
            els.automationNote.className = 'notice';
            els.automationNote.textContent = 'The BVST path now uses a guarded start. Pressing the button reruns the BVST release gate with a live quote, checks the observed wallet balance against the projected spend with margin, then starts the dependency-aware mint loop if the release is clear to spend.';
        } else {
            els.automationNote.className = 'notice';
            els.automationNote.textContent = 'The one-click canary path is ready. It records append-only lifecycle events, chain observations, and a failure snapshot in addition to the run summary JSON.';
        }

        const debugFiles = [
            data.paths?.autoRunLog,
            data.paths?.autoEventLog,
            data.paths?.autoChainLog,
            data.paths?.autoFailureSnapshot
        ].filter(Boolean);
        els.automationFiles.innerHTML = debugFiles.length
            ? debugFiles.map(item => renderPathChip(item, { segments: 2 })).join('')
            : '<span class="chip">No debug files yet.</span>';

        const traceLines = [
            ...eventTail.map(entry => formatTraceEntry(entry, 'EVENT')).filter(Boolean),
            ...chainTail.map(entry => formatTraceEntry(entry, 'CHAIN')).filter(Boolean),
            ...recentLogs.map(entry => `[STDIO] [${formatDate(entry.at)}] ${entry.stream}: ${entry.line}`)
        ].slice(-24);

        if (!traceLines.length) {
            els.automationLog.textContent = runLog.status
                ? `Runner status: ${runLog.status}`
                : 'No automation output yet.';
            return;
        }

        els.automationLog.textContent = traceLines.join('\n');
    }

    function renderCanaryAchievement(data) {
        const achievement = data.canaryAchievement;
        if (!achievement || achievement.status !== 'completed') {
            els.canaryAchievement.hidden = true;
            return;
        }
        els.canaryAchievement.hidden = false;

        const XTRATA_CONTRACT = achievement.contract || 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
        const EXPLORER_BASE = 'https://explorer.hiro.so';

        function tokenUrl(tokenId) {
            return `${EXPLORER_BASE}/token/${XTRATA_CONTRACT}/${tokenId}?chain=mainnet`;
        }

        function txUrl(txid) {
            return txid ? `${EXPLORER_BASE}/txid/${txid}?chain=mainnet` : null;
        }

        // Narrative
        els.achievementNarrative.textContent = achievement.narrative;

        // Stats cards
        const totalBytes = achievement.artifacts.reduce((s, a) => s + (a.bytes || 0), 0);
        const totalChunks = achievement.artifacts.reduce((s, a) => s + (a.chunks || 0), 0);
        const mimeTypes = new Set(achievement.artifacts.map(a => a.mime));
        const range = achievement.token_range || [];
        const statsCards = [
            { label: 'Tokens', value: `#${range[0]} \u2013 #${range[1]}`, subvalue: `${achievement.total_artifacts} artifacts sealed on-chain`, className: 'accent' },
            { label: 'Batches', value: String(achievement.total_batches), subvalue: 'Foundation \u2192 Application \u2192 Catalogs \u2192 Proof', className: 'accent' },
            { label: 'Total Size', value: formatBytes(totalBytes), subvalue: `${formatNumber(totalChunks)} chunks across ${mimeTypes.size} content types`, className: 'accent' },
            { label: 'Proof Viewer', value: `Token #${achievement.proof_viewer_token}`, subvalue: 'Self-verifying HTML app with 9 dependencies', className: 'good' },
            { label: 'Network', value: achievement.network || 'mainnet', subvalue: escapeHtml(achievement.creator), className: 'accent' },
            { label: 'Sealed', value: formatDate(achievement.sealed_at), subvalue: 'All artifacts verified on-chain', className: 'good' }
        ];
        els.achievementStats.innerHTML = statsCards.map(c => `
            <div class="mini-stat ${c.className}">
                <div class="label">${escapeHtml(c.label)}</div>
                <div class="value">${escapeHtml(c.value)}</div>
                <div class="subvalue">${escapeHtml(c.subvalue)}</div>
            </div>
        `).join('');

        // Dependency graph visualization
        renderAchievementGraph(achievement);

        // Batch-grouped artifact cards
        const batchOrder = achievement.batches || [];
        const artifactsByBatch = new Map();
        for (const batch of batchOrder) {
            artifactsByBatch.set(batch.name, []);
        }
        for (const artifact of achievement.artifacts) {
            const list = artifactsByBatch.get(artifact.batch);
            if (list) list.push(artifact);
        }

        els.achievementBatches.innerHTML = batchOrder.map(batch => {
            const artifacts = artifactsByBatch.get(batch.name) || [];
            return `
                <div class="batch-group">
                    <div class="batch-group-head">
                        <span class="batch-group-title">${escapeHtml(batch.name)}</span>
                        <span class="status-pill ready">${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="batch-group-desc">${escapeHtml(batch.description)}</div>
                    <div class="card-grid">
                        ${artifacts.map(a => renderArtifactCard(a, tokenUrl, txUrl)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderArtifactCard(artifact, tokenUrl, txUrl) {
        const depChips = artifact.dependencies.length
            ? artifact.dependencies.map(d => `<span class="chip">\u2190 #${d}</span>`).join('')
            : '<span class="chip">no dependencies</span>';

        const viewLink = `<a class="chip" href="${tokenUrl(artifact.token_id)}" target="_blank" rel="noopener">#${artifact.token_id} on-chain</a>`;
        const txLink = artifact.txid
            ? `<a class="chip" href="${txUrl(artifact.txid)}" target="_blank" rel="noopener">tx</a>`
            : '';

        return `
            <div class="artifact-card">
                <div class="artifact-head">
                    <span class="artifact-name">${escapeHtml(artifact.name)}</span>
                    <span class="artifact-token">#${artifact.token_id}</span>
                </div>
                <div class="artifact-role">${escapeHtml(artifact.role)}</div>
                <div class="artifact-desc">${escapeHtml(artifact.description)}</div>
                <div class="artifact-meta">
                    <span class="chip">${escapeHtml(artifact.mime)}</span>
                    <span class="chip">${formatBytes(artifact.bytes)}</span>
                    <span class="chip">${artifact.chunks} chunk${artifact.chunks !== 1 ? 's' : ''}</span>
                    ${viewLink}
                    ${txLink}
                    ${depChips}
                </div>
            </div>
        `;
    }

    function renderAchievementGraph(achievement) {
        const artifacts = achievement.artifacts || [];
        const depGraph = achievement.artifacts.reduce((m, a) => { m.set(a.token_id, a); return m; }, new Map());
        const COLS = 4;
        const COL_W = 220;
        const ROW_H = 52;
        const NODE_W = 190;
        const NODE_H = 36;
        const PAD_X = 40;
        const PAD_Y = 30;

        // Group by batch for column layout
        const batchNames = [...new Set(artifacts.map(a => a.batch))];
        const batchCols = new Map();
        batchNames.forEach((name, i) => batchCols.set(name, i));

        // Position nodes
        const positions = new Map();
        const batchRowCount = new Map();
        for (const a of artifacts) {
            const col = batchCols.get(a.batch) || 0;
            const row = batchRowCount.get(a.batch) || 0;
            batchRowCount.set(a.batch, row + 1);
            positions.set(a.token_id, {
                x: PAD_X + col * COL_W,
                y: PAD_Y + row * ROW_H,
                cx: PAD_X + col * COL_W + NODE_W / 2,
                cy: PAD_Y + row * ROW_H + NODE_H / 2
            });
        }

        const maxRow = Math.max(...[...batchRowCount.values()]);
        const svgW = PAD_X * 2 + batchNames.length * COL_W;
        const svgH = PAD_Y * 2 + maxRow * ROW_H + 20;

        const stratumColors = {
            schema: '#6db5ff',
            runtime: '#4dd17b',
            application: '#ffbf47',
            catalog: '#ff8a1c'
        };

        // Draw edges
        let edgesSvg = '';
        for (const a of artifacts) {
            const to = positions.get(a.token_id);
            if (!to) continue;
            for (const depId of a.dependencies) {
                const from = positions.get(depId);
                if (!from) continue;
                edgesSvg += `<line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" stroke="#26221c" stroke-width="1.5"/>`;
            }
        }

        // Draw edge arrows (subtle directional indicators)
        let arrowsSvg = '';
        for (const a of artifacts) {
            const to = positions.get(a.token_id);
            if (!to) continue;
            for (const depId of a.dependencies) {
                const from = positions.get(depId);
                if (!from) continue;
                const dx = to.cx - from.cx;
                const dy = to.cy - from.cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) continue;
                const mx = from.cx + dx * 0.65;
                const my = from.cy + dy * 0.65;
                arrowsSvg += `<circle cx="${mx}" cy="${my}" r="2.5" fill="#26221c"/>`;
            }
        }

        // Draw batch labels
        let labelsSvg = '';
        batchNames.forEach((name, i) => {
            const x = PAD_X + i * COL_W + NODE_W / 2;
            labelsSvg += `<text x="${x}" y="16" text-anchor="middle" fill="#8f877a" font-size="10" font-family="var(--font)" text-transform="uppercase" letter-spacing="0.08em">${escapeHtml(name)}</text>`;
        });

        // Draw nodes
        let nodesSvg = '';
        for (const a of artifacts) {
            const pos = positions.get(a.token_id);
            if (!pos) continue;
            const fill = stratumColors[a.stratum] || '#8f877a';
            nodesSvg += `
                <g>
                    <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" rx="3" fill="#0b0b0b" stroke="${fill}" stroke-width="1.5"/>
                    <text x="${pos.x + 8}" y="${pos.y + 15}" fill="${fill}" font-size="11" font-weight="bold" font-family="var(--font)">#${a.token_id}</text>
                    <text x="${pos.x + 8}" y="${pos.y + 28}" fill="#d8d2c8" font-size="10" font-family="var(--font)">${escapeHtml(a.role)}</text>
                </g>
            `;
        }

        els.achievementGraph.innerHTML = `
            <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="max-width: ${svgW}px;">
                ${labelsSvg}
                ${edgesSvg}
                ${arrowsSvg}
                ${nodesSvg}
            </svg>
            <div style="margin-top: 0.6rem; display: flex; gap: 0.8rem; flex-wrap: wrap;">
                <span class="chip" style="border-left: 3px solid #6db5ff;">Schema</span>
                <span class="chip" style="border-left: 3px solid #4dd17b;">Runtime</span>
                <span class="chip" style="border-left: 3px solid #ffbf47;">Application</span>
                <span class="chip" style="border-left: 3px solid #ff8a1c;">Catalog</span>
            </div>
        `;
    }

    function renderDependencyGraph(data) {
        const modules = data.moduleIndex;
        if (!Array.isArray(modules) || modules.length === 0) {
            els.depGraphSection.hidden = true;
            return;
        }
        els.depGraphSection.hidden = false;

        els.depGraphContainer.innerHTML = buildDependencyGraphSvg(data);

        // Legend and subtitle
        const statusItems = data.status?.items || [];
        const statusByName = new Map(statusItems.map(item => [item.name, item.status]));
        const sorted = [...modules].sort((a, b) => (a.topo_order || 0) - (b.topo_order || 0));
        const mintedCount = sorted.filter(m => statusByName.get(m.name) === 'minted').length;
        const plannedCount = sorted.length - mintedCount;
        const stratumColors = {
            schema: '#6db5ff', runtime: '#4dd17b', engine: '#4dd17b',
            application: '#ffbf47', catalog: '#ff8a1c', plugin: '#c084fc'
        };
        const strata = [...new Set(sorted.map(m => m.stratum || m.group || 'runtime'))];
        els.depGraphLegend.innerHTML = strata.map(s =>
            `<span class="chip" style="border-left: 3px solid ${stratumColors[s] || '#8f877a'};">${escapeHtml(s)}</span>`
        ).join('') +
            `<span class="chip" style="border-left: 3px solid #4dd17b;">\u25cf minted</span>` +
            `<span class="chip" style="border-left: 3px solid #ffbf47;">\u25cf ready</span>` +
            `<span class="chip" style="border-left: 3px solid #555;">\u25cf planned</span>`;

        els.depGraphSub.textContent = `${sorted.length} artifacts \u2014 ${mintedCount} inscribed, ${plannedCount} remaining. Grouped by execution batch with dependency edges.`;
    }

    function renderBvstAchievement(data) {
        const modules = data.moduleIndex;
        const status = data.status;
        const summary = status?.summary;
        const tokenMap = data.tokenMap?.entries || {};
        const inscriptionLog = data.inscriptionLog;

        // Only show when every artifact is minted
        if (!summary || summary.minted < summary.total || summary.total === 0 || summary.blocked > 0 || summary.hard_stop > 0) {
            els.bvstAchievement.hidden = true;
            return;
        }
        els.bvstAchievement.hidden = false;

        const XTRATA_CONTRACT = 'SP3JNSEXAZP4BDSHV0DN3M8R3P0MY0EEBQQZX743X.xtrata-v2-1-0';
        const EXPLORER_BASE = 'https://explorer.hiro.so';
        function tokenUrl(id) { return `${EXPLORER_BASE}/token/${XTRATA_CONTRACT}/${id}?chain=mainnet`; }
        function txUrl(txid) { return txid ? `${EXPLORER_BASE}/txid/${txid}?chain=mainnet` : null; }

        const items = status.items || [];
        const tokenIds = items.map(i => tokenMap[i.name]?.token_id).filter(Boolean).map(Number).sort((a, b) => a - b);
        const tokenRange = tokenIds.length > 0 ? [tokenIds[0], tokenIds[tokenIds.length - 1]] : [0, 0];

        const totalBytes = (modules || []).reduce((s, m) => s + (m.bytes || 0), 0);
        const totalChunks = (modules || []).reduce((s, m) => s + (m.chunks || 0), 0);
        const mimeTypes = new Set((modules || []).map(m => m.mime_type));
        const strata = [...new Set((modules || []).map(m => m.stratum || m.group))];

        // Batch info
        const batches = data.quote?.execution?.orderedBatches || [];
        const leafCount = (modules || []).filter(m => m.kind === 'leaf').length;
        const catalogCount = (modules || []).filter(m => m.kind === 'catalog').length;

        const logEntries = inscriptionLog?.entries || [];
        const firstMint = logEntries.length > 0
            ? logEntries.reduce((earliest, e) => (!earliest || e.recorded_at < earliest) ? e.recorded_at : earliest, null)
            : null;
        const lastMint = logEntries.length > 0
            ? logEntries.reduce((latest, e) => (!latest || e.recorded_at > latest) ? e.recorded_at : latest, null)
            : null;

        // Narrative
        els.bvstAchievementNarrative.textContent =
            `${summary.total} artifacts inscribed as permanent, dependency-linked Xtrata tokens on Stacks mainnet. ` +
            `The BVST synthesizer framework is now a fully on-chain modular application — every runtime module, audio engine, plugin, and catalog ` +
            `can be loaded recursively from the blockchain without any external server.`;

        // Stats cards
        const statsCards = [
            { label: 'Tokens', value: `#${tokenRange[0]} \u2013 #${tokenRange[1]}`, subvalue: `${summary.total} artifacts sealed on-chain`, className: 'accent' },
            { label: 'Architecture', value: `${leafCount} leaves + ${catalogCount} catalogs`, subvalue: `${batches.length} execution batches, ${strata.length} strata`, className: 'accent' },
            { label: 'Total Size', value: formatBytes(totalBytes), subvalue: `${formatNumber(totalChunks)} chunks across ${mimeTypes.size} content types`, className: 'accent' },
            { label: 'Network', value: 'Stacks Mainnet', subvalue: 'Permanent, immutable, verifiable', className: 'good' },
            { label: 'First Mint', value: firstMint ? formatDate(firstMint) : '\u2014', subvalue: 'Foundation batch started', className: 'accent' },
            { label: 'Completed', value: lastMint ? formatDate(lastMint) : '\u2014', subvalue: 'All artifacts verified on-chain', className: 'good' }
        ];
        els.bvstAchievementStats.innerHTML = statsCards.map(c => `
            <div class="mini-stat ${c.className}">
                <div class="label">${escapeHtml(c.label)}</div>
                <div class="value">${escapeHtml(c.value)}</div>
                <div class="subvalue">${escapeHtml(c.subvalue)}</div>
            </div>
        `).join('');

        // What Was Built
        els.bvstAchievementWhat.innerHTML = [
            `<strong>A complete modular synthesizer framework living permanently on the blockchain.</strong>`,
            `The BVST (Bitcoin Virtual Studio Technology) first-wave release inscribes ${summary.total} interdependent artifacts ` +
            `onto Stacks using the Xtrata recursive inscription protocol. These artifacts form a full-stack audio application: ` +
            `a patch schema, 13 shared runtime modules (CSS, UI, controls, keyboard, MIDI, sequencer, sampler, visualizer), ` +
            `a WebAssembly DSP engine with its loader and AudioWorklet processor, a plugin core with standalone bridge and patch runtime, ` +
            `7 playable synthesizer instruments across two plugin families, and 15 on-chain catalogs that bind the dependency tree together.`,
            `Each synthesizer — from the JMS10 and UniversalSynth family to BlueMarvinOne, NeonPoly, and RetroKeys — ` +
            `can be fully reconstructed by reading its catalog, resolving the recursive token references, and assembling the runtime from on-chain data alone. ` +
            `No CDN. No API. No server. The application <em>is</em> the chain.`
        ].join('<br><br>');

        // How It Was Done
        els.bvstAchievementHow.innerHTML = [
            `<strong>AI-orchestrated dependency-aware inscription with automated verification at every step.</strong>`,
            `The entire inscription was planned and executed by an AI agent (Agent 27) using a purpose-built automation pipeline. ` +
            `The process followed strict topological ordering: foundation runtime modules were inscribed first (zero-dependency leaves), ` +
            `then each subsequent batch was unlocked only after all its prerequisites had confirmed token IDs on-chain.`,
            `For each artifact, the pipeline: verified the local source hash against the frozen module index, ` +
            `checked for on-chain content-hash duplicates, confirmed all recursive dependency tokens existed on-chain via live contract reads, ` +
            `then submitted the transaction with the dependency list encoded in the contract call. ` +
            `After each successful mint, the token ID was recorded in the token map, all catalog templates were re-rendered with the new IDs injected, ` +
            `and the full inscription status was rebuilt to determine what unlocked next.`,
            `Catalogs — the JSON manifests that describe the dependency tree — were rendered dynamically as their constituent artifacts were minted. ` +
            `A catalog could only be inscribed once every <code>token_id</code>, <code>txid</code>, and <code>block_height</code> field ` +
            `in its template was resolved to a confirmed on-chain value. This made it structurally impossible to inscribe a catalog with missing references.`,
            `The safety gate ran pre-inscription checks (bundle integrity, plugin semantics, sampler validation, HTTP smoke tests, and inscription simulation) ` +
            `before every batch. The release gate combined these with a live fee quote and wallet balance check to prevent under-funded runs.`
        ].join('<br><br>');

        // Why It Matters
        els.bvstAchievementWhy.innerHTML = [
            `<strong>This is the first modular recursive web application framework inscribed on a Bitcoin layer.</strong>`,
            `<em>For on-chain builders:</em> BVST proves that complex, multi-file web applications can live entirely on-chain using recursive inscription. ` +
            `The pattern — shared runtime modules referenced by multiple applications through on-chain catalogs — eliminates duplication and creates ` +
            `a composable dependency graph where new instruments or applications can reuse the existing foundation without re-inscribing shared code. ` +
            `Any future BVST plugin only needs its own manifest, patch, and GUI shell; the entire runtime, engine, and UI layer is already on-chain and addressable by token ID.`,
            `<em>For the AI + Web3 intersection:</em> The full lifecycle — from code authoring and bug fixing, through bundle verification and dependency planning, ` +
            `to the actual on-chain inscription — was orchestrated by an AI agent operating within a structured automation framework. ` +
            `This demonstrates that AI agents can reliably manage complex multi-step blockchain operations with built-in safety gates, ` +
            `not as a novelty but as a practical production workflow. The agent authored code, fixed a sequencer-to-WASM integration bug, ` +
            `maintained the verification suite, and executed the inscription run with full audit trails.`,
            `<em>For the Stacks ecosystem:</em> Xtrata's recursive inscription model on Stacks shows that L2 smart contracts can host ` +
            `rich application frameworks with on-chain dependency resolution — something not possible with flat inscription models. ` +
            `The helper contract pattern (single-transaction mint for small artifacts, staged multi-tx for large ones) combined with ` +
            `the recursive dependency list makes the on-chain data self-describing: any node can verify the complete dependency tree ` +
            `by reading contract state alone, with no off-chain index required.`
        ].join('<br><br>');

        // Dependency graph (reuse the same renderer but into a different container)
        if (Array.isArray(modules) && modules.length > 0) {
            const graphHtml = buildDependencyGraphSvg(data);
            els.bvstAchievementGraph.innerHTML = graphHtml;
        }

        // Batch-grouped artifact list
        const batchOrder = batches.map(b => b.file);
        const artifactsByBatch = new Map(batchOrder.map(b => [b, []]));
        for (const item of items) {
            const list = artifactsByBatch.get(item.batch);
            if (list) list.push(item);
        }

        els.bvstAchievementBatches.innerHTML = batchOrder.map(batchFile => {
            const batchItems = artifactsByBatch.get(batchFile) || [];
            const batchMeta = batches.find(b => b.file === batchFile);
            const shortName = batchFile.replace(/\.batch\.json$/, '').replace(/^\d+-/, '');
            return `
                <div class="batch-group">
                    <div class="batch-group-head">
                        <span class="batch-group-title">${escapeHtml(shortName)}</span>
                        <span class="status-pill ready">${batchItems.length} artifact${batchItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="card-grid">
                        ${batchItems.map(item => {
                            const entry = tokenMap[item.name] || {};
                            const depNames = item.dependency_names || [];
                            const depChips = depNames.length > 0
                                ? depNames.map(d => {
                                    const depToken = tokenMap[d]?.token_id;
                                    return depToken
                                        ? `<a class="chip" href="${tokenUrl(depToken)}" target="_blank" rel="noopener">\u2190 #${depToken}</a>`
                                        : `<span class="chip">\u2190 ${escapeHtml(d.replace(/^bvst\.\w+\./, '').replace(/\.v[\d.]+$/, ''))}</span>`;
                                }).join('')
                                : '<span class="chip">no dependencies</span>';
                            const viewLink = entry.token_id
                                ? `<a class="chip" href="${tokenUrl(entry.token_id)}" target="_blank" rel="noopener">#${entry.token_id} on-chain</a>`
                                : '';
                            const txLink = entry.txid
                                ? `<a class="chip" href="${txUrl(entry.txid)}" target="_blank" rel="noopener">tx</a>`
                                : '';
                            const shortItemName = item.name.replace(/^bvst\.\w+\./, '').replace(/\.v[\d.]+$/, '');
                            return `
                                <div class="artifact-card">
                                    <div class="artifact-head">
                                        <span class="artifact-name">${escapeHtml(shortItemName)}</span>
                                        <span class="artifact-token">${entry.token_id ? '#' + entry.token_id : ''}</span>
                                    </div>
                                    <div class="artifact-role">${escapeHtml(item.kind)} \u00b7 ${escapeHtml(item.route)}</div>
                                    <div class="artifact-meta">
                                        <span class="chip">${escapeHtml(item.mime)}</span>
                                        ${viewLink}
                                        ${txLink}
                                        ${depChips}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Shared SVG builder for dependency graph (used by both the planning view and achievement view)
    function buildDependencyGraphSvg(data) {
        const modules = data.moduleIndex;
        if (!Array.isArray(modules) || modules.length === 0) return '';

        const statusItems = data.status?.items || [];
        const statusByName = new Map(statusItems.map(item => [item.name, item.status]));
        const tokenMap = data.tokenMap?.entries || {};

        const sorted = [...modules].sort((a, b) => (a.topo_order || 0) - (b.topo_order || 0));

        const steps = data.quote?.execution?.steps || [];
        const stepBatches = new Map(steps.map(s => [s.name, s.batch || 'unassigned']));
        const batchNames = [];
        const seen = new Set();
        for (const s of steps) {
            const b = s.batch || 'unassigned';
            if (!seen.has(b)) { batchNames.push(b); seen.add(b); }
        }
        for (const m of sorted) {
            if (!stepBatches.has(m.name) && !seen.has('other')) {
                batchNames.push('other');
                seen.add('other');
            }
        }

        function getBatch(name) { return stepBatches.get(name) || 'other'; }

        const COL_W = 240;
        const ROW_H = 44;
        const NODE_W = 210;
        const NODE_H = 32;
        const PAD_X = 30;
        const PAD_Y = 32;

        const batchCol = new Map(batchNames.map((b, i) => [b, i]));
        const batchRowCount = new Map();
        const positions = new Map();
        for (const m of sorted) {
            const batch = getBatch(m.name);
            const col = batchCol.get(batch) || 0;
            const row = batchRowCount.get(batch) || 0;
            batchRowCount.set(batch, row + 1);
            positions.set(m.name, {
                x: PAD_X + col * COL_W,
                y: PAD_Y + row * ROW_H,
                cx: PAD_X + col * COL_W + NODE_W / 2,
                cy: PAD_Y + row * ROW_H + NODE_H / 2
            });
        }

        const maxRow = Math.max(...[...batchRowCount.values()], 1);
        const svgW = PAD_X * 2 + batchNames.length * COL_W;
        const svgH = PAD_Y * 2 + maxRow * ROW_H + 16;

        const stratumColors = {
            schema: '#6db5ff', runtime: '#4dd17b', engine: '#4dd17b',
            application: '#ffbf47', catalog: '#ff8a1c', plugin: '#c084fc'
        };

        let edgesSvg = '';
        let arrowsSvg = '';
        for (const m of sorted) {
            const to = positions.get(m.name);
            if (!to) continue;
            for (const depName of m.dependency_names || []) {
                const from = positions.get(depName);
                if (!from) continue;
                edgesSvg += `<line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" stroke="#26221c" stroke-width="1.2"/>`;
                const dx = to.cx - from.cx;
                const dy = to.cy - from.cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) continue;
                const mx = from.cx + dx * 0.65;
                const my = from.cy + dy * 0.65;
                arrowsSvg += `<circle cx="${mx}" cy="${my}" r="2" fill="#26221c"/>`;
            }
        }

        let labelsSvg = '';
        batchNames.forEach((name, i) => {
            const x = PAD_X + i * COL_W + NODE_W / 2;
            const shortName = name.replace(/\.batch\.json$/, '').replace(/^\d+-/, '');
            labelsSvg += `<text x="${x}" y="16" text-anchor="middle" fill="#8f877a" font-size="10" font-family="var(--font)" letter-spacing="0.06em">${escapeHtml(shortName.toUpperCase())}</text>`;
        });

        let nodesSvg = '';
        for (const m of sorted) {
            const pos = positions.get(m.name);
            if (!pos) continue;
            const stratum = m.stratum || m.group || 'runtime';
            const stroke = stratumColors[stratum] || '#8f877a';
            const mintStatus = statusByName.get(m.name) || 'planned';
            const isMinted = mintStatus === 'minted';
            const tokenEntry = tokenMap[m.name];
            const tokenId = tokenEntry?.token_id || null;
            const dotColor = isMinted ? '#4dd17b' : mintStatus === 'ready' ? '#ffbf47' : mintStatus === 'hard-stop' ? '#ef5350' : '#555';
            const dotX = pos.x + NODE_W - 14;
            const dotY = pos.y + NODE_H / 2;
            const shortName = m.name.replace(/^bvst\.(runtime|engine|schema|catalog|plugin)\./, '').replace(/\.v\d+(\.\d+)*$/, '');
            const label = tokenId ? `#${tokenId}` : (m.topo_order !== undefined ? `[${m.topo_order}]` : '');
            const opacity = isMinted ? '0.85' : '1';

            nodesSvg += `
                <g style="opacity:${opacity}">
                    <rect x="${pos.x}" y="${pos.y}" width="${NODE_W}" height="${NODE_H}" rx="3" fill="#0b0b0b" stroke="${stroke}" stroke-width="1.2"/>
                    <text x="${pos.x + 7}" y="${pos.y + 13}" fill="${stroke}" font-size="10" font-weight="bold" font-family="var(--font)">${escapeHtml(label)}</text>
                    <text x="${pos.x + 7}" y="${pos.y + 25}" fill="#d8d2c8" font-size="9.5" font-family="var(--font)">${escapeHtml(shortName)}</text>
                    <circle cx="${dotX}" cy="${dotY}" r="4" fill="${dotColor}"/>
                </g>
            `;
        }

        return `
            <svg width="100%" viewBox="0 0 ${svgW} ${svgH}" style="max-width: ${svgW}px;">
                ${labelsSvg}
                ${edgesSvg}
                ${arrowsSvg}
                ${nodesSvg}
            </svg>
        `;
    }

    function renderSupportingData(data) {
        els.runtimeFiles.innerHTML = (data.runtimeFiles || []).map(item => renderPathChip(item, { segments: 2 })).join('');
        els.plannerDocs.innerHTML = (data.docs || []).map(item => renderPathChip(item, { segments: 3 })).join('');
        els.intakeChecklist.innerHTML = (data.intakeChecklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
    }

    function renderRelease() {
        const data = state.release;
        if (!data) return;
        renderHero(data);
        renderSnapshot(data);
        renderCosts(data);
        renderTimeHeuristic(data);
        renderNextAction(data);
        renderReadyQueue(data);
        renderBatchTimeline(data);
        renderAutomation(data);
        renderCanaryAchievement(data);
        renderBvstAchievement(data);
        renderDependencyGraph(data);
        renderSafety(data);
        renderSupportingData(data);
        renderUploadAnalysis();
    }

    function normalizeFiles(fileList) {
        return Array.from(fileList || []).filter(file => file && file.size >= 0);
    }

    function classifyStructure(files) {
        const paths = files.map(file => file.webkitRelativePath || file.name);
        const countMatching = (pattern) => paths.filter(value => pattern.test(value)).length;
        return {
            batchFiles: countMatching(/\.batch\.json$/i),
            manifests: countMatching(/(^|\/)manifest\.json$/i),
            patches: countMatching(/(^|\/)patch\.json$/i),
            releaseDocs: countMatching(/INSCRIPTION_AUTOMATION\.md$|README\.md$|module-index\.json$/i),
            tokenMaps: countMatching(/token-map\.(runtime|template)\.json$/i),
            catalogs: countMatching(/\/catalogs\/.*\.json$/i)
        };
    }

    function renderUploadAnalysis() {
        const files = state.selectedFiles;
        if (!files.length) {
            els.uploadSummary.innerHTML = '<div class="empty-state">No upload selected yet. This page can size and route files immediately, but dependency-safe planning still needs manifests, batch docs, or a planning brief.</div>';
            els.uploadLargest.innerHTML = '<div class="empty-state">Choose files to inspect staged-route outliers and heavy assets before planning the mint order.</div>';
            els.uploadStructure.className = 'empty-state';
            els.uploadStructure.textContent = 'Choose files to inspect release structure signals such as manifests, batches, token maps, and planning docs.';
            return;
        }

        const quote = state.release?.quote?.quote || {};
        const feeUnitMicroStx = quote.feeUnitMicroStx ? Number(quote.feeUnitMicroStx) : null;
        const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
        const totalChunks = files.reduce((sum, file) => sum + chunkCount(file.size), 0);
        const helperFiles = files.filter(file => routeForBytes(file.size) === 'helper');
        const stagedFiles = files.filter(file => routeForBytes(file.size) === 'staged');
        const roughMiningUsd = totalBytes / 1_000_000;
        const protocolEstimate = feeUnitMicroStx
            ? files.reduce((sum, file) => sum + estimateProtocolFeeStx(file.size, feeUnitMicroStx), 0)
            : null;
        const topDirectoryCount = new Set(files.map(file => {
            const rel = file.webkitRelativePath || file.name;
            return rel.includes('/') ? rel.split('/')[0] : '(root)';
        })).size;

        const summaryCards = [
            {
                label: 'Selected Files',
                value: formatNumber(files.length),
                subvalue: `${formatNumber(topDirectoryCount)} top-level groups`
            },
            {
                label: 'Total Size',
                value: formatBytes(totalBytes),
                subvalue: `${formatNumber(totalChunks)} total chunks at 16,384 bytes`
            },
            {
                label: 'Route Mix',
                value: `${formatNumber(helperFiles.length)} helper`,
                subvalue: `${formatNumber(stagedFiles.length)} staged`
            },
            {
                label: 'Protocol Estimate',
                value: protocolEstimate !== null ? formatStx(protocolEstimate) : 'Needs live fee-unit',
                subvalue: 'assumes one inscription per file'
            },
            {
                label: 'Rough Mining Fallback',
                value: formatUsd(roughMiningUsd),
                subvalue: 'coarse fallback only at $1/MB'
            }
        ];

        els.uploadSummary.innerHTML = summaryCards.map(card => `
            <div class="mini-stat accent">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');

        const largest = [...files]
            .sort((left, right) => right.size - left.size)
            .slice(0, 8);

        els.uploadLargest.innerHTML = largest.map(file => {
            const rel = file.webkitRelativePath || file.name;
            const chunks = chunkCount(file.size);
            const route = routeForBytes(file.size);
            return `
                <div class="file-item">
                    <div class="file-top">
                        <div class="file-name">${escapeHtml(rel)}</div>
                        <div class="status-pill ${escapeHtml(route)}">${escapeHtml(route)}</div>
                    </div>
                    <div class="kv-list">
                        <div class="label">Size</div><div class="value">${formatBytes(file.size)} / ${formatNumber(file.size)} bytes</div>
                        <div class="label">Chunks</div><div class="value">${formatNumber(chunks)}</div>
                        <div class="label">Type</div><div class="value">${escapeHtml(file.type || 'unknown')}</div>
                    </div>
                </div>
            `;
        }).join('');

        const structure = classifyStructure(files);
        const structureRows = [
            ['Batch Files', structure.batchFiles],
            ['Manifest Files', structure.manifests],
            ['Patch Files', structure.patches],
            ['Catalog JSON', structure.catalogs],
            ['Token Maps', structure.tokenMaps],
            ['Release Docs', structure.releaseDocs]
        ];
        const looksStructured = Object.values(structure).some(value => value > 0);
        els.uploadStructure.className = looksStructured ? '' : 'empty-state';
        els.uploadStructure.innerHTML = `
            <div class="guide-item">
                <div class="tiny-label">${looksStructured ? 'Structured Signals Detected' : 'No Release Structure Detected Yet'}</div>
                <div style="margin-top:0.6rem;" class="kv-list">
                    ${structureRows.map(([label, value]) => `
                        <div class="label">${escapeHtml(label)}</div><div class="value">${formatNumber(value)}</div>
                    `).join('')}
                </div>
                <div style="margin-top:0.75rem;" class="muted">
                    ${looksStructured
                        ? 'This upload already contains release-shaping files. That is enough to start a dependency-aware plan, though an operator brief still helps finalize ordering and cost assumptions.'
                        : 'This looks like a raw asset upload. The browser can estimate bytes and routes now, but a full dependency-safe plan still needs manifests, batch docs, or a planning brief.'}
                </div>
            </div>
        `;
    }

    function bindUploadInputs() {
        const handleSelection = (event) => {
            state.selectedFiles = normalizeFiles(event.target.files);
            renderUploadAnalysis();
        };
        els.filePicker.addEventListener('change', handleSelection);
        els.directoryPicker.addEventListener('change', handleSelection);
        els.clearUpload.addEventListener('click', () => {
            state.selectedFiles = [];
            els.filePicker.value = '';
            els.directoryPicker.value = '';
            renderUploadAnalysis();
        });
    }

    function bindEvents() {
        els.refreshRelease.addEventListener('click', () => {
            loadReleaseData().catch((err) => {
                els.refreshStamp.textContent = `Refresh failed: ${err.message}`;
            });
        });
        els.viewBvst.addEventListener('click', () => {
            setSelectedRelease('bvst-first-wave');
            loadReleaseData().catch((err) => {
                els.refreshStamp.textContent = `Refresh failed: ${err.message}`;
            });
        });
        els.viewCanary.addEventListener('click', () => {
            setSelectedRelease('xtrata-canary');
            loadReleaseData().catch((err) => {
                els.refreshStamp.textContent = `Refresh failed: ${err.message}`;
            });
        });
        els.runReleaseGate.addEventListener('click', async () => {
            const originalLabel = els.runReleaseGate.textContent;
            const pendingLabel = state.release?.plannerActions?.releaseRunPendingLabel || 'Running Release Gate...';
            els.runReleaseGate.textContent = pendingLabel;
            els.runReleaseGate.disabled = true;
            try {
                const result = await postJson(`/api/inscription-planner/${encodeURIComponent(state.selectedRelease)}/run`);
                setSelectedRelease(result.releaseId || state.selectedRelease);
                state.release = result.data || null;
                renderRelease();
            } catch (err) {
                els.refreshStamp.textContent = `Release gate failed: ${err.message}`;
            } finally {
                els.runReleaseGate.textContent = originalLabel;
                els.runReleaseGate.disabled = false;
            }
        });
        els.startReleaseInscription.addEventListener('click', async () => {
            const originalLabel = els.startReleaseInscription.textContent;
            const pendingLabel = state.release?.plannerActions?.releaseInscribePendingLabel || 'Starting Inscription...';
            els.startReleaseInscription.textContent = pendingLabel;
            els.startReleaseInscription.disabled = true;
            try {
                const result = await postJson(`/api/inscription-planner/${encodeURIComponent(state.selectedRelease)}/inscribe`);
                setSelectedRelease(result.releaseId || state.selectedRelease);
                state.release = result.data || null;
                renderRelease();
            } catch (err) {
                els.refreshStamp.textContent = `Inscription failed to start: ${err.message}`;
            } finally {
                if (!state.release?.automation?.activeRun) {
                    els.startReleaseInscription.textContent = originalLabel;
                }
            }
        });

        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-copy]');
            if (!target) return;
            event.preventDefault();
            const copyValue = decodeURIComponent(target.getAttribute('data-copy') || '');
            const copyLabel = target.getAttribute('data-copy-label') || 'Copied';
            copyText(copyValue).then((copied) => {
                const original = target.textContent;
                target.textContent = copied ? `${copyLabel} Copied` : 'Copy Failed';
                window.setTimeout(() => {
                    target.textContent = original;
                }, 1200);
            }).catch(() => {
                const original = target.textContent;
                target.textContent = 'Copy Failed';
                window.setTimeout(() => {
                    target.textContent = original;
                }, 1200);
            });
        });
    }

    function scheduleReleaseRefresh() {
        if (state.refreshTimer) return;
        state.refreshTimer = window.setTimeout(() => {
            state.refreshTimer = null;
            loadReleaseData().catch(() => {});
        }, 1200);
    }

    function bindEventStream() {
        if (typeof window.EventSource !== 'function') return;
        const stream = new window.EventSource('/events');
        stream.addEventListener('planner-run', (event) => {
            const payload = JSON.parse(event.data || '{}');
            if (!payload.releaseId) return;
            if (payload.releaseId === state.selectedRelease) {
                scheduleReleaseRefresh();
            }
        });
    }

    function startRefreshLoop() {
        if (state.refreshInterval) return;
        state.refreshInterval = window.setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            loadReleaseData({ silent: true }).catch(() => {});
        }, ACTIVE_REFRESH_MS);
    }

    async function init() {
        bindEvents();
        bindUploadInputs();
        bindEventStream();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                loadReleaseData({ silent: true }).catch(() => {});
            }
        });
        try {
            await loadReleaseData();
        } catch (err) {
            els.refreshStamp.textContent = `Release data unavailable: ${err.message}`;
        }
        startRefreshLoop();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
