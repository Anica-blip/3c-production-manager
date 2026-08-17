// 3C Production Manager — checklist detail panel
//
// Stage auto-advance: the board only has 5 generic columns, but each
// item's real checklist is type-specific (e.g. YouTube's 8 steps). To
// connect the two without a separate mapping config: when a ticked
// checklist step's name matches a stage name exactly (Create, Review,
// Schedule, Publish, Archive — case-insensitive), the card moves to
// that stage. Steps that don't match a stage name (Script, Voiceover,
// Record...) are just prerequisites within whichever stage the card is
// currently in.

let currentItemId = null;

async function openChecklistPanel(itemId) {
    currentItemId = itemId;
    const items = await apiGetPipelineItems({ platform: currentPlatform,
        weekStart: isoDate(currentWeekStart), weekEnd: isoDate(weekEnd(currentWeekStart)) });
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const template = templatesCache.find(t => t.id === item.template_id);
    const checklist = template ? template.checklist : [];
    const state = item.checklist_state || {};

    document.getElementById('detailTitle').textContent = item.title;

    const stageNames = STAGES.map(s => s.label.toLowerCase());

    document.getElementById('detailChecklist').innerHTML = checklist.map(step => {
        const checked = !!state[step];
        const isStageStep = stageNames.includes(step.toLowerCase());
        return `
            <div class="checklist-item ${checked ? 'checked' : ''}">
                <input type="checkbox" id="cb-${step.replace(/\s+/g, '-')}" ${checked ? 'checked' : ''}
                    onchange="toggleChecklistStep('${escapeHtml(step)}', this.checked)">
                <label for="cb-${step.replace(/\s+/g, '-')}">${escapeHtml(step)}${isStageStep ? ' <span style="opacity:.5">(board stage)</span>' : ''}</label>
            </div>
        `;
    }).join('');

    // Schedule sub-requirements — only relevant once the item's actual
    // checklist includes a "Schedule" step at all.
    const scheduleBlock = document.getElementById('scheduleSubsteps');
    if (checklist.some(s => s.toLowerCase() === 'schedule')) {
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

    // Archive — only shown for templates that actually need it.
    const archiveBlock = document.getElementById('archiveBlock');
    if (template && template.needs_archive) {
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

async function toggleChecklistStep(step, checked) {
    if (!currentItemId) return;
    await apiUpdatePipelineItem(currentItemId, { checklist_state: { [step]: checked } });

    // Auto-advance: find the furthest-along stage-named step that's ticked.
    if (checked) {
        const stageMatch = STAGES.find(s => s.label.toLowerCase() === step.toLowerCase());
        if (stageMatch) {
            await apiUpdatePipelineItem(currentItemId, { stage: stageMatch.key });
        }
    }

    await renderBoard();
    await openChecklistPanel(currentItemId);
}

async function toggleScheduleSubstep(field, checked) {
    if (!currentItemId) return;
    await apiUpdatePipelineItem(currentItemId, { [field]: checked ? 1 : 0 });
    await openChecklistPanel(currentItemId);
}

async function confirmArchive() {
    if (!currentItemId) return;
    const ref = document.getElementById('archiveNoteRef')?.value.trim() || null;
    await apiUpdatePipelineItem(currentItemId, { archive_confirmed: true, archive_note_ref: ref, stage: 'archive' });
    await renderBoard();
    await openChecklistPanel(currentItemId);
}
