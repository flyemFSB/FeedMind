/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

/**
 * electron-builder afterPack 钩子：在生成安装包前裁剪 Chromium 冗余的多语言包与文档。
 */
export default async function afterPack(context) {
  const { appOutDir } = context;
  console.log(`[afterPack] 正在优化并裁剪 Chromium 冗余文件: ${appOutDir}`);

  // 1. 剔除大型无用文档（LICENSES 19.4MB）
  const licenseFile = path.join(appOutDir, "LICENSES.chromium.html");
  if (fs.existsSync(licenseFile)) {
    try {
      fs.unlinkSync(licenseFile);
      console.log(`[afterPack] 已剔除冗余文档: LICENSES.chromium.html`);
    } catch {
      // 忽略
    }
  }

  // 2. 裁剪非中英文语言包（50+ pak 语言包，节约 ~30MB）
  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    const kept = new Set(["zh-CN.pak", "en-US.pak", "en-GB.pak"]);
    try {
      const files = fs.readdirSync(localesDir);
      for (const item of files) {
        if (!kept.has(item)) {
          fs.unlinkSync(path.join(localesDir, item));
        }
      }
      console.log(`[afterPack] 已精简 locales 多语言包（仅保留 zh-CN / en-US）`);
    } catch {
      // 忽略
    }
  }

  // 短暂让出 IO 循环，确保 Windows 文件系统句柄稳定释放
  await new Promise((resolve) => setTimeout(resolve, 300));
}
