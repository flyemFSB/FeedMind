// 登录窗口 preload：向页面主世界暴露"登录完成"回调，由主进程捕获会话 Cookie。
// 沙箱化 preload 仅支持 CJS，故本文件用 require 而非 import。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("feedmindLogin", {
  done: () => ipcRenderer.invoke("feedmind-login-done"),
});
