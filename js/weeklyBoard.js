// 3C Production Manager — weekly board
// Mon–Sun week view (Chef works by week, not month) with the 5-stage
// board: Create, Review, Schedule, Publish, Archive.

const STAGES = [
    { key: 'create', label: 'Create' },
    { key: 'review', label: 'Review' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'publish', label: 'Publish' },
    { key: 'archive', label: 'Archive' },
];

let currentWeekStart = mondayOf(new Date());
let currentPlatform = 'youtube';
let templatesCache = [];

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
    templatesCache = await apiGetTemplates();
    renderPlatformTabs();
    await renderBoard();
}

function renderPlatformTabs() {
    const platforms = [...new Set(templatesCache.filter(t => t.platform).map(t => t.platform))];
    const wrap = document.getElementById('platformTabs');
    wrap.innerHTML = platforms.map(p => `
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

async function renderBoard() {
    document.getElementById('weekLabel').textContent = formatWeekLabel(currentWeekStart);

    const items = await apiGetPipelineItems({
        platform: currentPlatform,
        weekStart: isoDate(currentWeekStart),
        weekEnd: isoDate(weekEnd(currentWeekStart)),
    });

    const board = document.getElementById('stageBoard');
    board.innerHTML = STAGES.map(stage => {
        const stageItems = items.filter(i => i.stage === stage.key);
        return `
            <div class="stage-column" data-stage="${stage.key}">
                <div class="stage-column-title">${stage.label} (${stageItems.length})</div>
                ${stageItems.map(renderCard).join('')}
                ${stage.key === 'create' ? `<button class="btn btn-add" style="width:100%;margin-top:6px;" onclick="showAddContentModal()">+ Add content</button>` : ''}
            </div>
        `;
    }).join('');
}

function renderCard(item) {
    const template = templatesCache.find(t => t.id === item.template_id);
    const checklist = template ? template.checklist : [];
    const state = item.checklist_state || {};
    const doneCount = checklist.filter(step => state[step]).length;
    const dateLabel = item.scheduled_date
        ? new Date(item.scheduled_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'numeric' })
        : 'No date';
    return `
        <div class="pipeline-card" onclick="openChecklistPanel('${item.id}')">
            <div class="pipeline-card-title">${escapeHtml(item.title)}</div>
            <div class="pipeline-card-meta">
                <span>${dateLabel}${item.scheduled_time ? ' ' + item.scheduled_time : ''}</span>
            </div>
            ${checklist.length ? `<div class="pipeline-card-progress">${doneCount}/${checklist.length} steps</div>` : ''}
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
