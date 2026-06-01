/**
 * 非阻塞 toast 提示，替代 alert。
 * 用法：window.todoToast('消息', 'success'|'error'|'info')
 */
(function () {
  var container = null;

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'todo-toast-container';
      container.setAttribute('aria-live', 'polite');
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(text, type) {
    type = type || 'info';
    var el = document.createElement('div');
    el.className = 'todo-toast todo-toast--' + type;
    el.textContent = text;
    el.style.cssText = 'padding:12px 20px;border-radius:8px;background:#1d1d1f;color:#fff;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-width:320px;';
    if (type === 'error') el.style.background = '#ff3b30';
    if (type === 'success') el.style.background = '#34c759';
    var c = ensureContainer();
    c.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s';
      setTimeout(function () { el.remove(); }, 200);
    }, 3000);
  }

  window.todoToast = show;
})();
