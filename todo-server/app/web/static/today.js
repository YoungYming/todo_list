(function () {
  var DBG = window.__todoDebug;
  function log() {
    if (DBG && console && console.log) {
      console.log.apply(console, ['[today]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  function init() {
    var modal = document.getElementById('modal-complete');
    var form = document.getElementById('form-complete-feedback');
    if (!modal || !form) return;

    var taskIdInput = document.getElementById('complete-task-id');
    var titleEl = document.getElementById('modal-task-title');
    var cancelBtn = document.getElementById('btn-cancel-complete');
    var submitBtn = form.querySelector('button[type="submit"]');

    var actualMinutesInput = document.getElementById('complete-actual-minutes');
    var actualMinutesRange = document.getElementById('complete-actual-minutes-range');
    var minutesValueEl = document.getElementById('minutes-slider-value');

    var taskTypeInput = document.getElementById('complete-task-type');
    var taskTypeChips = document.getElementById('task-type-chips');
    var taskTypeOtherWrap = document.getElementById('task-type-other-wrap');
    var taskTypeCustomInput = document.getElementById('complete-task-type-custom');

    var submitting = false;

    function syncMinutes(fromRange) {
      var val = 60;
      if (fromRange && actualMinutesRange) {
        val = parseInt(actualMinutesRange.value || '60', 10);
      } else if (actualMinutesInput) {
        val = parseInt(actualMinutesInput.value || '60', 10);
      }
      if (!val || val < 1) val = 60;

      if (actualMinutesRange) actualMinutesRange.value = String(val);
      if (actualMinutesInput) actualMinutesInput.value = String(val);
      if (minutesValueEl) minutesValueEl.textContent = String(val);
      log('minutes synced ->', val);
      return val;
    }

    function clearTaskType() {
      if (taskTypeInput) taskTypeInput.value = '';
      if (taskTypeCustomInput) taskTypeCustomInput.value = '';
      if (taskTypeOtherWrap) taskTypeOtherWrap.hidden = true;
      var selected = document.querySelectorAll('.task-type-chip--selected');
      selected.forEach(function (el) { el.classList.remove('task-type-chip--selected'); });
    }

    function selectTaskType(btn) {
      if (!btn || !taskTypeChips) return;
      var value = btn.getAttribute('data-value') || '';
      var isOther = value === '其他';

      taskTypeChips.querySelectorAll('.task-type-chip').forEach(function (chip) {
        chip.classList.remove('task-type-chip--selected');
      });
      btn.classList.add('task-type-chip--selected');

      if (taskTypeInput) taskTypeInput.value = isOther ? '' : value;
      if (taskTypeOtherWrap) taskTypeOtherWrap.hidden = !isOther;
      if (taskTypeCustomInput) {
        if (isOther) taskTypeCustomInput.focus();
        else taskTypeCustomInput.value = '';
      }
      log('task type selected ->', value);
    }

    function openModal(taskId, title) {
      if (taskIdInput) taskIdInput.value = taskId || '';
      if (titleEl) titleEl.textContent = title || '';
      syncMinutes(false);
      clearTaskType();
      modal.removeAttribute('hidden');
      log('modal open', taskId, title);
    }

    function closeModal() {
      modal.setAttribute('hidden', '');
      log('modal close');
    }

    // 完成按钮
    var btns = document.querySelectorAll('.btn-complete');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        openModal(this.getAttribute('data-task-id'), this.getAttribute('data-title'));
      });
    });

    // 取消、遮罩、ESC
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
      cancelBtn.addEventListener('mousedown', function () { log('cancel mousedown'); });
    }
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
    });

    // 分钟滑块：双保险（property + listener）
    if (actualMinutesRange) {
      var onMinutesInput = function () { syncMinutes(true); };
      actualMinutesRange.oninput = onMinutesInput;
      actualMinutesRange.onchange = onMinutesInput;
      actualMinutesRange.addEventListener('input', onMinutesInput);
      actualMinutesRange.addEventListener('change', onMinutesInput);
    }
    syncMinutes(false);

    // 任务类型：委托 + 逐个绑定（双保险）
    if (taskTypeChips) {
      taskTypeChips.addEventListener('click', function (e) {
        var btn = e.target.closest('.task-type-chip');
        if (btn) selectTaskType(btn);
      });
      taskTypeChips.querySelectorAll('.task-type-chip').forEach(function (chip) {
        chip.addEventListener('click', function () { selectTaskType(chip); });
      });
    }

    if (taskTypeCustomInput) {
      taskTypeCustomInput.addEventListener('input', function () {
        if (!taskTypeInput) return;
        var v = this.value.trim();
        taskTypeInput.value = v || '其他';
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitting) return;

      var taskId = taskIdInput ? String(taskIdInput.value || '').trim() : '';
      if (!taskId) {
        toast('任务 ID 无效，请刷新后重试', 'error');
        return;
      }

      // 直接以滑块值为准，避免 hidden 不同步
      var actualVal = actualMinutesRange
        ? parseInt(actualMinutesRange.value || '0', 10)
        : parseInt(actualMinutesInput && actualMinutesInput.value ? actualMinutesInput.value : '0', 10);
      if (!actualVal || actualVal < 1) {
        toast('请设置有效的实际用时', 'error');
        return;
      }

      if (actualMinutesInput) actualMinutesInput.value = String(actualVal);
      if (minutesValueEl) minutesValueEl.textContent = String(actualVal);

      var taskTypeVal = taskTypeInput ? taskTypeInput.value.trim() : '';
      if (document.querySelector('.task-type-chip--selected') && !taskTypeVal && taskTypeCustomInput) {
        taskTypeVal = taskTypeCustomInput.value.trim() || '其他';
      }

      var payload = {
        difficulty: parseInt((document.getElementById('complete-difficulty') || {}).value || '3', 10) || 3,
        actual_minutes: actualVal,
        output: (document.getElementById('complete-output') || {}).value || null,
        output_size: (document.getElementById('complete-output-size') || {}).value
          ? parseInt(document.getElementById('complete-output-size').value, 10)
          : null,
        task_type: taskTypeVal || null
      };

      var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
      var url = base + '/api/tasks/' + encodeURIComponent(taskId) + '/complete_feedback';
      log('submit payload', payload);

      submitting = true;
      if (submitBtn) submitBtn.disabled = true;

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      })
        .then(function (res) {
          if (res.ok) return res.json();
          return res.text().then(function (text) {
            var msg = '提交失败';
            try {
              var err = text ? JSON.parse(text) : {};
              if (err.detail) {
                msg = Array.isArray(err.detail)
                  ? err.detail.map(function (d) { return d.msg || d; }).join(', ')
                  : String(err.detail);
              } else if (res.status === 404) {
                msg = '任务不存在';
              } else if (res.status === 409) {
                msg = '任务已完成，请刷新页面';
              } else if (res.status === 401) {
                msg = '需要认证（请配置 API_TOKEN）';
              }
            } catch (_) {
              if (text) msg = text.slice(0, 120);
            }
            throw new Error(msg);
          });
        })
        .then(function () {
          closeModal();
          var row = document.querySelector('.task-item[data-task-id="' + taskId + '"]');
          if (row) row.remove();
          if (document.querySelectorAll('.task-item').length === 0) window.location.reload();
          toast('提交成功', 'success');
        })
        .catch(function (err) {
          toast(err.message || '提交失败', 'error');
        })
        .finally(function () {
          submitting = false;
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {
    console.error('[today] init error', e);
  }
})();
