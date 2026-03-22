(function () {
    const CHUNK_SIZE = 16384;
    const HELPER_LIMIT = 30;
    const ACTIVE_REFRESH_MS = 30000;

    const els = {
        refreshStamp: document.getElementById('refresh-stamp'),
        heroRelease: document.getElementById('hero-release'),
        heroRoot: document.getElementById('hero-root'),
        heroNext: document.getElementById('hero-next'),
        heroHardStops: document.getElementById('hero-hard-stops'),
        heroPaths: document.getElementById('hero-paths'),
        viewBvst: document.getElementById('view-bvst'),
        viewCanary: document.getElementById('view-canary'),
        runCanaryGate: document.getElementById('run-canary-gate'),
        startCanaryInscription: document.getElementById('start-canary-inscription'),
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
        uploadStructure: document.getElementById('upload-structure')
    };

    const state = {
        selectedRelease: new URLSearchParams(window.location.search).get('release') || 'bvst-first-wave',
        release: null,
        selectedFiles: [],
        refreshTimer: null
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
        const response = await fetch(url, { cache: 'no-store' });
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

    async function loadReleaseData() {
        els.refreshStamp.textContent = 'Refreshing release data...';
        const data = await fetchJson(`/api/inscription-planner/current-release?release=${encodeURIComponent(state.selectedRelease)}`);
        state.release = data;
        renderRelease();
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
        els.runCanaryGate.hidden = !data.plannerActions?.canaryRunnable;
        els.startCanaryInscription.hidden = !data.plannerActions?.canaryInscribeAvailable || data.selectedRelease !== 'xtrata-canary';
        els.startCanaryInscription.disabled = !data.plannerActions?.canaryInscribeEnabled;
        if (data.automation?.activeRun) {
            els.startCanaryInscription.textContent = 'Canary Inscription Running';
        } else {
            els.startCanaryInscription.textContent = 'Inscribe Canary';
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
        const runLog = automation.runLog || {};
        const activeRun = automation.activeRun;
        const signerConfigured = Boolean(automation.signerConfigured);
        const eventTail = Array.isArray(automation.eventTail) ? automation.eventTail : [];
        const chainTail = Array.isArray(automation.chainTail) ? automation.chainTail : [];
        const failureSnapshot = automation.failureSnapshot || null;
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

        els.automationSummary.innerHTML = cards.map(card => `
            <div class="mini-stat ${card.className || 'accent'}">
                <div class="label">${escapeHtml(card.label)}</div>
                <div class="value">${escapeHtml(card.value)}</div>
                <div class="subvalue">${escapeHtml(card.subvalue)}</div>
            </div>
        `).join('');

        if (data.selectedRelease !== 'xtrata-canary') {
            els.automationNote.className = 'notice';
            els.automationNote.textContent = 'One-click inscription is currently wired only for the canary release. The production BVST release stays manual until the canary proves the full mint/update/verify loop on-chain.';
        } else if (!signerConfigured) {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = 'The runner cannot find Agent 27\'s signer path. Restore the autonomous signer configuration before using the one-click canary inscription button.';
        } else if (activeRun) {
            els.automationNote.className = 'notice good';
            els.automationNote.textContent = 'The canary runner is active. It mints one artifact at a time, verifies the result on-chain, records the token ID/tx/block, re-renders dependent catalogs, rebuilds status, then proceeds to the next ready item.';
        } else if (runLog.status === 'failed') {
            els.automationNote.className = 'notice warn';
            els.automationNote.textContent = 'The last automation run failed. Review the structured event log, chain-observation log, and failure snapshot before retrying.';
        } else if (runLog.status === 'completed') {
            els.automationNote.className = 'notice good';
            els.automationNote.textContent = 'The last automation run completed successfully. The runner left both lifecycle events and chain-verification traces behind for audit and debugging.';
        } else {
            els.automationNote.className = 'notice';
            els.automationNote.textContent = 'The one-click canary path is ready. It now records append-only lifecycle events, chain observations, and a failure snapshot in addition to the run summary JSON.';
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
        els.runCanaryGate.addEventListener('click', async () => {
            const originalLabel = els.runCanaryGate.textContent;
            els.runCanaryGate.textContent = 'Running Canary Gate...';
            els.runCanaryGate.disabled = true;
            try {
                const result = await postJson('/api/inscription-planner/canary/run');
                setSelectedRelease(result.releaseId || 'xtrata-canary');
                state.release = result.data || null;
                renderRelease();
            } catch (err) {
                els.refreshStamp.textContent = `Canary gate failed: ${err.message}`;
            } finally {
                els.runCanaryGate.textContent = originalLabel;
                els.runCanaryGate.disabled = false;
            }
        });
        els.startCanaryInscription.addEventListener('click', async () => {
            const originalLabel = els.startCanaryInscription.textContent;
            els.startCanaryInscription.textContent = 'Starting Canary Inscription...';
            els.startCanaryInscription.disabled = true;
            try {
                const result = await postJson('/api/inscription-planner/canary/inscribe');
                setSelectedRelease(result.releaseId || 'xtrata-canary');
                state.release = result.data || null;
                renderRelease();
            } catch (err) {
                els.refreshStamp.textContent = `Canary inscription failed to start: ${err.message}`;
            } finally {
                if (!state.release?.automation?.activeRun) {
                    els.startCanaryInscription.textContent = originalLabel;
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
            if (payload.releaseId === 'xtrata-canary') {
                scheduleReleaseRefresh();
            }
        });
    }

    async function init() {
        bindEvents();
        bindUploadInputs();
        bindEventStream();
        try {
            await loadReleaseData();
        } catch (err) {
            els.refreshStamp.textContent = `Release data unavailable: ${err.message}`;
        }
        setInterval(() => {
            loadReleaseData().catch(() => {});
        }, ACTIVE_REFRESH_MS);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
