// 3C Production Manager — archive / export view
// Once content reaches Publish, this shows it as a spreadsheet-style
// table for the current platform + week, with a CSV download.

async function openExportView() {
    const items = await apiGetPipelineItems({
        platform: currentPlatform,
        weekStart: isoDate(currentWeekStart),
        weekEnd: isoDate(weekEnd(currentWeekStart)),
    });
    const published = items.filter(i => i.stage === 'publish' || i.stage === 'archive');

    const rows = published.map(i => `
        <tr>
            <td>${escapeHtml(i.title)}</td>
            <td>${i.scheduled_date || '—'}</td>
            <td>${i.scheduled_time || '—'}</td>
            <td>${i.stage === 'archive' ? 'Archived' : 'Published'}</td>
            <td>${i.archive_confirmed ? '✓' : '—'}</td>
        </tr>
    `).join('');

    document.getElementById('exportModalBody').innerHTML = `
        <table class="export-table">
            <thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Status</th><th>Archived</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="opacity:.5;">Nothing published yet this week.</td></tr>'}</tbody>
        </table>
        <button class="btn btn-primary" style="margin-top:1rem;" onclick="downloadCsv()">Download CSV</button>
    `;
    document.getElementById('exportModal').classList.add('active');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

async function downloadCsv() {
    const blob = await apiExportUrl({
        platform: currentPlatform,
        weekStart: isoDate(currentWeekStart),
        weekEnd: isoDate(weekEnd(currentWeekStart)),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPlatform}-${isoDate(currentWeekStart)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
