/**
 * 知乎 x-zse-96 v3 加密算法
 *
 * 用于生成知乎 API 的 x-zse-96 请求头。
 *
 * 算法概述：
 * 1. 对输入字符串（MD5("101_3_3.0" + apiPath + d_c0)）进行预处理
 * 2. 通过自定义块加密（S-box 置换、XOR、循环移位）进行加密
 * 3. 通过自定义 base64 编码输出
 */

/**
 * 将 32 位整数写入 4 字节数组（大端序）
 */
function i(e: number, t: number[], n: number): void {
  t[n] = 255 & (e >>> 24);
  t[n + 1] = 255 & (e >>> 16);
  t[n + 2] = 255 & (e >>> 8);
  t[n + 3] = 255 & e;
}

/**
 * 从 4 字节数组读取 32 位整数（大端序）
 */
function B(e: number[], t: number): number {
  return (
    ((255 & e[t]) << 24) | ((255 & e[t + 1]) << 16) | ((255 & e[t + 2]) << 8) | (255 & e[t + 3])
  );
}

/**
 * 32 位循环左移
 */
function Q(e: number, t: number): number {
  return ((4_294_967_295 & e) << t) | (e >>> (32 - t));
}

/**
 * G 函数：S-box 置换 + 循环移位
 */
function G(e: number): number {
  const t: number[] = Array.from({ length: 4 });
  const n: number[] = Array.from({ length: 4 });
  i(e, t, 0);
  n[0] = h.zb[255 & t[0]];
  n[1] = h.zb[255 & t[1]];
  n[2] = h.zb[255 & t[2]];
  n[3] = h.zb[255 & t[3]];
  const r = B(n, 0);
  return r ^ Q(r, 2) ^ Q(r, 10) ^ Q(r, 18) ^ Q(r, 24);
}

/**
 * 块加密核心
 */
const __g = {
  // 解密/加密轮函数
  x(e: number[], t: number[]): number[] {
    let n: number[] = [];
    for (let r = e.length, i = 0; 0 < r; r -= 16) {
      const a = Array.from<number>({ length: 16 });
      for (let o = e.slice(16 * i, 16 * (i + 1)), c = 0; c < 16; c++) {
        a[c] = o[c] ^ t[c];
      }
      t = __g.r(a);
      n = n.concat(t);
      i++;
    }
    return n;
  },

  // 轮函数
  r(e: number[]): number[] {
    const t = Array.from<number>({ length: 16 });
    const n = Array.from<number>({ length: 36 });
    n[0] = B(e, 0);
    n[1] = B(e, 4);
    n[2] = B(e, 8);
    n[3] = B(e, 12);
    for (let r = 0; r < 32; r++) {
      const o = G(n[r + 1] ^ n[r + 2] ^ n[r + 3] ^ h.zk[r]);
      n[r + 4] = n[r] ^ o;
    }
    i(n[35], t, 0);
    i(n[34], t, 4);
    i(n[33], t, 8);
    i(n[32], t, 12);
    return t;
  },
};

/**
 * 加密常量表
 */
const h = {
  // 轮常数
  zk: [
    1_170_614_578, 1_024_848_638, 1_413_669_199, -343_334_464, -766_094_290, -1_373_058_082,
    -143_119_608, -297_228_157, 1_933_479_194, -971_186_181, -406_453_910, 460_404_854,
    -547_427_574, -1_891_326_262, -1_679_095_901, 2_119_585_428, -2_029_270_069, 2_035_090_028,
    -1_521_520_070, -5_587_175, -77_751_101, -2_094_365_853, -1_243_052_806, 1_579_901_135,
    1_321_810_770, 456_816_404, -1_391_643_889, -229_302_305, 330_002_838, -788_960_546,
    363_569_021, -1_947_871_109,
  ],

  // S-box
  zb: [
    20, 223, 245, 7, 248, 2, 194, 209, 87, 6, 227, 253, 240, 128, 222, 91, 237, 9, 125, 157, 230,
    93, 252, 205, 90, 79, 144, 199, 159, 197, 186, 167, 39, 37, 156, 198, 38, 42, 43, 168, 217, 153,
    15, 103, 80, 189, 71, 191, 97, 84, 247, 95, 36, 69, 14, 35, 12, 171, 28, 114, 178, 148, 86, 182,
    32, 83, 158, 109, 22, 255, 94, 238, 151, 85, 77, 124, 254, 18, 4, 26, 123, 176, 232, 193, 131,
    172, 143, 142, 150, 30, 10, 146, 162, 62, 224, 218, 196, 229, 1, 192, 213, 27, 110, 56, 231,
    180, 138, 107, 242, 187, 54, 120, 19, 44, 117, 228, 215, 203, 53, 239, 251, 127, 81, 11, 133,
    96, 204, 132, 41, 115, 73, 55, 249, 147, 102, 48, 122, 145, 106, 118, 74, 190, 29, 16, 174, 5,
    177, 129, 63, 113, 99, 31, 161, 76, 246, 34, 211, 13, 60, 68, 207, 160, 65, 111, 82, 165, 67,
    169, 225, 57, 112, 244, 155, 51, 236, 200, 233, 58, 61, 47, 100, 137, 185, 64, 17, 70, 234, 163,
    219, 108, 170, 166, 59, 149, 52, 105, 24, 212, 78, 173, 45, 0, 116, 226, 119, 136, 206, 135,
    175, 195, 25, 92, 121, 208, 126, 139, 3, 75, 141, 21, 130, 98, 241, 40, 154, 66, 184, 49, 181,
    46, 243, 88, 101, 183, 8, 23, 72, 188, 104, 179, 210, 134, 250, 201, 164, 89, 216, 202, 220, 50,
    221, 152, 140, 33, 235, 214,
  ],
};

/**
 * 自定义 base64 编码（使用知乎特定的字符表）
 */
function encodeCustom(param: number): string {
  const salt = "6fpLRqJO8M/c3jnYxFkUVC4ZIG12SiH=5v0mXDazWBTsuw7QetbKdoPyAl+hN9rgE";
  let result = "";
  for (const x of [0, 6, 12, 18]) {
    const a = param >>> x;
    const b = a & 63;
    const c = salt.charAt(b);
    result += c;
  }
  return result;
}

/**
 * 预处理：将 MD5 字符串转换为加密所需的字节数组
 */
function preProcess(md5Str: string): number[] {
  const md5CharCodeAtArr: number[] = [];
  for (let i = 0; i < md5Str.length; i++) {
    md5CharCodeAtArr.push(md5Str.charCodeAt(i));
  }

  md5CharCodeAtArr.unshift(0);
  md5CharCodeAtArr.unshift(Math.floor(Math.random() * 127));
  for (let i = 0; i < 15; i++) {
    md5CharCodeAtArr.push(14);
  }

  const md5CharCodeAtFrontArr = md5CharCodeAtArr.slice(0, 16);
  const fixArr = [48, 53, 57, 48, 53, 51, 102, 55, 100, 49, 53, 101, 48, 49, 100, 55];
  const new_md5_charCodeAt_arr: number[] = [];
  for (const [i, element] of md5CharCodeAtFrontArr.entries()) {
    new_md5_charCodeAt_arr.push(element ^ fixArr[i] ^ 42);
  }

  const __g_r = __g.r(new_md5_charCodeAt_arr);
  const md5CharCodeAtBackArr = md5CharCodeAtArr.slice(16, 48);
  const __g_x = __g.x(md5CharCodeAtBackArr, __g_r);
  return __g_r.concat(__g_x);
}

/**
 * 加密主函数
 *
 * @param md5Str - MD5 哈希字符串（32 位十六进制）
 * @returns 加密后的字符串（用作 x-zse-96 头的值）
 */
export function encrypt(md5Str: string): string {
  const processed = preProcess(md5Str);

  let current = 0;
  let resultStr = "";
  for (let i = 0; i < processed.length; i++) {
    const pop = processed[processed.length - i - 1];
    const i_mod_4 = i % 4;
    const i_mod_3 = i % 3;

    const a = 8 * i_mod_4;
    const b = 58 >>> a;
    const c = b & 255;
    const d = pop ^ c;
    const e = d << (8 * i_mod_3);

    current |= e;

    if (i_mod_3 === 2) {
      resultStr += encodeCustom(current);
      current = 0;
    }
  }
  return resultStr;
}
