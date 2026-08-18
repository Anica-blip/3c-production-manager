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

// ── Tasks — diary, scoped to one date at a time ──────────────────
let currentDiaryDate = todayIso();

async function loadDiaryPage(date) {
    currentDiaryDate = date;
    document.getElementById('diaryDateInput').value = date;
    const entries = await apiGetDiaryEntries(date);
    const list = document.getElementById('diaryEntryList');
    list.innerHTML = entries.length
        ? entries.map(e => `
            <div class="diary-entry">
                <span class="diary-entry-time">${e.entry_time || '—'}</span>
                <span class="diary-entry-text">${escapeHtml(e.text)}</span>
                <button class="btn btn-ghost" style="padding:2px 8px;" onclick="deleteDiaryEntry('${e.id}')">✕</button>
            </div>
        `).join('')
        : '<p style="opacity:.5;padding:1rem 0;">Nothing logged for this day yet.</p>';
}

function changeDiaryDate() {
    const date = document.getElementById('diaryDateInput').value;
    if (date) loadDiaryPage(date);
}

async function addDiaryEntry() {
    const textInput = document.getElementById('newDiaryText');
    const timeInput = document.getElementById('newDiaryTime');
    const text = textInput.value.trim();
    if (!text) return;
    await apiCreateDiaryEntry({ entry_date: currentDiaryDate, entry_time: timeInput.value || null, text });
    textInput.value = '';
    timeInput.value = '';
    await loadDiaryPage(currentDiaryDate);
}

async function deleteDiaryEntry(id) {
    if (!confirm('Delete this entry?')) return;
    await apiDeleteDiaryEntry(id);
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
