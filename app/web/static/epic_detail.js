/**
 * Epic 详情：获取拆分候选、编辑、确认拆分。
 * 通过 window.initEpicDetail(root, cfg) 初始化，支持标准页与 AJAX 抽屉内复用。
 *   root: 详情内容所在的容器节点（元素查找均限定在该容器内）
 *   cfg : { epicId, hasSplitDecision, onDone }
 */
(function () {
  var DBG = window.__todoDebug;
  function log() {
    if (DBG && console && console.log) {
      console.log.apply(console, ['[epic_detail]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function toast(msg, type) {
    if (window.todoToast) window.todoToast(msg, type || 'info');
    else alert(msg);
  }

  function initEpicDetail(root, cfg) {
    root = root || document;
    cfg = cfg || {};
    var epicId = cfg.epicId;
    if (!epicId) return;

    var base = (typeof window.API_BASE !== 'undefined' ? window.API_BASE : '') || '';
    var btnFetch = root.querySelector('#btn-fetch-candidates');
    var btnSubmit = root.querySelector('#btn-submit-split');
    var candidatesArea = root.querySelector('#candidates-area');
    var candidatesList = root.querySelector('#candidates-list');
    var splitEditor = root.querySelector('#split-editor');
    var splitTaskEditor = root.querySelector('#split-task-editor');

    var currentTasks = [];

    function parseError(res) {
      return res.text().then(function (text) {
        var msg = '操作失败';
        try {
          var err = text ? JSON.parse(text) : {};
          if (err.detail) {
            msg = Array.isArray(err.detail)
              ? err.detail.map(function (d) { return d.msg || d; }).join(', ')
              : String(err.detail);
          } else if (res.status === 409) msg = '已有拆分决策，不可重复提交';
          else if (res.status === 422) msg = '数据校验失败：' + (text || '').slice(0, 80);
        } catch (_) {
          if (text) msg = text.slice(0, 100);
        }
        return Promise.reject(new Error(msg));
      });
    }

    if (btnFetch) {
      btnFetch.addEventListener('click', function () {
        try {
          log('fetching candidates for epic', epicId);
          btnFetch.disabled = true;
          fetch(base + '/api/epics/' + epicId + '/split_candidates', { credentials: 'same-origin' })
            .then(function (res) {
              if (!res.ok) return parseError(res);
              return res.json();
            })
            .then(function (sets) {
              log('candidates', sets);
              if (!sets || sets.length === 0) {
                toast('未获取到拆分候选', 'info');
                return;
              }
              candidatesArea.hidden = false;
              candidatesList.innerHTML = '';
              sets.forEach(function (s, idx) {
                var card = document.createElement('div');
                card.className = 'split-candidate-card';
                card.style.cssText = 'padding:var(--space-4);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:var(--space-3);';
                function providerLabel(name) {
                  if (name === 'llm') return 'LLM 智能拆分（推荐）';
                  if (name === 'local_rules') return '本地规则（兜底）';
                  return name || '候选';
                }
                var title = document.createElement('div');
                title.textContent = providerLabel(s.provider_name) + (s.candidate_set_id ? ' · ' + s.candidate_set_id.slice(0, 8) : '');
                title.style.fontWeight = '600';
                card.appendChild(title);
                var ul = document.createElement('ul');
                ul.style.cssText = 'margin:var(--space-2) 0 0 0;padding-left:var(--space-5);';
                (s.tasks || []).forEach(function (t) {
                  var li = document.createElement('li');
                  li.textContent = t.title + ' (' + (t.est_minutes || 45) + ' 分钟)';
                  ul.appendChild(li);
                });
                card.appendChild(ul);
                var useBtn = document.createElement('button');
                useBtn.type = 'button';
                useBtn.className = 'btn btn--secondary';
                useBtn.textContent = '使用此方案';
                useBtn.style.marginTop = 'var(--space-2)';
                useBtn.addEventListener('click', function () {
                  currentTasks = (s.tasks || []).map(function (t) {
                    return { title: t.title, est_minutes: t.est_minutes || 45, due_date: t.due_date || null };
                  });
                  renderEditor();
                  splitEditor.hidden = false;
                });
                card.appendChild(useBtn);
                candidatesList.appendChild(card);
              });
            })
            .catch(function (err) {
              toast(err.message || '获取失败', 'error');
            })
            .finally(function () {
              btnFetch.disabled = false;
            });
        } catch (e) {
          if (DBG) console.error('[epic_detail]', e);
          toast('获取拆分候选时出错', 'error');
          btnFetch.disabled = false;
        }
      });
    }

    function renderEditor() {
      if (!splitTaskEditor) return;
      splitTaskEditor.innerHTML = '';
      currentTasks.forEach(function (t, i) {
        var li = document.createElement('li');
        li.style.cssText = 'display:flex;gap:var(--space-2);align-items:center;margin-bottom:var(--space-2);';
        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'form-group__input';
        titleInput.value = t.title || '';
        titleInput.placeholder = '任务标题';
        titleInput.style.flex = '1';
        titleInput.dataset.idx = String(i);
        titleInput.addEventListener('change', function () {
          currentTasks[parseInt(this.dataset.idx, 10)].title = this.value;
        });
        var minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.className = 'form-group__input';
        minInput.value = t.est_minutes || 45;
        minInput.min = 1;
        minInput.max = 480;
        minInput.style.width = '80px';
        minInput.dataset.idx = String(i);
        minInput.addEventListener('change', function () {
          currentTasks[parseInt(this.dataset.idx, 10)].est_minutes = parseInt(this.value, 10) || 45;
        });
        li.appendChild(titleInput);
        li.appendChild(minInput);
        li.appendChild(document.createTextNode('分钟'));
        splitTaskEditor.appendChild(li);
      });
    }

    if (btnSubmit) {
      btnSubmit.addEventListener('click', function () {
        if (!currentTasks || currentTasks.length === 0) {
          toast('请先获取拆分候选并选择方案', 'error');
          return;
        }
        try {
          log('submitting split', currentTasks);
          btnSubmit.disabled = true;
          var payload = {
            chosen_candidate_set_id: null,
            final_tasks_json: currentTasks.map(function (t) {
              return { title: t.title, est_minutes: t.est_minutes || 45, due_date: t.due_date || null };
            }),
            edits_diff: null
          };
          fetch(base + '/api/epics/' + epicId + '/split_decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'same-origin'
          })
            .then(function (res) {
              if (!res.ok) return parseError(res);
              return res.json();
            })
            .then(function () {
              toast('拆分成功', 'success');
              if (typeof cfg.onDone === 'function') {
                cfg.onDone({ epicId: epicId, tasks: currentTasks.slice() });
              } else {
                window.location.reload();
              }
            })
            .catch(function (err) {
              toast(err.message || '提交失败', 'error');
              btnSubmit.disabled = false;
            });
        } catch (e) {
          if (DBG) console.error('[epic_detail]', e);
          toast('提交时出错', 'error');
          btnSubmit.disabled = false;
        }
      });
    }
  }

  window.initEpicDetail = initEpicDetail;

  // 向后兼容：旧标准页若注入了 window.EPIC_DETAIL 也能自动初始化
  function autoInit() {
    var cfg = window.EPIC_DETAIL;
    if (cfg && cfg.epicId) initEpicDetail(document, cfg);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();
