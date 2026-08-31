// react-doctor 规则豁免：仅关闭已知误报，勿作为压分数的手段
export default {
  ignore: {
    overrides: [
      {
        // shadcn/ui 生成代码：variants 常量与组件同文件导出是上游 CLI 的固定产物，
        // 不参与 Fast Refresh 热更新语义；随上游更新重新生成，不逐个改写
        files: ["components/ui/**"],
        rules: [
          "react-doctor/only-export-components",
          "react-doctor/prefer-explicit-variants",
          "react-doctor/no-multi-component-file",
        ],
      },
      {
        // Streamdown 包装器有意接受 string | ReactNode 双类型 children
        // （string 走数学公式规范化），运行时类型收窄是契约本身
        files: ["components/ai-elements/message.tsx"],
        rules: ["react-doctor/no-polymorphic-children"],
      },
      {
        // 轮询 effect 已手工实现 cancelled 标志（cleanup 置位 + 每个 await 后 return），
        // 真实竞态已消除；该规则的分析器只认自己的固定形态，不识别此守卫
        files: ["components/remote-connection/feishu-config-panel.tsx"],
        rules: ["react-doctor/no-set-state-after-await-in-effect"],
      },
      {
        // 用户显式点击打开的全屏播放弹窗（存在用户手势），旁白音频即内容主体，
        // 静音自动播放反而破坏体验；与代码内 eslint-disable 注释的理由一致,
        // react-doctor 自有引擎不读 eslint-disable，故在此豁免
        files: ["components/daily-report/video-player-dialog.tsx"],
        rules: ["react-doctor/no-autoplay-without-muted"],
      },
      {
        // isSaving/isTriggering 是两条独立 mutation 的 pending 标志（与规则明确豁免的
        // isLoading 同类），非互斥变体开关；拆成变体组件反而丢失双忙状态信息
        files: ["components/daily-report/schedule-card.tsx"],
        rules: ["react-doctor/prefer-explicit-variants"],
      },
    ],
  },
};
