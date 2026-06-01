(function () {
  var accordion = document.getElementById('accordion');
  if (!accordion) return;

  var panels = Array.prototype.slice.call(accordion.querySelectorAll('.panel'));
  var pinned = accordion.getAttribute('data-active') || 'today';

  function setActive(name) {
    panels.forEach(function (p) {
      var isActive = p.getAttribute('data-panel') === name;
      p.classList.toggle('is-expanded', isActive);
      p.classList.toggle('is-pinned', isActive && name === pinned);
    });
    accordion.setAttribute('data-active', name);
    syncSidebar(name);
  }

  function pin(name) {
    pinned = name;
    setActive(name);
  }

  function syncSidebar(name) {
    var links = document.querySelectorAll('.app-sidebar__link[data-panel]');
    links.forEach(function (a) {
      a.classList.toggle('app-sidebar__link--active', a.getAttribute('data-panel') === name);
    });
  }

  panels.forEach(function (panel) {
    var name = panel.getAttribute('data-panel');
    // 悬停预览展开
    panel.addEventListener('mouseenter', function () { setActive(name); });
    // 点击锁定（钉住），不阻止内部按钮/链接
    panel.addEventListener('click', function () { pin(name); });
  });

  // 鼠标离开整个手风琴时回到钉住的面板
  accordion.addEventListener('mouseleave', function () { setActive(pinned); });

  // 侧边栏导航：在单页内切换面板而非跳转
  document.querySelectorAll('.app-sidebar__link[data-panel]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      pin(a.getAttribute('data-panel'));
    });
  });

  // 历史记录：日历交互改为局部 AJAX，避免整页重载
  var historyContent = document.getElementById('history-content');
  if (historyContent) {
    function loadHistory(params) {
      var qs = new URLSearchParams(params).toString();
      fetch('/app/history/partial?' + qs, { credentials: 'same-origin' })
        .then(function (res) { return res.ok ? res.text() : Promise.reject(new Error('加载失败')); })
        .then(function (html) { historyContent.innerHTML = html; })
        .catch(function () {
          if (window.todoToast) window.todoToast('历史记录加载失败', 'error');
        });
    }

    historyContent.addEventListener('click', function (e) {
      var link = e.target.closest('.history-calendar__link');
      if (!link) return;
      e.preventDefault();
      loadHistory({ month: link.getAttribute('data-month') || '', selected_date: link.getAttribute('data-date') || '' });
    });

    historyContent.addEventListener('submit', function (e) {
      var form = e.target.closest('.history-month-form');
      if (!form) return;
      e.preventDefault();
      var monthInput = form.querySelector('input[name="month"]');
      loadHistory({ month: monthInput ? monthInput.value : '' });
    });
  }

  setActive(pinned);
})();
