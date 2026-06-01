// API_BASE 由 base.html 注入；若未注入则使用空字符串（同源）
if (typeof window.API_BASE === 'undefined') window.API_BASE = '';

// 调试开关：Console 执行 window.__todoDebug = true 后刷新，可输出关键节点日志
if (typeof window.__todoDebug === 'undefined') window.__todoDebug = false;
