// 3C Production Manager — app init + Tasks tab + modals

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requireLogin();
    } catch {
        return; // login cancelled — auth.js already showed the sign-in message
    }
    await initWeeklyBoard();
    await renderTasks();
});

function switchMainTab(tab) {
    document.getElementById('tasksTab').style.display = tab === 'tasks' ? 'block' : 'none';
    document.getElementById('pipelineTab').style.display = tab === 'pipeline' ? 'block' : 'none';
    document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`mainTabBtn-${tab}`).classList.add('active');
}

// ── Tasks ──────────────────────────────────────────────────
async function renderTasks() {
    const tasks = await apiGetTasks();
    const list = document.getElementById('taskList');
    list.innerHTML = tasks.map(t => `
        <div class="task-row ${t.done ? 'done' : ''}">
            <input type="checkbox" class="task-checkbox" ${t.done ? 'checked' : ''}
                onchange="toggleTaskDone('${t.id}', this.checked)">
            <span class="task-title">${escapeHtml(t.title)}</span>
            ${t.due_date ? `<span class="task-due">${t.due_date}</span>` : ''}
            <button class="btn btn-ghost" style="padding:4px 10px;" onclick="deleteTask('${t.id}')">✕</button>
        </div>
    `).join('') || '<p style="opacity:.5;padding:1rem;">No tasks yet.</p>';
}

async function addTask() {
    const titleInput = document.getElementById('newTaskTitle');
    const dueInput = document.getElementById('newTaskDue');
    const title = titleInput.value.trim();
    if (!title) return;
    await apiCreateTask({ title, due_date: dueInput.value || null });
    titleInput.value = '';
    dueInput.value = '';
    await renderTasks();
}

async function toggleTaskDone(id, done) {
    await apiUpdateTask(id, { done: done ? 1 : 0 });
    await renderTasks();
}

async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    await apiDeleteTask(id);
    await renderTasks();
}

// ── Add Platform modal ────────────────────────────────────
function showAddPlatformModal() {
    document.getElementById('addPlatformModal').classList.add('active');
}

function closeAddPlatformModal() {
    document.getElementById('addPlatformModal').classList.remove('active');
    document.getElementById('newPlatformName').value = '';
    document.getElementById('newPlatformChecklist').value = '';
}

async function saveNewPlatform() {
    const name = document.getElementById('newPlatformName').value.trim();
    const checklistRaw = document.getElementById('newPlatformChecklist').value.trim();
    const needsArchive = document.getElementById('newPlatformNeedsArchive').checked;
    if (!name || !checklistRaw) return alert('Platform name and checklist steps are required.');

    const checklist = checklistRaw.split(',').map(s => s.trim()).filter(Boolean);
    await apiCreateTemplate({
        type_name: name,
        platform: name.toLowerCase().replace(/\s+/g, '-'),
        checklist,
        needs_archive: needsArchive,
    });
    closeAddPlatformModal();
    templatesCache = await apiGetTemplates();
    renderPlatformTabs();
}

// ── Add Content modal ─────────────────────────────────────
function showAddContentModal() {
    const select = document.getElementById('newContentTemplate');
    const platformTemplates = templatesCache.filter(t => t.platform === currentPlatform);
    select.innerHTML = platformTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.type_name)}</option>`).join('');
    document.getElementById('addContentModal').classList.add('active');
}

function closeAddContentModal() {
    document.getElementById('addContentModal').classList.remove('active');
    document.getElementById('newContentTitle').value = '';
    document.getElementById('newContentDate').value = '';
    document.getElementById('newContentTime').value = '';
}

async function saveNewContent() {
    const templateId = document.getElementById('newContentTemplate').value;
    const title = document.getElementById('newContentTitle').value.trim();
    const date = document.getElementById('newContentDate').value || null;
    const time = document.getElementById('newContentTime').value || null;
    if (!templateId || !title) return alert('Title is required.');

    await apiCreatePipelineItem({
        template_id: templateId,
        platform: currentPlatform,
        title,
        scheduled_date: date,
        scheduled_time: time,
    });
    closeAddContentModal();
    await renderBoard();
}
