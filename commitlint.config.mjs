export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // 新功能
        "fix", // 修复
        "chore", // 杂项（构建、依赖等）
        "docs", // 文档
        "refactor", // 重构
        "test", // 测试
        "style", // 代码格式（不影响功能的变动）
        "perf", // 性能优化
      ],
    ],
    "scope-case": [2, "always", "kebab-case"],
    "subject-case": [0],
    "subject-full-stop": [2, "never", "."],
  },
};
