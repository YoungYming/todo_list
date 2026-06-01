/**
 * 图片/文件识别拆解（骨架）：上传 → 识别 → 可编辑子任务列表 → 入库创建 Epic。
 * 识别后端未配置大模型时返回 503，这里给出清晰提示（等配置 LLM key 即可用）。
 */
(function () {
  var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  var modal = document.getElementById('ingest-modal');
  if (!modal) return;

  var backdrop = document.getElementById('ingest-backdrop');
  var fileInput = document.getElementById('ingest-file');
  var runBtn = document.getElementById('ingest-run');
  var statusEl = document.getElementById('ingest-status');
  var resultBox = document.getElementById('ingest-result');
  var titleInput = document.getElementById('ingest-epic-title');
  var dueInput = document.getElementById('ingest-epic-due');
  var listEl = document.getElementById('ingest-task-list');
  var addBtn = document.getElementById('ingest-add-task');
  var cancelBtn = document.getElementById('ingest-cancel');
  var commitBtn = document.getElementById('ingest-commit');

  var tasks = [];  // { title, est_minutes, due_date }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = 'ingest-status' + (kind ? ' ingest-status--' + kind : '');
  }

  function open() {
    modal.removeAttribute('hidden');
    if (fileInput) fileInput.value = '';
    tasks = [];
    if (resultBox) resultBox.hidden = true;
    if (commitBtn) commitBtn.hidden = true;
    setStatus('', '');
  }

  function close() {
    modal.setAttribute('hidden', '');
  }

  function renderTasks() {
    if (!listEl) return;
    listEl.innerHTML = '';
    tasks.forEach(function (t, i) {
      var li = document.createElement('li');
      li.className = 'ingest-task-item';

      var titleI = document.createElement('input');
      titleI.type = 'text';
      titleI.className = 'form-group__input';
      titleI.value = t.title || '';
      titleI.placeholder = '子任务标题';
      titleI.addEventListener('input', function () { tasks[i].title = titleI.value; });

      var minI = document.createElement('input');
      minI.type = 'number';
      minI.className = 'form-group__input';
      minI.min = 1; minI.max = 480; minI.style.width = '78px';
      minI.value = t.est_minutes || 45;
      minI.addEventListener('input', function () { tasks[i].est_minutes = parseInt(minI.value, 10) || 45; });

      var dueI = document.createElement('input');
      dueI.type = 'date';
      dueI.className = 'form-group__input';
      dueI.style.width = '150px';
      dueI.value = t.due_date || '';
      dueI.addEventListener('input', function () { tasks[i].due_date = dueI.value || null; });

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--small btn--danger';
      del.textContent = '删除';
      del.addEventListener('click', function () { tasks.splice(i, 1); renderTasks(); });

      li.appendChild(titleI);
      li.appendChild(minI);
      li.appendChild(document.createTextNode('分钟'));
      li.appendChild(dueI);
      li.appendChild(del);
      listEl.appendChild(li);
    });
  }

  function showResult(data) {
    if (titleInput) titleInput.value = data.title || '识别的任务';
    tasks = (data.tasks || []).map(function (t) {
      return { title: t.title || '', est_minutes: t.est_minutes || 45, due_date: t.due_date || null };
    });
    renderTasks();
    if (resultBox) resultBox.hidden = false;
    if (commitBtn) commitBtn.hidden = false;
    setStatus(data.summary ? ('识别概述：' + data.summary) : '识别完成，请检查并编辑下方子任务。', 'ok');
  }

  function run() {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      toast('请先选择一个图片或文档', 'error');
      return;
    }
    var fd = new FormData();
    fd.append('file', fileInput.files[0]);
    runBtn.disabled = true;
    setStatus('识别中，请稍候…', 'loading');
    fetch(base + '/api/ingest/extract', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = {};
          try { data = text ? JSON.parse(text) : {}; } catch (_) {}
          if (res.ok) return data;
          var msg = data && data.detail ? data.detail : ('识别失败（' + res.status + '）');
          if (res.status === 503) {
            // 骨架占位：未配置大模型
            setStatus(msg, 'warn');
          }
          return Promise.reject(new Error(msg));
        });
      })
      .then(function (data) { showResult(data); })
      .catch(function (err) {
        if (statusEl.className.indexOf('warn') < 0) setStatus(err.message || '识别失败', 'error');
        if (resultBox) resultBox.hidden = true;
        if (commitBtn) commitBtn.hidden = true;
      })
      .finally(function () { runBtn.disabled = false; });
  }

  function commit() {
    var title = (titleInput && titleInput.value || '').trim();
    if (!title) { toast('请填写总任务标题', 'error'); return; }
    var clean = tasks.filter(function (t) { return (t.title || '').trim(); });
    if (!clean.length) { toast('请至少保留一条子任务', 'error'); return; }
    commitBtn.disabled = true;
    fetch(base + '/api/ingest/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({
        title: title,
        due_date: (dueInput && dueInput.value) || null,
        tasks: clean.map(function (t) { return { title: t.title.trim(), est_minutes: t.est_minutes || 45, due_date: t.due_date || null }; })
      })
    })
      .then(function (res) { return res.ok ? res.json() : res.text().then(function (t) { throw new Error(t || '创建失败'); }); })
      .then(function (r) {
        toast('已创建 Epic，含 ' + (r.task_count || clean.length) + ' 个子任务', 'success');
        close();
        if (window.todoChanged) window.todoChanged({ source: 'ingest-commit', epicId: r.epic_id });
        else document.dispatchEvent(new CustomEvent('todo:changed', { detail: { source: 'ingest-commit' } }));
      })
      .catch(function (err) { toast(err.message || '创建失败', 'error'); })
      .finally(function () { commitBtn.disabled = false; });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#btn-open-ingest')) { e.preventDefault(); open(); }
  });
  if (runBtn) runBtn.addEventListener('click', run);
  if (addBtn) addBtn.addEventListener('click', function () { tasks.push({ title: '', est_minutes: 45, due_date: null }); renderTasks(); });
  if (cancelBtn) cancelBtn.addEventListener('click', close);
  if (backdrop) backdrop.addEventListener('click', close);
  if (commitBtn) commitBtn.addEventListener('click', commit);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hasAttribute('hidden')) close();
  });
})();
