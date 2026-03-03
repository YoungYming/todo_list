(function () {
  var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
  var epics = Array.isArray(window.EPICS_DATA) ? window.EPICS_DATA.slice() : [];
  var boardKey = 'todo_today_board_epics';

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  function parseError(res, fallback) {
    return res.text().then(function (text) {
      try {
        var j = text ? JSON.parse(text) : {};
        if (j.detail) return Promise.reject(new Error(Array.isArray(j.detail) ? j.detail.map(function (d) { return d.msg || d; }).join(', ') : String(j.detail)));
      } catch (_) {}
      return Promise.reject(new Error(fallback || '请求失败'));
    });
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function category(epic) {
    if ((epic.progress || 0) >= 1) return 'done';
    if (epic.due_date && epic.due_date < todayStr()) return 'overdue';
    return 'in_progress';
  }

  function getBoardIds() {
    try {
      var arr = JSON.parse(localStorage.getItem(boardKey) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function setBoardIds(ids) {
    localStorage.setItem(boardKey, JSON.stringify(ids));
  }

  function renderCard(epic) {
    var el = document.createElement('div');
    el.className = 'epic-card';
    el.draggable = true;
    el.dataset.epicId = String(epic.id);
    el.dataset.category = category(epic);
    el.innerHTML =
      '<div class="epic-card__title">' + epic.title + '</div>' +
      '<div class="epic-card__meta">进度 ' + Math.round((epic.progress || 0) * 100) + '% ' + (epic.due_date ? ('· 截止 ' + epic.due_date) : '') + '</div>' +
      '<div class="form-actions" style="margin-top:8px">' +
        '<a class="btn btn--secondary" href="/app/epics/' + epic.id + '">详情</a>' +
      '</div>';
    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', String(epic.id));
    });
    return el;
  }

  function rerender() {
    var colIn = document.getElementById('col-in-progress');
    var colDone = document.getElementById('col-done');
    var colOver = document.getElementById('col-overdue');
    var board = document.getElementById('today-board');
    [colIn, colDone, colOver, board].forEach(function (c) { if (c) c.innerHTML = ''; });

    var boardIds = getBoardIds();
    epics.forEach(function (e) {
      var c = category(e);
      var card = renderCard(e);
      if (c === 'done' && colDone) colDone.appendChild(card);
      else if (c === 'overdue' && colOver) colOver.appendChild(card);
      else if (colIn) colIn.appendChild(card);

      if (boardIds.indexOf(e.id) >= 0 && board) {
        board.appendChild(renderCard(e));
      }
    });
  }

  function bindDropzone(el, onDrop) {
    if (!el) return;
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', function () { el.classList.remove('drag-over'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      var id = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (id) onDrop(id);
    });
  }

  function patchEpic(epicId, payload) {
    return fetch(base + '/api/epics/' + epicId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) return parseError(res, '更新 Epic 失败');
      return res.json();
    });
  }

  function bindBoardInteractions() {
    bindDropzone(document.getElementById('today-board'), function (id) {
      var ids = getBoardIds();
      if (ids.indexOf(id) < 0) ids.push(id);
      setBoardIds(ids);
      toast('已加入今日需完成白板', 'success');
      rerender();
    });

    bindDropzone(document.getElementById('col-in-progress'), function (id) {
      var e = epics.find(function (x) { return x.id === id; });
      if (!e) return;
      var needUpdate = category(e) === 'overdue';
      if (!needUpdate) return;

      var newDue = prompt('该 Epic 已过期。请输入新的截止日期（YYYY-MM-DD）', e.due_date || '');
      if (!newDue) return;
      var newDesc = prompt('可选：更新描述（留空则保留原描述）', e.description || '') || e.description;
      patchEpic(id, { due_date: newDue, description: newDesc })
        .then(function (updated) {
          var idx = epics.findIndex(function (x) { return x.id === id; });
          if (idx >= 0) epics[idx] = updated;
          toast('已移回进行中', 'success');
          rerender();
        })
        .catch(function (err) { toast(err.message, 'error'); });
    });
  }

  function bindCreate() {
    var form = document.getElementById('form-create-epic');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var payload = {
        title: fd.get('title'),
        description: fd.get('description') || null,
        due_date: fd.get('due_date') || null,
        priority: fd.get('priority') ? parseInt(fd.get('priority'), 10) : 3
      };
      fetch(base + '/api/epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.ok ? res.json() : parseError(res, '创建失败'); })
        .then(function (epic) {
          epics.unshift(epic);
          form.reset();
          toast('创建成功', 'success');
          rerender();
        })
        .catch(function (err) { toast(err.message, 'error'); });
    });
  }

  rerender();
  bindBoardInteractions();
  bindCreate();
})();
