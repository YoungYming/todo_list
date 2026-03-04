(function () {
  var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
  var epics = Array.isArray(window.EPICS_DATA) ? window.EPICS_DATA.slice() : [];
  var boardTaskKey = 'todo_today_board_tasks';
  var DRAG_SIDE_RATIO = 1 / 3;

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  function parseError(res, fallback) {
    return res.text().then(function (text) {
      try {
        var j = text ? JSON.parse(text) : {};
        if (j.detail) {
          var d = Array.isArray(j.detail) ? j.detail.map(function (x) { return x.msg || x; }).join(', ') : String(j.detail);
          return Promise.reject(new Error(d));
        }
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

  function getBoardTasks() {
    try {
      var arr = JSON.parse(localStorage.getItem(boardTaskKey) || '[]');
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(function (x) { return x && typeof x === 'object'; })
        .map(function (x) {
          return {
            id: parseInt(x.id, 10),
            epic_id: parseInt(x.epic_id, 10),
            title: String(x.title || ''),
            est_minutes: parseInt(x.est_minutes || 45, 10),
            due_date: x.due_date || null,
            epic_title: String(x.epic_title || '')
          };
        })
        .filter(function (x) { return x.id > 0 && x.epic_id > 0; });
    } catch (_) {
      return [];
    }
  }

  function setBoardTasks(tasks) {
    localStorage.setItem(boardTaskKey, JSON.stringify(tasks));
  }

  function addBoardTask(task, epic) {
    var items = getBoardTasks();
    if (items.some(function (x) { return x.id === task.id; })) return false;
    items.push({
      id: task.id,
      epic_id: task.epic_id,
      title: task.title,
      est_minutes: task.est_minutes || 45,
      due_date: task.due_date || null,
      epic_title: epic && epic.title ? epic.title : ''
    });
    setBoardTasks(items);
    return true;
  }

  function removeBoardTask(taskId) {
    var items = getBoardTasks();
    var next = items.filter(function (x) { return x.id !== taskId; });
    setBoardTasks(next);
  }

  function hasBoardTaskByEpic(epicId) {
    return getBoardTasks().some(function (x) { return x.epic_id === epicId; });
  }

  var draggingEpicId = null;
  var draggingFromCol = null;

  function renderSubtaskCard(task, epic, sourceCol) {
    var el = document.createElement('div');
    el.className = 'subepic-card';
    el.draggable = true;
    el.dataset.taskId = String(task.id);
    el.dataset.epicId = String(epic.id);
    var inBoard = getBoardTasks().some(function (x) { return x.id === task.id; });
    el.innerHTML =
      '<div class="subepic-card__title">' + task.title + '</div>' +
      '<div class="subepic-card__meta">' + (task.est_minutes || 45) + ' 分钟' + (inBoard ? ' · 已在白板' : '') + '</div>';

    el.addEventListener('dragstart', function (e) {
      draggingEpicId = null;
      draggingFromCol = sourceCol || 'subtask';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'task',
        task_id: task.id,
        epic_id: epic.id,
        title: task.title,
        est_minutes: task.est_minutes || 45,
        due_date: task.due_date || null,
        epic_title: epic.title
      }));
      e.dataTransfer.effectAllowed = 'move';
    });
    return el;
  }

  function renderCard(epic, sourceCol) {
    var el = document.createElement('div');
    el.className = 'epic-card';
    el.draggable = true;
    el.dataset.epicId = String(epic.id);
    el.dataset.category = category(epic);
    var inBoard = hasBoardTaskByEpic(epic.id);
    var boardBadge = inBoard
      ? '<span class="epic-card__badge" title="该 Epic 下有子卡片已加入白板">白板中有子卡片</span>'
      : '';
    el.innerHTML =
      '<div class="epic-card__head">' +
      '<div class="epic-card__title">' + epic.title + '</div>' +
      boardBadge +
      '</div>' +
      '<div class="epic-card__meta">进度 ' + Math.round((epic.progress || 0) * 100) + '% ' + (epic.due_date ? ('· 截止 ' + epic.due_date) : '') + '</div>' +
      '<div class="subepic-list"></div>' +
      '<div class="form-actions" style="margin-top:8px">' +
      '<a class="btn btn--secondary" href="/app/epics/' + epic.id + '">详情</a>' +
      '</div>';

    var list = el.querySelector('.subepic-list');
    var tasks = Array.isArray(epic.tasks) ? epic.tasks : [];
    if (tasks.length === 0) {
      list.innerHTML = '<div class="subepic-empty">暂无子卡片（先在详情页拆分）</div>';
    } else {
      tasks.forEach(function (t) {
        if (t.status === 'done') return;
        list.appendChild(renderSubtaskCard(t, epic, sourceCol));
      });
      if (!list.children.length) list.innerHTML = '<div class="subepic-empty">暂无未完成子卡片</div>';
    }

    el.addEventListener('dragstart', function (e) {
      draggingEpicId = epic.id;
      draggingFromCol = sourceCol || category(epic);
      e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'epic', epic_id: epic.id }));
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function () {
      draggingEpicId = null;
      draggingFromCol = null;
      document.querySelectorAll('.kanban-col').forEach(function (c) {
        c.classList.remove('drag-left', 'drag-right', 'drag-center');
        c.dataset.intent = '';
      });
    });
    return el;
  }

  function renderBoard() {
    var board = document.getElementById('today-board');
    if (!board) return;
    board.innerHTML = '';
    var items = getBoardTasks();
    if (!items.length) {
      board.innerHTML = '<div class="subepic-empty">将子卡片拖到此处加入今日白板</div>';
      return;
    }

    var grouped = {};
    items.forEach(function (x) {
      var key = String(x.epic_id);
      if (!grouped[key]) grouped[key] = { epic_id: x.epic_id, epic_title: x.epic_title || ('Epic #' + x.epic_id), tasks: [] };
      grouped[key].tasks.push(x);
    });

    Object.keys(grouped).forEach(function (k) {
      var g = grouped[k];
      var wrap = document.createElement('div');
      wrap.className = 'board-epic-group';
      wrap.innerHTML = '<div class="board-epic-group__title">' + g.epic_title + '</div>';
      g.tasks.forEach(function (t) {
        var item = document.createElement('div');
        item.className = 'subepic-card';
        item.draggable = true;
        item.dataset.taskId = String(t.id);
        item.dataset.epicId = String(t.epic_id);
        item.innerHTML =
          '<div class="subepic-card__title">' + t.title + '</div>' +
          '<div class="subepic-card__meta">' + (t.est_minutes || 45) + ' 分钟</div>';
        item.addEventListener('dragstart', function (e) {
          draggingEpicId = null;
          draggingFromCol = 'board';
          e.dataTransfer.setData('text/plain', JSON.stringify({
            kind: 'task',
            task_id: t.id,
            epic_id: t.epic_id,
            title: t.title,
            est_minutes: t.est_minutes || 45,
            due_date: t.due_date || null,
            epic_title: g.epic_title
          }));
        });
        wrap.appendChild(item);
      });
      board.appendChild(wrap);
    });
  }

  function rerender() {
    var colIn = document.getElementById('col-in-progress');
    var colDone = document.getElementById('col-done');
    var colOver = document.getElementById('col-overdue');
    [colIn, colDone, colOver].forEach(function (c) { if (c) c.innerHTML = ''; });

    epics.forEach(function (e) {
      var c = category(e);
      var card = renderCard(e, c);
      if (c === 'done' && colDone) colDone.appendChild(card);
      else if (c === 'overdue' && colOver) colOver.appendChild(card);
      else if (colIn) colIn.appendChild(card);
    });

    renderBoard();
  }

  function patchEpic(epicId, payload) {
    return fetch(base + '/api/epics/' + epicId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) return parseError(res, '更新 Epic 失败');
      return res.json();
    });
  }

  function deleteEpic(epicId) {
    return fetch(base + '/api/epics/' + epicId, {
      method: 'DELETE', credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) return parseError(res, '删除 Epic 失败');
      return true;
    });
  }

  function applyEpicUpdate(updated) {
    var idx = epics.findIndex(function (x) { return x.id === updated.id; });
    if (idx >= 0) {
      updated.tasks = epics[idx].tasks || [];
      epics[idx] = updated;
    }
    rerender();
  }

  var modal = document.getElementById('epic-action-modal');
  var modalForm = document.getElementById('epic-action-form');
  var modalTitle = document.getElementById('epic-action-title');
  var modalSubtitle = document.getElementById('epic-action-subtitle');
  var modalId = document.getElementById('epic-action-id');
  var dueWrap = document.getElementById('epic-action-due-wrap');
  var dueInput = document.getElementById('epic-action-due');
  var descWrap = document.getElementById('epic-action-desc-wrap');
  var descInput = document.getElementById('epic-action-desc');
  var noteWrap = document.getElementById('epic-action-note-wrap');
  var noteInput = document.getElementById('epic-action-note');
  var cancelBtn = document.getElementById('epic-action-cancel');
  var backdrop = document.getElementById('epic-action-backdrop');
  var pendingResolve = null;

  function closeActionModal(result) {
    if (modal) modal.setAttribute('hidden', '');
    if (pendingResolve) pendingResolve(result || null);
    pendingResolve = null;
  }

  function openActionModal(opts) {
    if (!modal || !modalForm) return Promise.resolve(null);
    modalTitle.textContent = opts.title || '操作确认';
    modalSubtitle.textContent = opts.subtitle || '';
    modalId.value = String(opts.epicId || '');
    dueWrap.hidden = !opts.needDue;
    descWrap.hidden = !opts.needDesc;
    noteWrap.hidden = !opts.needNote;
    dueInput.value = opts.defaultDue || '';
    descInput.value = opts.defaultDesc || '';
    noteInput.value = '';
    modal.removeAttribute('hidden');
    return new Promise(function (resolve) { pendingResolve = resolve; });
  }

  if (cancelBtn) cancelBtn.addEventListener('click', function () { closeActionModal(null); });
  if (backdrop) backdrop.addEventListener('click', function () { closeActionModal(null); });
  if (modalForm) {
    modalForm.addEventListener('submit', function (e) {
      e.preventDefault();
      closeActionModal({
        epicId: parseInt(modalId.value, 10),
        due_date: dueInput.value || null,
        description: descInput.value || null,
        note: noteInput.value || null
      });
    });
  }

  function handleDropByColumn(epic, targetCol) {
    var from = category(epic);
    if (targetCol === 'in_progress' && (from === 'overdue' || from === 'done')) {
      var fromDone = from === 'done';
      return openActionModal({
        title: fromDone ? '从已完成恢复到进行中' : '移回进行中',
        subtitle: '请设置新的截止日期（必填），可修改描述。' + (fromDone ? ' 将同时重置进度。' : ''),
        epicId: epic.id,
        needDue: true,
        needDesc: true,
        defaultDue: epic.due_date || '',
        defaultDesc: epic.description || ''
      }).then(function (ret) {
        if (!ret) return;
        if (!ret.due_date) return toast('请填写新的截止日期', 'error');
        var payload = { due_date: ret.due_date, description: ret.description || epic.description };
        if (fromDone) payload.progress = 0.8;
        return patchEpic(epic.id, payload).then(function (updated) {
          toast(fromDone ? '已恢复到进行中' : '已移回进行中', 'success');
          applyEpicUpdate(updated);
        }).catch(function (err) { toast(err.message, 'error'); });
      });
    }

    if (targetCol === 'done' && from !== 'done') {
      return openActionModal({
        title: '标记为已完成',
        subtitle: '确认将该 Epic 移动到已完成？',
        epicId: epic.id,
        needNote: true
      }).then(function (ret) {
        if (!ret) return;
        return patchEpic(epic.id, { progress: 1.0 }).then(function (updated) {
          toast('Epic 已标记完成', 'success');
          applyEpicUpdate(updated);
        }).catch(function (err) { toast(err.message, 'error'); });
      });
    }

    if (targetCol === 'overdue') {
      toast('过期状态由截止日期自动判定', 'info');
    }
  }

  function clearIntent(col) {
    col.classList.remove('drag-left', 'drag-right', 'drag-center');
    col.dataset.intent = '';
  }

  function parseDragPayload(raw) {
    if (!raw) return null;
    try {
      var obj = JSON.parse(raw);
      if (obj && (obj.kind === 'epic' || obj.kind === 'task')) return obj;
    } catch (_) {}
    var id = parseInt(raw, 10);
    if (id > 0) return { kind: 'epic', epic_id: id };
    return null;
  }

  function bindColumnDnD(col) {
    if (!col) return;

    col.addEventListener('dragover', function (e) {
      e.preventDefault();
      var intent = 'center';
      var rect = col.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var sideWidth = Math.max(64, Math.floor(rect.width * DRAG_SIDE_RATIO));

      if (col.dataset.col === 'board') {
        if (x >= rect.width - sideWidth) intent = 'right';
      } else {
        var sameColumnDrag = draggingFromCol && draggingFromCol === col.dataset.col;
        if (sameColumnDrag) {
          if (x <= sideWidth) intent = 'left';
          else if (x >= rect.width - sideWidth) intent = 'right';
        }
      }

      clearIntent(col);
      col.classList.add('drag-' + intent);
      col.dataset.intent = intent;
    });

    col.addEventListener('dragleave', function () { clearIntent(col); });

    col.addEventListener('drop', function (e) {
      e.preventDefault();
      var payload = parseDragPayload(e.dataTransfer.getData('text/plain'));
      if (!payload) { clearIntent(col); return; }

      var targetCol = col.dataset.col;
      var intent = col.dataset.intent || 'center';
      var sameColumnDrag = draggingFromCol && draggingFromCol === targetCol;
      clearIntent(col);

      if (targetCol === 'board') {
        if (payload.kind !== 'task') return toast('请拖动子卡片到白板', 'info');
        if (intent === 'right') {
          openActionModal({
            title: '从白板移除',
            subtitle: '确认将该子卡片从今日白板移除吗？',
            epicId: payload.epic_id
          }).then(function (ret) {
            if (!ret) return;
            removeBoardTask(payload.task_id);
            rerender();
            toast('已从白板移除', 'success');
          });
          return;
        }
        var epic = epics.find(function (x) { return x.id === payload.epic_id; });
        var added = addBoardTask({
          id: payload.task_id,
          epic_id: payload.epic_id,
          title: payload.title,
          est_minutes: payload.est_minutes,
          due_date: payload.due_date
        }, epic || null);
        if (!added) return toast('该子卡片已在白板中', 'info');
        rerender();
        toast('已加入今日白板', 'success');
        return;
      }

      if (payload.kind !== 'epic') {
        toast('子卡片仅支持拖入/移出白板', 'info');
        return;
      }

      var epic = epics.find(function (x) { return x.id === payload.epic_id; });
      if (!epic) return;

      if (sameColumnDrag && intent === 'right') {
        openActionModal({
          title: '删除该列中的 Epic 记录',
          subtitle: '将永久删除该 Epic 及其子任务，是否继续？',
          epicId: epic.id
        }).then(function (ret) {
          if (!ret) return;
          deleteEpic(epic.id).then(function () {
            epics = epics.filter(function (x) { return x.id !== epic.id; });
            setBoardTasks(getBoardTasks().filter(function (x) { return x.epic_id !== epic.id; }));
            rerender();
            toast('已删除该 Epic 记录', 'success');
          }).catch(function (err) { toast(err.message, 'error'); });
        });
        return;
      }

      handleDropByColumn(epic, targetCol);
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload)
      })
        .then(function (res) { return res.ok ? res.json() : parseError(res, '创建失败'); })
        .then(function (epic) {
          epic.tasks = [];
          epics.unshift(epic);
          form.reset();
          toast('创建成功', 'success');
          rerender();
        })
        .catch(function (err) { toast(err.message, 'error'); });
    });
  }

  rerender();
  bindCreate();
  document.querySelectorAll('.kanban-col').forEach(bindColumnDnD);
})();