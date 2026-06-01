(function () {
  var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
  var epics = Array.isArray(window.EPICS_DATA) ? window.EPICS_DATA.slice() : [];
  var DRAG_SIDE_RATIO = 1 / 3;

  // 今日锁定（白板）：后端 DailyPin。pins 为当日锁定子任务详情列表。
  var pins = [];

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  // 防 XSS：注入 innerHTML 前转义用户内容
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // 全局变更广播：刷新今日待办 + 通知其他面板
  function notifyChanged(detail) {
    if (window.reloadTodayPanel) window.reloadTodayPanel();
    document.dispatchEvent(new CustomEvent('todo:changed', { detail: detail || {} }));
  }
  window.todoChanged = notifyChanged;

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

  // ---- 今日锁定（白板）后端接口 ----
  function loadPins() {
    return fetch(base + '/api/daily/pins', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (rows) { pins = Array.isArray(rows) ? rows : []; return pins; })
      .catch(function () { pins = []; return pins; });
  }

  function pinRequest(body) {
    return fetch(base + '/api/daily/pins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return parseError(res, '锁定失败');
      return res.json();
    }).then(function (rows) { pins = Array.isArray(rows) ? rows : pins; return pins; });
  }

  function unpinRequest(taskId) {
    return fetch(base + '/api/daily/pins/' + taskId, {
      method: 'DELETE', credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) return parseError(res, '取消锁定失败');
      return res.json();
    }).then(function (rows) { pins = Array.isArray(rows) ? rows : pins; return pins; });
  }

  function isTaskPinned(taskId) {
    return pins.some(function (x) { return x.id === taskId; });
  }
  function isEpicPinned(epicId) {
    return pins.some(function (x) { return x.epic_id === epicId; });
  }

  var draggingEpicId = null;
  var draggingFromCol = null;
  var selectedEpics = new Set();

  function updateSelectedCount() {
    var cols = ['in_progress', 'done', 'overdue'];
    cols.forEach(function (col) {
      var count = epics.filter(function (e) { return selectedEpics.has(e.id) && category(e) === col; }).length;
      var tool = document.querySelector('.kanban-col__tools[data-col-tools="' + col + '"]');
      if (!tool) return;
      var el = tool.querySelector('[data-role="selected-count"]');
      if (el) el.textContent = '已选 ' + count + ' 项';
    });
  }

  function renderSubtaskCard(task, epic, sourceCol) {
    var el = document.createElement('div');
    el.className = 'subepic-card';
    el.draggable = true;
    el.dataset.taskId = String(task.id);
    el.dataset.epicId = String(epic.id);
    var inBoard = isTaskPinned(task.id);
    el.innerHTML =
      '<div class="subepic-card__title">' + esc(task.title) + '</div>' +
      '<div class="subepic-card__meta">' + (task.est_minutes || 45) + ' 分钟' + (inBoard ? ' · 已锁定' : '') + '</div>';

    el.addEventListener('dragstart', function (e) {
      e.stopPropagation();
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
    var inBoard = isEpicPinned(epic.id);
    var boardBadge = inBoard
      ? '<span class="epic-card__badge" title="该 Epic 下有子卡片已锁定今日">今日锁定</span>'
      : '';
    var checked = selectedEpics.has(epic.id) ? 'checked' : '';
    el.innerHTML =
      '<div class="epic-card__head">' +
      '<label class="epic-select-wrap"><input class="epic-select" type="checkbox" data-epic-id="' + epic.id + '" ' + checked + ' />选择</label>' +
      '<div class="epic-card__title">' + esc(epic.title) + '</div>' +
      boardBadge +
      '</div>' +
      '<div class="epic-card__meta">进度 ' + Math.round((epic.progress || 0) * 100) + '% ' + (epic.due_date ? ('· 截止 ' + esc(epic.due_date)) : '') + '</div>' +
      '<div class="subepic-list"></div>' +
      '<div class="form-actions" style="margin-top:8px">' +
      '<button type="button" class="btn btn--secondary btn-epic-detail" data-epic-id="' + epic.id + '">详情</button>' +
      '</div>';

    var box = el.querySelector('.epic-select');
    if (box) {
      box.addEventListener('change', function (evt) {
        evt.stopPropagation();
        var id = epic.id;
        if (box.checked) selectedEpics.add(id);
        else selectedEpics.delete(id);
        updateSelectedCount();
      });
      box.addEventListener('click', function (evt) { evt.stopPropagation(); });
    }

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
      if (e.target && (e.target.closest('.subepic-card') || e.target.closest('.epic-select-wrap') || e.target.closest('a,button,input,textarea,label'))) {
        e.preventDefault();
        return;
      }
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
    if (!pins.length) {
      board.innerHTML = '<div class="subepic-empty">把子卡片或 Epic 向左拖到「今日需做」，即可锁定为今日必做</div>';
      return;
    }

    var grouped = {};
    pins.forEach(function (x) {
      var key = String(x.epic_id);
      if (!grouped[key]) grouped[key] = { epic_id: x.epic_id, epic_title: x.epic_title || ('Epic #' + x.epic_id), tasks: [] };
      grouped[key].tasks.push(x);
    });

    Object.keys(grouped).forEach(function (k) {
      var g = grouped[k];
      var wrap = document.createElement('div');
      wrap.className = 'board-epic-group';
      wrap.innerHTML = '<div class="board-epic-group__title">' + esc(g.epic_title) + '</div>';
      g.tasks.forEach(function (t) {
        var item = document.createElement('div');
        item.className = 'subepic-card';
        item.draggable = true;
        item.dataset.taskId = String(t.id);
        item.dataset.epicId = String(t.epic_id);
        item.innerHTML =
          '<div class="subepic-card__title">' + esc(t.title) + '</div>' +
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
    updateSelectedCount();
  }

  // 从后端重新拉取看板数据 + 锁定项并整体重渲染（响应 todo:changed）
  var refreshing = false;
  function refreshAll() {
    if (refreshing) return Promise.resolve();
    refreshing = true;
    return Promise.all([
      fetch('/app/epics/data', { credentials: 'same-origin' }).then(function (res) { return res.ok ? res.json() : null; }),
      loadPins()
    ]).then(function (out) {
      var data = out[0];
      if (data && Array.isArray(data.epics)) epics = data.epics;
      rerender();
    }).catch(function () { /* 静默 */ }).finally(function () { refreshing = false; });
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

  function completeAllEpic(epicId) {
    return fetch(base + '/api/epics/' + epicId + '/complete_all', {
      method: 'POST', credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) return parseError(res, '标记完成失败');
      return res.json();
    });
  }

  function reopenEpic(epicId) {
    return fetch(base + '/api/epics/' + epicId + '/reopen', {
      method: 'POST', credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) return parseError(res, '恢复失败');
      return res.json();
    });
  }

  function applyEpicUpdate(updated) {
    var idx = epics.findIndex(function (x) { return x.id === updated.id; });
    if (idx >= 0) {
      updated.tasks = epics[idx].tasks || [];
      epics[idx] = updated;
    }
    rerender();
    notifyChanged({ source: 'epic-update', epicId: updated.id });
  }

  var modal = document.getElementById('epic-action-modal');
  var modalForm = document.getElementById('epic-action-form');
  var modalTitle = document.getElementById('epic-action-title');
  var modalSubtitle = document.getElementById('epic-action-subtitle');
  var modalId = document.getElementById('epic-action-id');
  var listWrap = document.getElementById('epic-action-list-wrap');
  var listEl = document.getElementById('epic-action-list');
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

    if (listEl) listEl.innerHTML = '';
    var subs = Array.isArray(opts.subtasks) ? opts.subtasks : null;
    if (listWrap) listWrap.hidden = !(subs && subs.length);
    if (subs && subs.length && listEl) {
      subs.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = (s.title || '') + (s.est_minutes ? ('（' + s.est_minutes + ' 分钟）') : '');
        listEl.appendChild(li);
      });
    }

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
  document.addEventListener('keydown', function (e) {
    if (!modal || modal.hasAttribute('hidden')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (modalForm && typeof modalForm.requestSubmit === 'function') modalForm.requestSubmit();
    }
  });

  function unfinishedTasks(epic) {
    return (Array.isArray(epic.tasks) ? epic.tasks : []).filter(function (t) { return t.status !== 'done'; });
  }

  function handleDropByColumn(epic, targetCol) {
    var from = category(epic);

    // 从「已完成」或「过期」移回进行中：重开子任务（如来自已完成）+ 设新截止日
    if (targetCol === 'in_progress' && (from === 'overdue' || from === 'done')) {
      var fromDone = from === 'done';
      return openActionModal({
        title: fromDone ? '从已完成恢复到进行中' : '移回进行中',
        subtitle: '请设置新的截止日期（必填），可修改描述。' + (fromDone ? ' 将重新打开其中已完成的子任务。' : ''),
        epicId: epic.id,
        needDue: true,
        needDesc: true,
        defaultDue: epic.due_date || '',
        defaultDesc: epic.description || ''
      }).then(function (ret) {
        if (!ret) return;
        if (!ret.due_date) return toast('请填写新的截止日期', 'error');
        var chain = fromDone ? reopenEpic(epic.id) : Promise.resolve();
        return chain.then(function () {
          var payload = { due_date: ret.due_date, description: ret.description || epic.description };
          return patchEpic(epic.id, payload);
        }).then(function () {
          toast(fromDone ? '已恢复到进行中' : '已移回进行中', 'success');
          return refreshAll();
        }).then(function () {
          notifyChanged({ source: 'epic-reopen', epicId: epic.id });
        }).catch(function (err) { toast(err.message, 'error'); });
      });
    }

    // 拖到「已完成」：人工确认其全部子任务都完成
    if (targetCol === 'done' && from !== 'done') {
      var subs = unfinishedTasks(epic);
      if (!subs.length) {
        toast('该 Epic 暂无未完成子任务，请先在详情中拆分子任务', 'info');
        return;
      }
      return openActionModal({
        title: '确认标记为已完成',
        subtitle: '以下子任务将全部标记为完成，确认它们都已完成？',
        epicId: epic.id,
        subtasks: subs
      }).then(function (ret) {
        if (!ret) return;
        return completeAllEpic(epic.id).then(function (r) {
          toast('已完成 ' + (r.completed || subs.length) + ' 个子任务', 'success');
          return refreshAll();
        }).then(function () {
          notifyChanged({ source: 'epic-complete-all', epicId: epic.id });
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

  // 左拖「今日需做」：锁定到后端（epic→全部未完成子任务；task→单条）
  function pinFromPayload(payload) {
    var body = payload.kind === 'task' ? { task_id: payload.task_id } : { epic_id: payload.epic_id };
    return pinRequest(body).then(function () {
      rerender();
      toast('已锁定为今日必做', 'success');
      notifyChanged({ source: 'pin' });
    }).catch(function (err) { toast(err.message, 'error'); });
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

      // 白板区：中间=锁定、右侧=移出
      if (targetCol === 'board') {
        if (intent === 'right') {
          if (payload.kind !== 'task') return toast('请拖动具体子卡片移出白板', 'info');
          openActionModal({
            title: '取消今日锁定',
            subtitle: '确认将该子卡片移出今日必做吗？',
            epicId: payload.epic_id
          }).then(function (ret) {
            if (!ret) return;
            unpinRequest(payload.task_id).then(function () {
              rerender();
              toast('已移出今日必做', 'success');
              notifyChanged({ source: 'unpin' });
            }).catch(function (err) { toast(err.message, 'error'); });
          });
          return;
        }
        pinFromPayload(payload);
        return;
      }

      // 看板列：左拖=今日需做(锁定)，右拖(同列)=删除记录
      if (sameColumnDrag && intent === 'left') {
        pinFromPayload(payload);
        return;
      }

      if (payload.kind !== 'epic') {
        // 子卡片拖到列中间：视为锁定到今日
        if (intent === 'left') { pinFromPayload(payload); return; }
        toast('子卡片可向左拖到「今日需做」，或拖到白板', 'info');
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
            rerender();
            toast('已删除该 Epic 记录', 'success');
            notifyChanged({ source: 'epic-delete', epicId: epic.id });
          }).catch(function (err) { toast(err.message, 'error'); });
        });
        return;
      }

      handleDropByColumn(epic, targetCol);
    });
  }

  function bindBatchActions() {
    var toolbars = document.querySelectorAll('.kanban-col__tools[data-col-tools]');
    toolbars.forEach(function (bar) {
      var col = bar.getAttribute('data-col-tools');
      var btnSelectVisible = bar.querySelector('[data-action="select-visible"]');
      var btnClear = bar.querySelector('[data-action="clear-selected"]');
      var btnDelete = bar.querySelector('[data-action="delete-selected"]');

      if (btnSelectVisible) {
        btnSelectVisible.addEventListener('click', function () {
          epics.forEach(function (e) {
            if (category(e) === col) selectedEpics.add(e.id);
          });
          rerender();
        });
      }

      if (btnClear) {
        btnClear.addEventListener('click', function () {
          epics.forEach(function (e) {
            if (category(e) === col) selectedEpics.delete(e.id);
          });
          rerender();
        });
      }

      if (btnDelete) {
        btnDelete.addEventListener('click', function () {
          var ids = epics.filter(function (e) { return selectedEpics.has(e.id) && category(e) === col; }).map(function (e) { return e.id; });
          if (!ids.length) return toast('请先选择要删除的 Epic', 'info');
          openActionModal({
            title: '批量删除确认',
            subtitle: '即将删除 ' + ids.length + ' 个 Epic（及其子任务），按回车可确认。',
            epicId: ids[0]
          }).then(function (ret) {
            if (!ret) return;
            var chain = Promise.resolve();
            ids.forEach(function (id) {
              chain = chain.then(function () { return deleteEpic(id).catch(function () { return true; }); });
            });
            chain.then(function () {
              epics = epics.filter(function (x) { return ids.indexOf(x.id) < 0; });
              ids.forEach(function (id) { selectedEpics.delete(id); });
              rerender();
              toast('批量删除完成', 'success');
              notifyChanged({ source: 'epic-batch-delete' });
            });
          });
        });
      }
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

  function bindEpicDetailExpand() {
    var overlay = document.createElement('div');
    overlay.id = 'epic-detail-overlay';
    overlay.className = 'epic-expand-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="epic-expand-overlay__backdrop" data-expand-close></div>' +
      '<div class="epic-expand" role="dialog" aria-modal="true" aria-label="Epic 详情">' +
      '<button type="button" class="epic-expand__close" data-expand-close aria-label="关闭">×</button>' +
      '<div class="epic-expand__body" id="epic-expand-body"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    var boxEl = overlay.querySelector('.epic-expand');
    var body = overlay.querySelector('#epic-expand-body');
    var currentEpicId = null;
    var sourceRect = null;

    function flip(fromRect, toClose) {
      boxEl.style.transition = 'none';
      boxEl.style.transform = 'none';
      boxEl.style.opacity = '1';
      void boxEl.offsetWidth;
      var last = boxEl.getBoundingClientRect();
      var dx = fromRect.left - last.left;
      var dy = fromRect.top - last.top;
      var sx = Math.max(fromRect.width / last.width, 0.04);
      var sy = Math.max(fromRect.height / last.height, 0.04);
      var collapsed = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      boxEl.style.transformOrigin = 'top left';
      if (toClose) {
        void boxEl.offsetWidth;
        boxEl.style.transition = 'transform .3s var(--ease-out), opacity .25s ease';
        boxEl.style.transform = collapsed;
        boxEl.style.opacity = '0';
      } else {
        boxEl.style.transform = collapsed;
        boxEl.style.opacity = '0.45';
        void boxEl.offsetWidth;
        boxEl.style.transition = 'transform .36s var(--ease-out), opacity .3s ease';
        boxEl.style.transform = 'none';
        boxEl.style.opacity = '1';
      }
    }

    function finishClose() {
      overlay.hidden = true;
      overlay.classList.remove('is-open');
      body.innerHTML = '';
      boxEl.style.transition = 'none';
      boxEl.style.transform = 'none';
      boxEl.style.opacity = '';
      currentEpicId = null;
      sourceRect = null;
    }

    function close() {
      if (overlay.hidden) return;
      overlay.classList.remove('is-open');
      if (sourceRect) {
        flip(sourceRect, true);
        window.setTimeout(finishClose, 300);
      } else {
        finishClose();
      }
    }

    function loadInto(epicId) {
      body.innerHTML = '<div class="epic-expand__loading">加载中…</div>';
      fetch('/app/epics/' + epicId + '/partial', { credentials: 'same-origin' })
        .then(function (res) { return res.ok ? res.text() : Promise.reject(new Error('加载失败')); })
        .then(function (html) {
          if (currentEpicId !== epicId) return;
          body.innerHTML = html;
          var root = body.querySelector('.epic-detail') || body;
          var hasSplit = root.getAttribute('data-has-split') === 'true';
          if (window.initEpicDetail) {
            window.initEpicDetail(root, {
              epicId: epicId,
              hasSplitDecision: hasSplit,
              onDone: function () { onSplitDone(epicId); }
            });
          }
        })
        .catch(function () {
          body.innerHTML = '<div class="epic-expand__loading">加载失败，请重试</div>';
        });
    }

    function open(epicId, rect) {
      currentEpicId = epicId;
      sourceRect = rect || null;
      overlay.hidden = false;
      window.requestAnimationFrame(function () { overlay.classList.add('is-open'); });
      if (rect) flip(rect, false);
      loadInto(epicId);
    }
    // 暴露给看板其它逻辑（如无子任务时打开详情拆分），避免整页跳转
    window.openEpicDetail = function (epicId) { open(epicId, null); };

    function onSplitDone(epicId) {
      refreshAll().then(function () {
        notifyChanged({ source: 'split', epicId: epicId });
      }).finally(function () {
        if (currentEpicId === epicId) {
          sourceRect = null;
          loadInto(epicId);
        }
      });
    }

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.btn-epic-detail');
      if (trigger) {
        e.preventDefault();
        var id = parseInt(trigger.getAttribute('data-epic-id'), 10);
        var card = trigger.closest('.epic-card');
        var rect = card ? card.getBoundingClientRect() : null;
        if (id) open(id, rect);
        return;
      }
      if (e.target.closest('[data-expand-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  // 拖拽时按光标位置自动滚动（容器优先，否则滚窗口）
  function bindDragAutoScroll() {
    var EDGE = 90;
    var SPEED = 20;
    var raf = null;
    var dir = 0;
    var scrollTarget = null;

    function findScrollable(node) {
      while (node && node !== document.body && node.nodeType === 1) {
        var oy = window.getComputedStyle(node).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 2) return node;
        node = node.parentNode;
      }
      return null;
    }

    function tick() {
      if (!dir) { raf = null; return; }
      if (scrollTarget) scrollTarget.scrollTop += dir * SPEED;
      else window.scrollBy(0, dir * SPEED);
      raf = window.requestAnimationFrame(tick);
    }

    document.addEventListener('dragover', function (e) {
      var el = document.elementFromPoint(e.clientX, e.clientY);
      scrollTarget = findScrollable(el);
      var top, bottom;
      if (scrollTarget) {
        var rect = scrollTarget.getBoundingClientRect();
        top = rect.top; bottom = rect.bottom;
      } else {
        top = 0; bottom = window.innerHeight;
      }
      if (e.clientY < top + EDGE) dir = -1;
      else if (e.clientY > bottom - EDGE) dir = 1;
      else dir = 0;
      if (dir && !raf) raf = window.requestAnimationFrame(tick);
    });

    ['drop', 'dragend', 'dragleave'].forEach(function (ev) {
      document.addEventListener(ev, function () { dir = 0; });
    });
  }

  // 其它面板（今日待办完成、拆分等）触发的变更：刷新看板与白板
  document.addEventListener('todo:changed', function (e) {
    var src = e && e.detail && e.detail.source;
    // 避免自触发循环：本模块发出的事件不再回灌（refreshAll 已在动作内调用）
    if (src === 'pin' || src === 'unpin' || src === 'epic-update' || src === 'epic-delete' ||
        src === 'epic-batch-delete' || src === 'epic-complete-all' || src === 'epic-reopen' || src === 'split') {
      return;
    }
    refreshAll();
  });

  // 初始：先渲染（用服务端注入的 EPICS_DATA），再异步拉取锁定项刷新白板
  rerender();
  bindBatchActions();
  bindCreate();
  bindEpicDetailExpand();
  bindDragAutoScroll();
  document.querySelectorAll('.kanban-col').forEach(bindColumnDnD);
  loadPins().then(rerender);
})();
