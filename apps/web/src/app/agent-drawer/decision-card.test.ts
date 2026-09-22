import { describe, expect, it } from "vitest";
import {
  parseOptionLabel,
  normalizeOptions,
  normalizeQuestions,
  formatSubmittedAnswers,
} from "./decision-card";

describe("parseOptionLabel", () => {
  it("解析带英文句号编号的选项", () => {
    const res = parseOptionLabel("1. 架构原理与设计演进", 0);
    expect(res.indexStr).toBe("1");
    expect(res.text).toBe("架构原理与设计演进");
    expect(res.isRecommended).toBe(false);
  });

  it("解析带顿号的中文选项", () => {
    const res = parseOptionLabel("2、业界落地实践与评测", 1);
    expect(res.indexStr).toBe("2");
    expect(res.text).toBe("业界落地实践与评测");
    expect(res.isRecommended).toBe(false);
  });

  it("无编号时自动按序号回退递增索引", () => {
    const res = parseOptionLabel("直接执行全量评估", 2);
    expect(res.indexStr).toBe("3");
    expect(res.text).toBe("直接执行全量评估");
    expect(res.isRecommended).toBe(false);
  });

  it("修剪两侧冗余空白", () => {
    const res = parseOptionLabel("  3.   仅分析核心模块   ", 2);
    expect(res.indexStr).toBe("3");
    expect(res.text).toBe("仅分析核心模块");
  });

  it("正确识别并剔除前缀推荐标记", () => {
    const res = parseOptionLabel("(推荐) 1. 架构原理与设计演进", 0);
    expect(res.indexStr).toBe("1");
    expect(res.text).toBe("架构原理与设计演进");
    expect(res.isRecommended).toBe(true);
  });

  it("正确识别并剔除后缀推荐标记", () => {
    const res = parseOptionLabel("2. 业界落地实践与评测 [推荐]", 1);
    expect(res.indexStr).toBe("2");
    expect(res.text).toBe("业界落地实践与评测");
    expect(res.isRecommended).toBe(true);
  });
});

describe("normalizeOptions", () => {
  it("刚好 3 个选项且首个带推荐时，保持数量与推荐项不变", () => {
    const raw = ["(推荐) 方案A", "方案B", "方案C"];
    const res = normalizeOptions(raw);
    expect(res).toHaveLength(3);
    expect(res[0].text).toBe("方案A");
    expect(res[0].isRecommended).toBe(true);
    expect(res[1].text).toBe("方案B");
    expect(res[1].isRecommended).toBe(false);
    expect(res[2].text).toBe("方案C");
    expect(res[2].isRecommended).toBe(false);
  });

  it("无推荐标记时，默认将第 1 个选项设为推荐项", () => {
    const raw = ["方案A", "方案B", "方案C"];
    const res = normalizeOptions(raw);
    expect(res).toHaveLength(3);
    expect(res[0].isRecommended).toBe(true);
    expect(res[1].isRecommended).toBe(false);
    expect(res[2].isRecommended).toBe(false);
  });

  it("若中间选项带推荐，仅将该项标为推荐", () => {
    const raw = ["方案A", "(推荐) 方案B", "方案C"];
    const res = normalizeOptions(raw);
    expect(res[0].isRecommended).toBe(false);
    expect(res[1].isRecommended).toBe(true);
    expect(res[2].isRecommended).toBe(false);
  });

  it("选项多于 3 个时，截取前 3 个，若推荐项在后部则自动置换", () => {
    const raw = ["方案1", "方案2", "方案3", "方案4", "(推荐) 方案5"];
    const res = normalizeOptions(raw);
    expect(res).toHaveLength(3);
    const recItem = res.find((r) => r.isRecommended);
    expect(recItem).toBeDefined();
    expect(recItem?.text).toBe("方案5");
  });

  it("选项少于 3 个时，使用优雅兜底方案补足至 3 个", () => {
    const raw = ["(推荐) 方案独苗"];
    const res = normalizeOptions(raw);
    expect(res).toHaveLength(3);
    expect(res[0].text).toBe("方案独苗");
    expect(res[0].isRecommended).toBe(true);
    expect(res[1].text).toContain("快速概览");
    expect(res[2].text).toContain("自定义补充");
  });

  it("输入为空或 undefined 时，优雅生成 3 个预设选项", () => {
    const res = normalizeOptions(undefined);
    expect(res).toHaveLength(3);
    expect(res[0].isRecommended).toBe(true);
    expect(res[1].isRecommended).toBe(false);
    expect(res[2].isRecommended).toBe(false);
  });
});

describe("normalizeQuestions", () => {
  it("单问题正确归一化为 1 题 3 选项", () => {
    const res = normalizeQuestions("请选择研究方向", ["(推荐) 方案A", "方案B"]);
    expect(res).toHaveLength(1);
    expect(res[0]?.question).toBe("请选择研究方向");
    expect(res[0]?.options).toHaveLength(3);
    expect(res[0]?.options[0]?.isRecommended).toBe(true);
  });

  it("多问题正确分别归一化每个问题为 3 选项", () => {
    const questions = [
      { question: "技术栈选择", options: ["React 19", "Vue 3", "Svelte 5"] },
      { question: "研究深度", options: ["(推荐) 深入源码", "简要概述"] },
    ];
    const res = normalizeQuestions(undefined, undefined, questions);
    expect(res).toHaveLength(2);
    expect(res[0]?.question).toBe("技术栈选择");
    expect(res[0]?.options).toHaveLength(3);
    expect(res[1]?.question).toBe("研究深度");
    expect(res[1]?.options).toHaveLength(3);
    expect(res[1]?.options[0]?.isRecommended).toBe(true);
  });
});

describe("formatSubmittedAnswers", () => {
  it("单问题时直接输出所选纯文本", () => {
    const questions = normalizeQuestions("研究方向", ["方案A", "方案B", "方案C"]);
    const text = formatSubmittedAnswers(questions, { 0: "方案B" });
    expect(text).toBe("方案B");
  });

  it("多问题时格式化为清晰编号列表，未选题目采用推荐方案并标注", () => {
    const questions = normalizeQuestions(undefined, undefined, [
      { question: "技术栈", options: ["React", "Vue", "Angular"] },
      { question: "分析深度", options: ["(推荐) 源码解析", "快速概览"] },
    ]);
    const text = formatSubmittedAnswers(questions, { 0: "React" });
    expect(text).toContain("关于澄清问题的答复：");
    expect(text).toContain("1. 技术栈：React");
    expect(text).toContain("2. 分析深度：源码解析（默认推荐）");
  });
});
