// 3C Production Manager — app init + Tasks diary + Add Platform modal

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requireLogin();
    } catch {
        return; // login cancelled/redirecting
    }
    await initWeeklyBoard();
    await loadDiaryPage(todayIso());
});

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function switchMainTab(tab) {
    document.getElementById('tasksTab').style.display = tab === 'tasks' ? 'block' : 'none';
    document.getElementById('pipelineTab').style.display = tab === 'pipeline' ? 'block' : 'none';
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`mainTabBtn-${tab}`).classList.add('active');
}

// ── Tasks — sticky notes, scoped to one date at a time ───────────
let currentDiaryDate = todayIso();
const STICKY_COLORS = ['sticky--yellow', 'sticky--pink', 'sticky--blue', 'sticky--green', 'sticky--orange'];

async function loadDiaryPage(date) {
    currentDiaryDate = date;
    document.getElementById('diaryDateInput').value = date;
    const notes = await apiGetStickyNotes(date);
    const list = document.getElementById('diaryEntryList');
    list.innerHTML = notes.length
        ? notes.map((n, i) => renderStickyNote(n, i)).join('')
        : '<p style="opacity:.5;padding:1rem 0;">Nothing logged for this day yet.</p>';
}

function renderStickyNote(note, index) {
    const colorClass = STICKY_COLORS[index % STICKY_COLORS.length];
    const bullets = note.description || [];
    return `
        <div class="sticky-note ${colorClass}">
            <button class="sticky-note-delete" onclick="deleteStickyNote('${note.id}')" title="Delete">✕</button>
            <div class="sticky-note-title">Title: ${escapeHtml(note.title)}</div>
            ${bullets.length ? `
                <div class="sticky-note-description-label">Description:</div>
                <div class="sticky-note-bullets">
                    ${bullets.map((b, i) => `
                        <label class="sticky-note-bullet ${b.done ? 'done' : ''}">
                            <input type="checkbox" ${b.done ? 'checked' : ''} onchange="toggleStickyBullet('${note.id}', ${i}, this.checked)">
                            <span>${escapeHtml(b.text)}</span>
                        </label>
                    `).join('')}
                </div>
            ` : ''}
            <div class="sticky-note-time">${note.entry_time || ''}</div>
        </div>
    `;
}

async function toggleStickyBullet(noteId, bulletIndex, checked) {
    const notes = await apiGetStickyNotes(currentDiaryDate);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const description = note.description.map((b, i) => i === bulletIndex ? { ...b, done: checked } : b);
    await apiUpdateStickyNote(noteId, description);
    await loadDiaryPage(currentDiaryDate);
}

function changeDiaryDate() {
    const date = document.getElementById('diaryDateInput').value;
    if (date) loadDiaryPage(date);
}

async function addStickyNote() {
    const titleInput = document.getElementById('newNoteTitle');
    const descInput = document.getElementById('newNoteDescription');
    const timeInput = document.getElementById('newNoteTime');

    const title = titleInput.value.trim();
    if (!title) return alert('Title is required.');

    const description = descInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    await apiCreateStickyNote({
        entry_date: currentDiaryDate,
        entry_time: timeInput.value || null,
        title,
        description,
    });

    titleInput.value = '';
    descInput.value = '';
    timeInput.value = '';
    await loadDiaryPage(currentDiaryDate);
}

async function deleteStickyNote(id) {
    if (!confirm('Delete this sticky note?')) return;
    await apiDeleteStickyNote(id);
    await loadDiaryPage(currentDiaryDate);
}

// ── Add Platform modal — its own small checklist editor ──────────
let newPlatformChecklist = [];

function showAddPlatformModal() {
    newPlatformChecklist = [];
    document.getElementById('newPlatformName').value = '';
    renderNewPlatformChecklist();
    document.getElementById('addPlatformModal').classList.add('active');
}

function closeAddPlatformModal() {
    document.getElementById('addPlatformModal').classList.remove('active');
}

function renderNewPlatformChecklist() {
    const wrap = document.getElementById('newPlatformChecklistEditor');
    wrap.innerHTML = newPlatformChecklist.map((step, i) => `
        <div class="checklist-item">
            <span style="flex:1;">${escapeHtml(step)}</span>
            <button type="button" onclick="removeNewPlatformStep(${i})">✕</button>
        </div>
    `).join('') + `
        <div class="checklist-add-row">
            <input type="text" id="newPlatformStepInput" class="form-input" placeholder="Add a default step..."
                onkeydown="if(event.key==='Enter'){event.preventDefault();addNewPlatformStep();}">
            <button type="button" class="btn btn-ghost" onclick="addNewPlatformStep()">+ Add</button>
        </div>
    `;
}

function addNewPlatformStep() {
    const input = document.getElementById('newPlatformStepInput');
    const val = input.value.trim();
    if (!val) return;
    newPlatformChecklist.push(val);
    input.value = '';
    renderNewPlatformChecklist();
}

function removeNewPlatformStep(i) {
    newPlatformChecklist.splice(i, 1);
    renderNewPlatformChecklist();
}

async function saveNewPlatform() {
    const name = document.getElementById('newPlatformName').value.trim();
    if (!name) return alert('Platform name is required.');
    await apiCreatePlatform({ platform: name.toLowerCase().replace(/\s+/g, '-'), checklist: newPlatformChecklist });
    closeAddPlatformModal();
    currentPlatform = name.toLowerCase().replace(/\s+/g, '-');
    await initWeeklyBoard();
}
