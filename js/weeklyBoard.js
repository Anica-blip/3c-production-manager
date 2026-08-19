// 3C Production Manager — weekly board
// Fully independent per platform: switching platforms swaps the whole
// board — counters, list, and week — with zero shared state between
// them. Counters are pure glance-at-it summaries; the actual work
// happens in Add Task and the detail panel, not by clicking columns.

const STAGES = [
    { key: 'create', label: 'Create' },
    { key: 'review', label: 'Review' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'publish', label: 'Publish' },
    { key: 'archive', label: 'Archive' },
];

let currentWeekStart = mondayOf(new Date());
let currentPlatform = null;
let platformsCache = [];

function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function weekEnd(weekStart) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
}

function formatWeekLabel(weekStart) {
    const end = weekEnd(weekStart);
    const opts = { day: 'numeric', month: 'short' };
    return `${weekStart.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

async function initWeeklyBoard() {
    platformsCache = await apiGetPlatforms();
    if (!currentPlatform || !platformsCache.includes(currentPlatform)) {
        currentPlatform = platformsCache[0] || null;
    }
    renderPlatformTabs();
    await renderBoard();
}

function renderPlatformTabs() {
    const wrap = document.getElementById('platformTabs');
    wrap.innerHTML = platformsCache.map(p => `
        <button class="platform-tab-btn ${p === currentPlatform ? 'active' : ''}" onclick="switchPlatform('${p}')">
            ${p.charAt(0).toUpperCase() + p.slice(1)}
        </button>
    `).join('') + `<button class="platform-tab-btn" onclick="showAddPlatformModal()">+ Add Platform</button>`;
}

async function switchPlatform(platform) {
    currentPlatform = platform;
    renderPlatformTabs();
    await renderBoard();
}

async function changeWeek(delta) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + delta * 7);
    currentWeekStart = d;
    await renderBoard();
}

async function jumpToWeekContaining(dateStr) {
    currentWeekStart = mondayOf(new Date(dateStr + 'T00:00:00'));
    await renderBoard();
}

async function renderBoard() {
    document.getElementById('weekLabel').textContent = formatWeekLabel(currentWeekStart);

    const items = currentPlatform ? await apiGetPipelineItems({
        platform: currentPlatform,
        weekStart: isoDate(currentWeekStart),
        weekEnd: isoDate(weekEnd(currentWeekStart)),
    }) : [];

    // Counters — pure counts, nothing else lives inside these.
    // Archive specifically also flags whether this platform's week is
    // genuinely finished: light orange if anything's still short of
    // Archive, back to normal the moment everything has reached it.
    const hasIncomplete = items.some(i => i.stage !== 'archive');
    const counters = document.getElementById('stageCounters');
    counters.innerHTML = STAGES.map(stage => {
        const count = items.filter(i => i.stage === stage.key).length;
        const incompleteClass = (stage.key === 'archive' && hasIncomplete) ? 'stage-counter--incomplete' : '';
        return `
            <div class="stage-counter ${incompleteClass}">
                <div class="stage-counter-count">${count}</div>
                <div class="stage-counter-label">${stage.label}</div>
            </div>
        `;
    }).join('');

    // One flat list below, not split into columns
    const list = document.getElementById('pipelineItemList');
    list.innerHTML = items.length
        ? items.map(renderListRow).join('')
        : '<p style="opacity:.5; padding: 1rem 0;">No content yet this week.</p>';

    renderMiniCalendar();
}

function renderListRow(item) {
    const checklist = item.checklist || [];
    const doneCount = checklist.filter(s => s.done).length;
    const isComplete = checklist.length > 0 && doneCount === checklist.length;
    const dateLabel = item.scheduled_date
        ? new Date(item.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : 'No date';
    const stageLabel = STAGES.find(s => s.key === item.stage)?.label || item.stage;
    return `
        <div class="pipeline-list-row ${isComplete ? '' : 'pipeline-list-row--incomplete'}" onclick="openChecklistPanel('${item.id}')">
            <span class="pipeline-list-title">${escapeHtml(item.title)}</span>
            <span class="pipeline-list-meta">${dateLabel}${item.scheduled_time ? ' ' + item.scheduled_time : ''}</span>
            <span class="pipeline-list-stage">${stageLabel}</span>
            <span class="pipeline-list-progress">${doneCount}/${checklist.length}</span>
        </div>
    `;
}

// ── Mini month calendar — click any day to jump the board to its week ──
function renderMiniCalendar() {
    const el = document.getElementById('miniCalendar');
    if (!el) return;

    const refDate = new Date(currentWeekStart);
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const monthLabel = refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(year, month, 1);
    const startPad = (firstOfMonth.getDay() + 6) % 7; // Monday-first padding
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weekStartIso = isoDate(currentWeekStart);
    const weekEndIso = isoDate(weekEnd(currentWeekStart));

    let cells = '';
    for (let i = 0; i < startPad; i++) cells += '<span class="mini-cal-cell mini-cal-cell--empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
        const cellIso = isoDate(new Date(year, month, d));
        const inCurrentWeek = cellIso >= weekStartIso && cellIso <= weekEndIso;
        cells += `<span class="mini-cal-cell ${inCurrentWeek ? 'mini-cal-cell--active' : ''}" onclick="jumpToWeekContaining('${cellIso}')">${d}</span>`;
    }

    el.innerHTML = `
        <div class="mini-cal-title">${monthLabel}</div>
        <div class="mini-cal-grid">${cells}</div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
