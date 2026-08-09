/**
 * B站 WBI 签名工具
 *
 * WBI 签名是 B站 API 的反爬机制，流程：
 * 1. 从 nav API 获取 img_key + sub_key
 * 2. 拼接后从 bili-header.umd.js 获取 64 元素排列表做字符重排 → wbiVerifyString
 * 3. 对参数排序后加 &wts={timestamp}，追加 wbiVerifyString，MD5
 *
 * 另提供 addDmVerifyInfo 和 addRenderData 辅助函数。
 */
import crypto from "node:crypto";

/**
 * 从 URL 中提取文件名（不含扩展名）
 */
function extractKeyFromUrl(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1).split(".", 1)[0] ?? "";
}

/**
 * 获取 WBI 验证字符串
 *
 * 步骤：
 * 1. GET /x/web-interface/nav → 提取 img_url, sub_url
 * 2. 拼接 imgKey + subKey
 * 3. GET bili-header.umd.js → 提取 64 元素排列表
 * 4. 用排列表重排字符串 → 取前 32 字符
 */
export async function getWbiVerifyString(signal?: AbortSignal): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Referer: "https://www.bilibili.com/",
  };

  const navRes = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    headers,
    ...(signal ? { signal } : {}),
  });
  const navJson = (await navRes.json()) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  };
  const wbiImg = navJson?.data?.wbi_img;
  if (!wbiImg?.img_url || !wbiImg.sub_url) throw new Error("无法获取 WBI 密钥");

  const imgUrl: string = wbiImg.img_url;
  const subUrl: string = wbiImg.sub_url;
  const r = extractKeyFromUrl(imgUrl) + extractKeyFromUrl(subUrl);

  const jsRes = await fetch("https://s1.hdslb.com/bfs/seed/laputa-header/bili-header.umd.js", {
    headers: { Referer: "https://space.bilibili.com/1" },
    ...(signal ? { signal } : {}),
  });
  const jsText = await jsRes.text();
  const arrayMatch = jsText.match(/\[(?:\d+,){63}\d+\]/);
  if (!arrayMatch) throw new Error("无法提取 WBI 排列表");

  const array: number[] = JSON.parse(arrayMatch[0]);

  const o: string[] = [];
  for (const t of array) {
    const ch = r.charAt(t);
    if (ch) o.push(ch);
  }
  return o.join("").slice(0, 32);
}

/**
 * 对查询参数字符串应用 WBI 签名
 *
 * @param params - 已有的查询字符串，如 "mid=123&ps=30&pn=1"
 * @param wbiVerifyString - 由 getWbiVerifyString() 获取
 * @returns 追加了 &w_rid=...&wts=... 的查询字符串
 */
export function addWbiVerifyInfo(params: string, wbiVerifyString: string): string {
  const searchParams = new URLSearchParams(params);
  searchParams.sort();
  const verifyParam = searchParams.toString();
  const wts = Math.round(Date.now() / 1000);
  const wRid = crypto.hash("md5", `${verifyParam}&wts=${wts}${wbiVerifyString}`, {
    outputEncoding: "hex",
  });
  return `${params}&w_rid=${wRid}&wts=${wts}`;
}

/**
 * 添加反爬 dm_img 探针参数
 */
export function addDmVerifyInfo(params: string, dmImgList: string): string {
  const dmImgStr = Buffer.from("no webgl").toString("base64").slice(0, -2);
  const dmCoverImgStr = Buffer.from("no webgl").toString("base64").slice(0, -2);
  return `${params}&dm_img_list=${dmImgList}&dm_img_str=${dmImgStr}&dm_cover_img_str=${dmCoverImgStr}`;
}

/**
 * 生成反爬探针 dm_img_list
 * 使用高斯分布的鼠标轨迹模拟
 */
export function getDmImgList(): string {
  function gaussian(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.round(z0 * std + mean);
  }

  const x = Math.max(gaussian(1245, 5), 0);
  const y = Math.max(gaussian(1285, 5), 0);
  const path = [
    {
      x: 3 * x + 2 * y,
      y: 4 * x - 5 * y,
      z: 0,
      timestamp: Math.max(gaussian(30, 5), 0),
      type: 0,
    },
  ];
  return JSON.stringify(path);
}

/**
 * 添加 w_webid 参数
 */
export function addRenderData(params: string, renderData: string): string {
  return `${params}&w_webid=${encodeURIComponent(renderData)}`;
}
