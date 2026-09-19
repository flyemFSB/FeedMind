// react-doctor 规则豁免：仅关闭已知误报，勿作为压分数的手段
export default {
  ignore: {
    overrides: [
      {
        // shadcn/ui 生成代码：variants 常量与组件同文件导出是上游 CLI 的固定产物，
        // 不参与 Fast Refresh 热更新语义；随上游更新重新生成，不逐个改写
        files: ["src/components/ui/**"],
        rules: [
          "react-doctor/only-export-components",
          "react-doctor/prefer-explicit-variants",
          "react-doctor/no-multi-component-file",
        ],
      },
      {
        // Streamdown 包装器有意接受 string | ReactNode 双类型 children
        // （string 走数学公式规范化），运行时类型收窄是契约本身
        files: ["src/components/ai-elements/message.tsx"],
        rules: ["react-doctor/no-polymorphic-children"],
      },
      {
        // 轮询 effect 已手工实现 cancelled 标志（cleanup 置位 + 每个 await 后 return），
        // 真实竞态已消除；该规则的分析器只认自己的固定形态，不识别此守卫
        files: ["src/app/remote-connection/feishu-config-panel.tsx"],
        rules: ["react-doctor/no-set-state-after-await-in-effect"],
      },
      {
        // 用户显式点击打开的全屏播放弹窗（存在用户手势），旁白音频即内容主体，
        // 静音自动播放反而破坏体验；与代码内 eslint-disable 注释的理由一致,
        // react-doctor 自有引擎不读 eslint-disable，故在此豁免
        files: ["src/pages/daily-report/video-player-dialog.tsx"],
        rules: ["react-doctor/no-autoplay-without-muted"],
      },
      {
        // isSaving/isTriggering 是两条独立 mutation 的 pending 标志（与规则明确豁免的
        // isLoading 同类），非互斥变体开关；拆成变体组件反而丢失双忙状态信息
        files: ["src/pages/daily-report/schedule-card.tsx"],
        rules: ["react-doctor/prefer-explicit-variants"],
      },
      {
        // React Context 容器文件：导出 Provider 组件与外部读取 hook / 获取上下文工具函数是标准惯用模式
        files: ["src/app/shell/app-shell-context.tsx"],
        rules: ["react-doctor/only-export-components"],
      },
      {
        // 异步数据加载已通过 loadIdRef 实现精确防竞态守卫，静态分析器无法识别此条件重置
        files: ["src/pages/wiki/wiki-editor.tsx", "src/pages/wiki/wiki-reader.tsx"],
        rules: ["react-doctor/no-loading-flag-reset-outside-finally"],
      },
      {
        // 资讯卡片整体点击查看详情，内嵌跳转原文按钮已通过 stopPropagation 隔离事件传播
        files: ["src/pages/feeds/feeds-page.tsx"],
        rules: ["react-doctor/html-no-nested-interactive"],
      },
    ],
  },
};
