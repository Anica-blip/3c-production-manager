// 3C Production Manager — checklist detail / add-task panel
//
// One panel, two modes. Adding a task and editing one later share the
// exact same checklist editor — add a step, delete a step, reorder up
// or down — the only difference is edit mode also shows a tick-box per
// step and saves changes immediately instead of waiting for one Save.
//
// Auto-advance: ticking a step whose name matches a board stage
// (Create/Review/Schedule/Publish/Archive, case-insensitive) moves the
// item to that stage. Since every task's checklist is now fully custom,
// this only fires if Chef's own checklist happens to include a step
// with that exact name — nothing forces it.

let currentItemId = null;
let editingChecklist = []; // working array of {step, done} while the panel is open

function openAddTaskModal() {
    if (!currentPlatform) { alert('Add a platform first.'); return; }

    currentItemId = null;
    editingChecklist = [];

    document.getElementById('detailTitle').innerHTML = `<input type="text" id="taskTitleInput" class="form-input" placeholder="Task title...">`;
    document.getElementById('detailDateTime').style.display = 'flex';
    document.getElementById('taskDateInput').value = '';
    document.getElementById('taskTimeInput').value = '';
    document.getElementById('detailSaveBtn').style.display = 'block';
    document.getElementById('scheduleSubsteps').style.display = 'none';
    document.getElementById('archiveBlock').style.display = 'none';

    renderChecklistEditor();

    // Pre-fill from the platform's default — a starting suggestion,
    // fully editable from the moment it appears.
    apiGetPlatformDefault(currentPlatform).then(({ checklist }) => {
        editingChecklist = (checklist || []).map(step => ({ step, done: false }));
        renderChecklistEditor();
    });

    document.getElementById('detailPanel').classList.add('active');
    document.getElementById('detailOverlay').classList.add('active');
}

async function openChecklistPanel(itemId) {
    currentItemId = itemId;
    const items = await apiGetPipelineItems({ platform: currentPlatform,
        weekStart: isoDate(currentWeekStart), weekEnd: isoDate(weekEnd(currentWeekStart)) });
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    editingChecklist = (item.checklist || []).map(s => ({ ...s }));

    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailDateTime').style.display = 'none';
    document.getElementById('detailSaveBtn').style.display = 'none';

    renderChecklistEditor();

    const scheduleBlock = document.getElementById('scheduleSubsteps');
    if (editingChecklist.some(s => s.step.toLowerCase() === 'schedule')) {
        scheduleBlock.style.display = 'block';
        scheduleBlock.innerHTML = `
            <div class="schedule-substeps-title">Before this counts as scheduled</div>
            <div class="checklist-item ${item.scheduled_platform_done ? 'checked' : ''}">
                <input type="checkbox" ${item.scheduled_platform_done ? 'checked' : ''}
                    onchange="toggleScheduleSubstep('scheduled_platform_done', this.checked)">
                <label>Add to platform</label>
            </div>
            <div class="checklist-item ${item.scheduled_record_center_done ? 'checked' : ''}">
                <input type="checkbox" ${item.scheduled_record_center_done ? 'checked' : ''}
                    onchange="toggleScheduleSubstep('scheduled_record_center_done', this.checked)">
                <label>Add to record center</label>
            </div>
        `;
    } else {
        scheduleBlock.style.display = 'none';
    }

    const archiveBlock = document.getElementById('archiveBlock');
    if (editingChecklist.some(s => s.step.toLowerCase() === 'archive')) {
        archiveBlock.style.display = 'block';
        archiveBlock.innerHTML = item.archive_confirmed
            ? `<div class="archive-note">✓ Archived — filed to COG${item.archive_note_ref ? ': ' + escapeHtml(item.archive_note_ref) : ''}</div>`
            : `<div class="archive-note">
                   Not urgent — confirm once the .md has been filed to COG.
                   <div style="margin-top:8px;">
                     <input type="text" id="archiveNoteRef" class="form-input" placeholder="Filename or path in COG (optional)" style="margin-bottom:8px;">
                     <button class="btn btn-primary" onclick="confirmArchive()">Confirm archived</button>
                   </div>
               </div>`;
    } else {
        archiveBlock.style.display = 'none';
    }

    document.getElementById('detailPanel').classList.add('active');
    document.getElementById('detailOverlay').classList.add('active');
}

function closeChecklistPanel() {
    document.getElementById('detailPanel').classList.remove('active');
    document.getElementById('detailOverlay').classList.remove('active');
    currentItemId = null;
}

// ── Checklist editor — shared by both add and edit modes ───────
function renderChecklistEditor() {
    const wrap = document.getElementById('detailChecklist');
    wrap.innerHTML = editingChecklist.map((s, i) => `
        <div class="checklist-item ${s.done ? 'checked' : ''}">
            ${currentItemId ? `<input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleStepDone(${i}, this.checked)">` : ''}
            <input type="text" class="checklist-step-input" value="${escapeHtml(s.step)}" onchange="renameStep(${i}, this.value)">
            <span class="checklist-step-controls">
                <button type="button" onclick="moveStep(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
                <button type="button" onclick="moveStep(${i}, 1)" ${i === editingChecklist.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
                <button type="button" onclick="deleteStep(${i})" title="Delete">✕</button>
            </span>
        </div>
    `).join('') + `
        <div class="checklist-add-row">
            <input type="text" id="newStepInput" class="form-input" placeholder="Add a step..."
                onkeydown="if(event.key==='Enter'){event.preventDefault();addStep();}">
            <button type="button" class="btn btn-ghost" onclick="addStep()">+ Add</button>
        </div>
    `;
}

function addStep() {
    const input = document.getElementById('newStepInput');
    const val = input.value.trim();
    if (!val) return;
    editingChecklist.push({ step: val, done: false });
    input.value = '';
    renderChecklistEditor();
    if (currentItemId) persistChecklist();
}

function deleteStep(i) {
    editingChecklist.splice(i, 1);
    renderChecklistEditor();
    if (currentItemId) persistChecklist();
}

function moveStep(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= editingChecklist.length) return;
    [editingChecklist[i], editingChecklist[j]] = [editingChecklist[j], editingChecklist[i]];
    renderChecklistEditor();
    if (currentItemId) persistChecklist();
}

function renameStep(i, value) {
    editingChecklist[i].step = value.trim() || editingChecklist[i].step;
    if (currentItemId) persistChecklist();
}

async function toggleStepDone(i, checked) {
    editingChecklist[i].done = checked;
    await persistChecklist();

    // Recompute from scratch rather than nudge forward/back by one —
    // finds the furthest-along stage-named step that's still checked
    // right now. Ticking a later one advances; unticking it reverts to
    // whatever's still checked before it (or back to Create if nothing
    // is). Same rule for both directions, so it can never drift.
    let furthestIndex = -1;
    for (const item of editingChecklist) {
        if (!item.done) continue;
        const idx = STAGES.findIndex(s => s.label.toLowerCase() === item.step.toLowerCase());
        if (idx > furthestIndex) furthestIndex = idx;
    }
    const newStage = furthestIndex >= 0 ? STAGES[furthestIndex].key : 'create';
    await apiUpdatePipelineItem(currentItemId, { stage: newStage });

    await renderBoard();
    renderChecklistEditor();
}

async function persistChecklist() {
    if (!currentItemId) return; // new-task mode — saved once, on "Add Task"
    await apiUpdatePipelineItem(currentItemId, { checklist: editingChecklist });
}

async function toggleScheduleSubstep(field, checked) {
    if (!currentItemId) return;
    await apiUpdatePipelineItem(currentItemId, { [field]: checked ? 1 : 0 });
}

async function confirmArchive() {
    if (!currentItemId) return;
    const ref = document.getElementById('archiveNoteRef')?.value.trim() || null;
    await apiUpdatePipelineItem(currentItemId, { archive_confirmed: true, archive_note_ref: ref, stage: 'archive' });
    await renderBoard();
    await openChecklistPanel(currentItemId);
}

// ── Save a brand-new task ───────────────────────────────────────
async function saveNewTask() {
    const title = document.getElementById('taskTitleInput').value.trim();
    const date = document.getElementById('taskDateInput').value || null;
    const time = document.getElementById('taskTimeInput').value || null;
    if (!title) return alert('Title is required.');
    if (!editingChecklist.length) return alert('Add at least one checklist step.');

    await apiCreatePipelineItem({
        platform: currentPlatform,
        title,
        scheduled_date: date,
        scheduled_time: time,
        checklist: editingChecklist.map(s => s.step),
    });
    closeChecklistPanel();
    await renderBoard();
}
