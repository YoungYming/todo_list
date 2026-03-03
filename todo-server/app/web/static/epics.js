(function () {
  var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
  var epics = Array.isArray(window.EPICS_DATA) ? window.EPICS_DATA.slice() : [];
  var boardKey = 'todo_today_board_epics';
  var DRAG_SIDE_PX = 72;

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

  function addBoard(id) {
    var ids = getBoardIds();
    if (ids.indexOf(id) < 0) ids.push(id);
    setBoardIds(ids);
  }

  function removeBoard(id) {
    var ids = getBoardIds().filter(function (x) { return x !== id; });
    setBoardIds(ids);
  }

  var draggingEpicId = null;
  var draggingFromCol = null;

  function renderCard(epic, sourceCol) {
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
      draggingEpicId = epic.id;
      draggingFromCol = sourceCol || category(epic);
      e.dataTransfer.setData('text/plain', String(epic.id));
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

  function rerender() {
    var colIn = document.getElementById('col-in-progress');
    var colDone = document.getElementById('col-done');
    var colOver = document.getElementById('col-overdue');
    var board = document.getElementById('today-board');
    [colIn, colDone, colOver, board].forEach(function (c) { if (c) c.innerHTML = ''; });

    var boardIds = getBoardIds();
    epics.forEach(function (e) {
      var c = category(e);
      var card = renderCard(e, c);
      if (c === 'done' && colDone) colDone.appendChild(card);
      else if (c === 'overdue' && colOver) colOver.appendChild(card);
      else if (colIn) colIn.appendChild(card);

      if (boardIds.indexOf(e.id) >= 0 && board) board.appendChild(renderCard(e, 'board'));
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

  function deleteEpic(epicId) {
    return fetch(base + '/api/epics/' + epicId, {
      method: 'DELETE',
      credentials: 'same-origin'
    }).then(function (res) {
      if (!res.ok) return parseError(res, '删除 Epic 失败');
      return true;
    });
  }

  function applyEpicUpdate(updated) {
    var idx = epics.findIndex(function (x) { return x.id === updated.id; });
    if (idx >= 0) epics[idx] = updated;
    rerender();
  }

  // ===== modal =====
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

    return new Promise(function (resolve) {
      pendingResolve = resolve;
    });
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

    if (targetCol === 'in_progress' && from === 'overdue') {
      return openActionModal({
        title: '移回进行中',
        subtitle: '请设置新的截止日期（必填），可修改描述。',
        epicId: epic.id,
        needDue: true,
        needDesc: true,
        defaultDue: epic.due_date || '',
        defaultDesc: epic.description || ''
      }).then(function (ret) {
        if (!ret) return;
        if (!ret.due_date) return toast('请填写新的截止日期', 'error');
        return patchEpic(epic.id, { due_date: ret.due_date, description: ret.description || epic.description })
          .then(function (updated) {
            toast('已移回进行中', 'success');
            applyEpicUpdate(updated);
          })
          .catch(function (err) { toast(err.message, 'error'); });
      });
    }

    if (targetCol === 'done' && from !== 'done') {
      return openActionModal({
        title: '标记为已完成',
        subtitle: '确认将该 Epic 移动到已完成？可填写完成说明。',
        epicId: epic.id,
        needNote: true
      }).then(function (ret) {
        if (!ret) return;
        return patchEpic(epic.id, { progress: 1.0 })
          .then(function (updated) {
            toast('Epic 已标记完成', 'success');
            applyEpicUpdate(updated);
          })
          .catch(function (err) { toast(err.message, 'error'); });
      });
    }

    if (targetCol === 'overdue') {
      toast('过期状态由截止日期自动判定', 'info');
      return;
    }
  }

  function clearIntent(col) {
    col.classList.remove('drag-left', 'drag-right', 'drag-center');
    col.dataset.intent = '';
  }

  function bindColumnDnD(col) {
    if (!col) return;

    col.addEventListener('dragover', function (e) {
      e.preventDefault();
      var intent = 'center';
      var rect = col.getBoundingClientRect();
      var x = e.clientX - rect.left;

      if (col.dataset.col === 'board') {
        if (x >= rect.width - DRAG_SIDE_PX) intent = 'right';
      } else {
        var sameColumnDrag = draggingFromCol && draggingFromCol === col.dataset.col;
        if (sameColumnDrag) {
          if (x <= DRAG_SIDE_PX) intent = 'left';
          else if (x >= rect.width - DRAG_SIDE_PX) intent = 'right';
        } else {
          intent = 'center';
        }
      }

      clearIntent(col);
      col.classList.add('drag-' + intent);
      col.dataset.intent = intent;
    });

    col.addEventListener('dragleave', function () { clearIntent(col); });

    col.addEventListener('drop', function (e) {
      e.preventDefault();
      var id = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!id) { clearIntent(col); return; }
      var epic = epics.find(function (x) { return x.id === id; });
      if (!epic) { clearIntent(col); return; }

      var targetCol = col.dataset.col;
      var intent = col.dataset.intent || 'center';
      var sameColumnDrag = draggingFromCol && draggingFromCol === targetCol;
      clearIntent(col);

      // 白板区：center=加入白板，right=从白板移除
      if (targetCol === 'board') {
        if (intent === 'right') {
          if (getBoardIds().indexOf(id) < 0) return toast('该卡片不在白板中', 'info');
          openActionModal({
            title: '从白板移除',
            subtitle: '确认将该卡片从今日需做白板移除吗？',
            epicId: id
          }).then(function (ret) {
            if (!ret) return;
            removeBoard(id);
            rerender();
            toast('已从白板移除', 'success');
          });
          return;
        }
        addBoard(id);
        rerender();
        toast('已加入今日需做白板', 'success');
        return;
      }

      // 仅“本列内拖动”触发左右侧交互
      if (sameColumnDrag && intent === 'left') {
        addBoard(id);
        rerender();
        toast('已加入今日需做白板', 'success');
        return;
      }
      if (sameColumnDrag && intent === 'right') {
        openActionModal({
          title: '删除该列中的 Epic 记录',
          subtitle: '将永久删除该 Epic 及其子任务，是否继续？',
          epicId: id
        }).then(function (ret) {
          if (!ret) return;
          deleteEpic(id)
            .then(function () {
              epics = epics.filter(function (x) { return x.id !== id; });
              removeBoard(id);
              rerender();
              toast('已删除该 Epic 记录', 'success');
            })
            .catch(function (err) { toast(err.message, 'error'); });
        });
        return;
      }

      // 跨列拖动：仅执行列逻辑，不触发侧边交互
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
  bindCreate();
  document.querySelectorAll('.kanban-col').forEach(bindColumnDnD);
})();
