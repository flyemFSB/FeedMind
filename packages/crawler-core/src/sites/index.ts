// ─── 站点适配器注册 ───────────────────────────────────────────────
// 每个站点适配器在被 import 时自动调用 registerRoute() 注册自身。
// 此文件由 src/index.ts 导入，确保所有站点在应用启动时可用。

import "./bilibili.js";
import "./zhihu.js";
import "./xiaohongshu.js";
import "./weread.js";
