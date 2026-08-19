// 3C Production Manager — app init + Tasks diary + Add Platform modal

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requireLogin();
    } catch {
        return; // login cancelled/redirecting
    }
    await initWeeklyBoard();
    await renderTasksWeek();
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

// ── Tasks — week-grouped sticky notes, own week nav independent
// of Pipeline's ────────────────────────────────────────────────
let currentTasksWeekStart = mondayOf(new Date());
let currentWeekNotesCache = [];
let editingNoteId = null; // null = composing new, else editing this note's id
let noteDescriptionBullets = [{ text: '', done: false }];
const STICKY_COLORS = ['sticky--yellow', 'sticky--pink', 'sticky--blue', 'sticky--green', 'sticky--orange'];

function tasksWeekEnd(weekStart) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
}

function formatTasksWeekLabel(weekStart) {
    const end = tasksWeekEnd(weekStart);
    const opts = { day: 'numeric', month: 'short' };
    return `${weekStart.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)}`;
}

function formatDayHeader(dateIso) {
    const d = new Date(dateIso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

async function changeTasksWeek(delta) {
    const d = new Date(currentTasksWeekStart);
    d.setDate(d.getDate() + delta * 7);
    currentTasksWeekStart = d;
    await renderTasksWeek();
}

async function jumpTasksToWeekContaining(dateStr) {
    currentTasksWeekStart = mondayOf(new Date(dateStr + 'T00:00:00'));
    await renderTasksWeek();
}

async function renderTasksWeek() {
    document.getElementById('tasksWeekLabel').textContent = formatTasksWeekLabel(currentTasksWeekStart);

    currentWeekNotesCache = await apiGetStickyNotesForWeek({
        weekStart: isoDate(currentTasksWeekStart),
        weekEnd: isoDate(tasksWeekEnd(currentTasksWeekStart)),
    });

    const byDate = {};
    currentWeekNotesCache.forEach(n => { (byDate[n.entry_date] ||= []).push(n); });
    const dates = Object.keys(byDate).sort();

    const container = document.getElementById('diaryEntryList');
    container.innerHTML = dates.length
        ? dates.map(date => `
            <div class="diary-day-section">
                <div class="diary-day-header">${formatDayHeader(date)}</div>
                <div class="sticky-note-board">
                    ${byDate[date].map((n, i) => renderStickyNote(n, i)).join('')}
                </div>
            </div>
        `).join('')
        : '<p style="opacity:.5;padding:1rem 0;">Nothing logged this week yet.</p>';

    renderTasksMiniCalendar();
}

function renderTasksMiniCalendar() {
    const el = document.getElementById('tasksMiniCalendar');
    if (!el) return;

    const refDate = new Date(currentTasksWeekStart);
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const monthLabel = refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(year, month, 1);
    const startPad = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekStartIso = isoDate(currentTasksWeekStart);
    const weekEndIso = isoDate(tasksWeekEnd(currentTasksWeekStart));

    let cells = '';
    for (let i = 0; i < startPad; i++) cells += '<span class="mini-cal-cell mini-cal-cell--empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
        const cellIso = isoDate(new Date(year, month, d));
        const inWeek = cellIso >= weekStartIso && cellIso <= weekEndIso;
        cells += `<span class="mini-cal-cell ${inWeek ? 'mini-cal-cell--active' : ''}" onclick="jumpTasksToWeekContaining('${cellIso}')">${d}</span>`;
    }

    el.innerHTML = `<div class="mini-cal-title">${monthLabel}</div><div class="mini-cal-grid">${cells}</div>`;
}

function renderStickyNote(note, index) {
    const colorClass = STICKY_COLORS[index % STICKY_COLORS.length];
    const bullets = note.description || [];
    return `
        <div class="sticky-note ${colorClass}">
            <div class="sticky-note-actions">
                <button class="sticky-note-icon-btn" onclick="openNoteSidebarForEdit('${note.id}')" title="Edit">✎</button>
                <button class="sticky-note-icon-btn" onclick="deleteStickyNote('${note.id}')" title="Delete">✕</button>
            </div>
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
    const note = currentWeekNotesCache.find(n => n.id === noteId);
    if (!note) return;
    const description = note.description.map((b, i) => i === bulletIndex ? { ...b, done: checked } : b);
    await apiUpdateStickyNote(noteId, { description });
    await renderTasksWeek();
}

async function deleteStickyNote(id) {
    if (!confirm('Delete this sticky note?')) return;
    await apiDeleteStickyNote(id);
    await renderTasksWeek();
}

// ── Slide-out sidebar — composes a new note or edits an existing one ──
function openNoteSidebar() {
    editingNoteId = null;
    document.getElementById('noteSidebarTitle').textContent = 'New Sticky Note';
    document.getElementById('noteDateInput').value = isoDate(currentTasksWeekStart);
    document.getElementById('noteTimeInput').value = '';
    document.getElementById('noteTitleInput').value = '';
    noteDescriptionBullets = [{ text: '', done: false }];
    renderNoteDescriptionEditor();
    document.getElementById('noteSidebar').classList.add('active');
    document.getElementById('noteSidebarOverlay').classList.add('active');
}

function openNoteSidebarForEdit(noteId) {
    const note = currentWeekNotesCache.find(n => n.id === noteId);
    if (!note) return;
    editingNoteId = note.id;
    document.getElementById('noteSidebarTitle').textContent = 'Edit Sticky Note';
    document.getElementById('noteDateInput').value = note.entry_date;
    document.getElementById('noteTimeInput').value = note.entry_time || '';
    document.getElementById('noteTitleInput').value = note.title;
    noteDescriptionBullets = note.description.length
        ? note.description.map(b => ({ ...b }))
        : [{ text: '', done: false }];
    renderNoteDescriptionEditor();
    document.getElementById('noteSidebar').classList.add('active');
    document.getElementById('noteSidebarOverlay').classList.add('active');
}

function closeNoteSidebar() {
    document.getElementById('noteSidebar').classList.remove('active');
    document.getElementById('noteSidebarOverlay').classList.remove('active');
    editingNoteId = null;
}

// Live bullet composer — a box per line, Enter starts a new one, an
// empty line's Backspace removes it. Matches Chef's own to-do habit.
function renderNoteDescriptionEditor() {
    const wrap = document.getElementById('noteDescriptionEditor');
    wrap.innerHTML = noteDescriptionBullets.map((b, i) => `
        <div class="note-bullet-row">
            <span class="note-bullet-box"></span>
            <input type="text" class="note-bullet-input" value="${escapeHtml(b.text)}"
                oninput="updateNoteBullet(${i}, this.value)"
                onkeydown="handleNoteBulletKeydown(event, ${i})">
        </div>
    `).join('');
    const inputs = wrap.querySelectorAll('.note-bullet-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function updateNoteBullet(i, value) {
    noteDescriptionBullets[i].text = value;
}

function handleNoteBulletKeydown(event, i) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (i === noteDescriptionBullets.length - 1) {
            noteDescriptionBullets.push({ text: '', done: false });
            renderNoteDescriptionEditor();
        }
    } else if (event.key === 'Backspace' && noteDescriptionBullets[i].text === '' && noteDescriptionBullets.length > 1) {
        event.preventDefault();
        noteDescriptionBullets.splice(i, 1);
        renderNoteDescriptionEditor();
    }
}

async function saveStickyNoteFromSidebar() {
    const title = document.getElementById('noteTitleInput').value.trim();
    const date = document.getElementById('noteDateInput').value;
    const time = document.getElementById('noteTimeInput').value || null;
    if (!title) return alert('Title is required.');
    if (!date) return alert('Date is required.');

    const description = noteDescriptionBullets
        .map(b => ({ text: b.text.trim(), done: b.done }))
        .filter(b => b.text);

    if (editingNoteId) {
        await apiUpdateStickyNote(editingNoteId, { title, entry_date: date, entry_time: time, description });
    } else {
        await apiCreateStickyNote({ entry_date: date, entry_time: time, title, description: description.map(b => b.text) });
    }
    closeNoteSidebar();
    await renderTasksWeek();
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
