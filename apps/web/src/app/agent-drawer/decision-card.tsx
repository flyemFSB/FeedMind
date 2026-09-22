import { memo, useState, useCallback, useMemo } from "react";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationDescription,
  ConfirmationActions,
  ConfirmationCancel,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  HelpCircle,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { m } from "motion/react";
import { cardOptionVariants } from "@/lib/motion";

export interface RawQuestionItem {
  question?: string | undefined;
  options?: string[] | undefined;
}

export interface NormalizedOption {
  id: string;
  indexStr: string;
  text: string;
  isRecommended: boolean;
  raw: string;
}

export interface NormalizedQuestion {
  id: string;
  question: string;
  options: [NormalizedOption, NormalizedOption, NormalizedOption];
}

export interface DecisionCardProps {
  question?: string | undefined;
  options?: string[] | undefined;
  questions?: RawQuestionItem[] | undefined;
  onSelectOption?: ((option: string) => void) | undefined;
  onSubmitAnswers?: ((answers: Record<number, string>, formattedText: string) => void) | undefined;
  selectedOption?: string | null | undefined;
  disabled?: boolean | undefined;
  isHistorical?: boolean | undefined;
  className?: string | undefined;
}

/** 默认预设兜底选项，确保每个问题严格提供 3 个选项 */
const DEFAULT_FALLBACK_OPTIONS = [
  "根据当前上下文自动推荐推进",
  "快速概览与核心逻辑要点",
  "自定义补充说明（在下方输入框中提供）",
];

/** 格式化选项：剥离编号与推荐标签，提取推荐属性 */
export function parseOptionLabel(opt: string, index: number) {
  // 识别并剥离中英文推荐标识
  const recRegex = /\s*(\(|\[|（|【)?\s*(?:推荐|recommended)\s*(\)|\]|）|】)?\s*[:：]?\s*/i;
  const isRecommended = recRegex.test(opt);
  const cleaned = opt.replace(new RegExp(recRegex, "gi"), " ").trim();

  // 识别数字序号如 "1. " 或 "1、"
  const match = cleaned.match(/^\s*(\d+)[.、\s]+(.*)$/);
  if (match && match[2]) {
    return {
      indexStr: match[1],
      text: match[2].trim(),
      isRecommended,
    };
  }
  return {
    indexStr: String(index + 1),
    text: cleaned,
    isRecommended,
  };
}

/** 归一化选项列表：严格固定为 3 个选项，且有且仅有 1 个推荐项 */
export function normalizeOptions(
  rawOptions?: string[] | undefined,
): [NormalizedOption, NormalizedOption, NormalizedOption] {
  const options = Array.isArray(rawOptions)
    ? rawOptions.flatMap((o) => {
        const trimmed = typeof o === "string" ? o.trim() : "";
        return trimmed ? [trimmed] : [];
      })
    : [];

  const parsed = options.map((opt, i) => {
    const info = parseOptionLabel(opt, i);
    return {
      id: String(i + 1),
      indexStr: String(i + 1),
      text: info.text || `方案 ${i + 1}`,
      isRecommended: info.isRecommended,
      raw: opt,
    };
  });

  const recIndex = parsed.findIndex((p) => p.isRecommended);

  // 截取前 3 项，若推荐项在后部则提前置换
  const result = parsed.slice(0, 3);
  if (recIndex >= 3 && parsed[recIndex]) {
    result[0] = parsed[recIndex];
  }

  // 补足 3 项默认预设
  while (result.length < 3) {
    const fillerIdx = result.length;
    const fillerText = DEFAULT_FALLBACK_OPTIONS[fillerIdx] ?? `方案 ${fillerIdx + 1}`;
    result.push({
      id: String(fillerIdx + 1),
      indexStr: String(fillerIdx + 1),
      text: fillerText,
      isRecommended: false,
      raw: fillerText,
    });
  }

  // 确保有且仅有 1 个选项标为推荐
  const activeRecIdx = result.findIndex((p) => p.isRecommended);
  const targetRecIdx = activeRecIdx >= 0 ? activeRecIdx : 0;

  return result.map((item, idx) => ({
    ...item,
    id: String(idx + 1),
    indexStr: String(idx + 1),
    isRecommended: idx === targetRecIdx,
  })) as [NormalizedOption, NormalizedOption, NormalizedOption];
}

/** 归一化问题列表：统一单问题与多问题结构 */
export function normalizeQuestions(
  singleQuestion?: string | undefined,
  singleOptions?: string[] | undefined,
  questionsList?: RawQuestionItem[] | undefined,
): NormalizedQuestion[] {
  if (Array.isArray(questionsList) && questionsList.length > 0) {
    const valid = questionsList.flatMap((q) =>
      q && typeof q.question === "string" && q.question.trim().length > 0 ? [q] : [],
    );
    if (valid.length > 0) {
      return valid.map((q, qIdx) => ({
        id: `question-${qIdx + 1}`,
        question: q.question!.trim(),
        options: normalizeOptions(q.options),
      }));
    }
  }

  const qText = (singleQuestion && singleQuestion.trim()) || "请选择接下来的推进方向";
  return [
    {
      id: "question-1",
      question: qText,
      options: normalizeOptions(singleOptions),
    },
  ];
}

/** 格式化已提交答案为回传文本 */
export function formatSubmittedAnswers(
  questions: NormalizedQuestion[],
  answers: Record<number, string>,
): string {
  if (questions.length === 1 && questions[0]) {
    const chosen = answers[0];
    if (chosen) return chosen;
    const q0 = questions[0];
    const rec = q0.options.find((o) => o.isRecommended) ?? q0.options[0];
    return rec?.text ?? "";
  }

  const lines: string[] = ["关于澄清问题的答复："];
  questions.forEach((q, idx) => {
    const chosen = answers[idx];
    if (chosen) {
      lines.push(`${idx + 1}. ${q.question}：${chosen}`);
    } else {
      const rec = q.options.find((o) => o.isRecommended) ?? q.options[0];
      lines.push(`${idx + 1}. ${q.question}：${rec.text}（默认推荐）`);
    }
  });
  return lines.join("\n");
}

const STATIC_FALLBACK_QUESTION: NormalizedQuestion = {
  id: "question-fallback",
  question: "请选择接下来的推进方向",
  options: normalizeOptions([]),
};

export const DecisionCard = memo(
  ({
    question,
    options,
    questions,
    onSelectOption,
    onSubmitAnswers,
    selectedOption: externalSelected,
    disabled = false,
    isHistorical = false,
    className,
  }: DecisionCardProps) => {
    const { t } = useTranslation();

    // 归一化问题数据，确保每个问题严格包含 3 个选项
    const normalizedQuestions = useMemo(
      () => normalizeQuestions(question, options, questions),
      [question, options, questions],
    );

    // 题目分页切换与每题答案收集
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>(() => {
      if (externalSelected) {
        return { 0: externalSelected };
      }
      return {};
    });
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, string>>({});

    const isCompleted = Boolean(externalSelected || isSubmitted || isHistorical);
    const safeIndex = Math.min(Math.max(0, currentIndex), normalizedQuestions.length - 1);
    const currentQuestion =
      normalizedQuestions[safeIndex] ?? normalizedQuestions[0] ?? STATIC_FALLBACK_QUESTION;
    const currentAnswer = answers[safeIndex];

    const answeredCount = Object.keys(answers).length;
    const allAnswered = answeredCount >= normalizedQuestions.length;

    // 切换当前题目的已选方案
    const handleSelectCurrentOption = useCallback(
      (optText: string) => {
        if (disabled || isCompleted) return;
        setAnswers((prev) => ({
          ...prev,
          [safeIndex]: optText,
        }));
      },
      [disabled, isCompleted, safeIndex],
    );

    // 提交答案
    const handleSubmit = useCallback(() => {
      if (disabled || isCompleted) return;
      const formattedText = formatSubmittedAnswers(normalizedQuestions, answers);
      setIsSubmitted(true);
      setSubmittedAnswers(answers);
      if (onSubmitAnswers) {
        onSubmitAnswers(answers, formattedText);
      } else if (onSelectOption) {
        onSelectOption(formattedText);
      }
    }, [disabled, isCompleted, normalizedQuestions, answers, onSubmitAnswers, onSelectOption]);

    // 聚焦底部输入框以补充自定义信息
    const handleFocusComposer = useCallback(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea[aria-label]");
      if (textarea) {
        textarea.focus();
        textarea.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, []);

    return (
      <Confirmation
        state={isCompleted ? "accept" : "request"}
        className={cn("my-2 overflow-hidden transition-all", className)}
      >
        {/* 卡片头部 */}
        <ConfirmationTitle
          icon={
            isCompleted ? (
              <CheckCircle2 className="size-4 text-editorial-semantic-success" />
            ) : (
              <HelpCircle className="size-4 text-editorial-accent" />
            )
          }
        >
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-editorial-ink">
              {isCompleted
                ? t("chat.decisionMade", "意图已确认")
                : t("chat.needsClarification", "需要进一步明确方向")}
            </span>
            {normalizedQuestions.length > 1 && !isCompleted && (
              <span className="text-[11px] font-mono text-editorial-ink-muted">
                {t("chat.questionStep", "问题 {{current}} / {{total}}", {
                  current: safeIndex + 1,
                  total: normalizedQuestions.length,
                })}
              </span>
            )}
          </div>
        </ConfirmationTitle>

        {/* 交互态：题目导航与分页切换 */}
        {!isCompleted && normalizedQuestions.length > 1 && (
          <div className="flex items-center gap-1.5 pl-6 pt-0.5 flex-wrap">
            {normalizedQuestions.map((q, idx) => {
              const isCurrent = idx === safeIndex;
              const isAnswered = Boolean(answers[idx]);
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer",
                    isCurrent
                      ? "bg-editorial-accent text-editorial-ink-on-primary shadow-2xs font-semibold"
                      : isAnswered
                        ? "bg-editorial-semantic-success/15 text-editorial-semantic-success border border-editorial-semantic-success/30 hover:bg-editorial-semantic-success/25"
                        : "bg-editorial-surface-soft text-editorial-ink-muted border border-editorial-hairline hover:bg-editorial-surface-strong hover:text-editorial-ink",
                    disabled && "pointer-events-none opacity-50",
                  )}
                >
                  {isAnswered && !isCurrent ? (
                    <Check className="size-2.5 stroke-[3]" />
                  ) : (
                    <span className="font-mono">{idx + 1}</span>
                  )}
                  <span>问题 {idx + 1}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 交互态：当前题目内容与 3 个固定选项 */}
        {!isCompleted && (
          <div className="space-y-2">
            <ConfirmationDescription className="text-xs font-semibold text-editorial-ink pl-6">
              {currentQuestion.question}
            </ConfirmationDescription>

            <div className="space-y-1.5 pl-6">
              <div className="flex items-center justify-between text-[11px] font-medium text-editorial-ink-muted">
                <span>{t("chat.selectOptionPrompt", "请选择接下来推进的方向：")}</span>
                {currentAnswer && (
                  <span className="flex items-center gap-1 text-[11px] text-editorial-semantic-success font-medium">
                    <Check className="size-3 stroke-[2.5]" />
                    已选方案
                  </span>
                )}
              </div>

              {/* 严格固定 3 个选项 */}
              <div className="flex flex-col gap-1.5">
                <m.div
                  key={safeIndex}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col gap-1.5"
                >
                  {currentQuestion.options.map((option) => {
                    const isThisSelected =
                      currentAnswer === option.text || currentAnswer === option.raw;
                    const isRecommended = option.isRecommended;

                    return (
                      <m.button
                        key={option.id}
                        type="button"
                        variants={cardOptionVariants}
                        initial="initial"
                        animate="animate"
                        whileHover={!disabled ? { scale: 1.006, x: 2 } : {}}
                        whileTap={!disabled ? { scale: 0.985 } : {}}
                        onClick={() => handleSelectCurrentOption(option.text)}
                        disabled={disabled}
                        className={cn(
                          "group relative flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer",
                          isThisSelected
                            ? "border-editorial-semantic-success/50 bg-editorial-semantic-success/10 text-editorial-ink font-medium shadow-2xs"
                            : isRecommended
                              ? "border-editorial-accent/35 bg-editorial-accent/5 text-editorial-ink hover:border-editorial-accent/60 hover:bg-editorial-accent/10"
                              : "border-editorial-hairline bg-editorial-surface-soft/60 text-editorial-ink hover:border-editorial-hairline-strong hover:bg-editorial-surface-soft",
                          disabled && "pointer-events-none opacity-50",
                        )}
                      >
                        {/* 序号 / 选中勾选指示 */}
                        <div
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-mono font-semibold transition-colors mt-0.5",
                            isThisSelected
                              ? "bg-editorial-semantic-success text-editorial-ink-on-primary"
                              : isRecommended
                                ? "bg-editorial-accent/20 text-editorial-accent group-hover:bg-editorial-accent group-hover:text-editorial-ink-on-primary"
                                : "bg-editorial-surface-strong text-editorial-ink-muted group-hover:bg-editorial-accent group-hover:text-editorial-ink-on-primary",
                          )}
                        >
                          {isThisSelected ? (
                            <Check className="size-3 stroke-[3]" />
                          ) : (
                            option.indexStr
                          )}
                        </div>

                        {/* 选项正文 */}
                        <div className="min-w-0 flex-1 text-[12px] leading-relaxed break-words">
                          {option.text}
                        </div>

                        {/* 推荐徽章 */}
                        {isRecommended && (
                          <div className="flex shrink-0 items-center gap-1 rounded bg-editorial-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-editorial-accent border border-editorial-accent/30 mt-0.5">
                            <Sparkles className="size-2.5" />
                            <span>{t("chat.recommendedBadge", "推荐")}</span>
                          </div>
                        )}
                      </m.button>
                    );
                  })}
                </m.div>
              </div>
            </div>
          </div>
        )}

        {/* 已确认完成态展示 */}
        {isCompleted && (
          <div className="space-y-2 pl-6 pt-1">
            <div className="text-[11px] font-medium text-editorial-ink-muted">
              {t("chat.selectedOptionLabel", "已选方案：")}
            </div>
            <div className="flex flex-col gap-1.5">
              {normalizedQuestions.map((q, idx) => {
                const ans =
                  submittedAnswers[idx] ??
                  answers[idx] ??
                  (idx === 0 ? externalSelected : null) ??
                  q.options.find((o) => o.isRecommended)?.text ??
                  q.options[0].text;
                return (
                  <div
                    key={q.id}
                    className="flex items-start gap-2.5 rounded-lg border border-editorial-semantic-success/30 bg-editorial-semantic-success/5 p-2.5 text-xs"
                  >
                    <div className="flex size-4.5 shrink-0 items-center justify-center rounded-md bg-editorial-semantic-success text-editorial-ink-on-primary text-[10px] font-semibold mt-0.5">
                      <Check className="size-3 stroke-[3]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {normalizedQuestions.length > 1 && (
                        <div className="text-[11px] font-medium text-editorial-ink-muted mb-0.5">
                          {q.question}
                        </div>
                      )}
                      <div className="text-[12px] font-medium text-editorial-ink break-words">
                        {ans}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 底部操作区：翻页与提交 */}
        {!isCompleted && (
          <ConfirmationActions className="pt-2 flex items-center justify-between gap-2 flex-wrap">
            {/* 多题目翻页导航 */}
            {normalizedQuestions.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <ConfirmationCancel
                  type="button"
                  size="sm"
                  disabled={disabled || safeIndex === 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <ChevronLeft className="size-3" />
                  <span>{t("chat.prevQuestion", "上一题")}</span>
                </ConfirmationCancel>

                {safeIndex < normalizedQuestions.length - 1 && (
                  <ConfirmationAction
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      setCurrentIndex((prev) => Math.min(normalizedQuestions.length - 1, prev + 1))
                    }
                    className="h-7 gap-1 px-2.5 text-xs text-editorial-ink hover:text-editorial-ink"
                  >
                    <span>{t("chat.nextQuestion", "下一题")}</span>
                    <ChevronRight className="size-3" />
                  </ConfirmationAction>
                )}
              </div>
            ) : (
              <ConfirmationCancel
                onClick={handleFocusComposer}
                className="h-7 gap-1 px-2 text-[11px] text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft"
              >
                <MessageSquare className="size-3" />
                <span>{t("chat.customInputPrompt", "在输入框自定义补充...")}</span>
              </ConfirmationCancel>
            )}

            {/* 提交回答与输入框跳转 */}
            <div className="flex items-center gap-2 ml-auto">
              {normalizedQuestions.length > 1 && (
                <ConfirmationCancel
                  onClick={handleFocusComposer}
                  className="h-7 gap-1 px-2 text-[11px] text-editorial-ink-muted hover:text-editorial-ink hover:bg-editorial-surface-soft"
                >
                  <MessageSquare className="size-3" />
                  <span>{t("chat.customInputPrompt", "在输入框自定义补充...")}</span>
                </ConfirmationCancel>
              )}

              <ConfirmationAction
                type="button"
                size="sm"
                variant="default"
                disabled={disabled || answeredCount === 0}
                onClick={handleSubmit}
                className={cn(
                  "h-7 gap-1.5 px-3 text-xs font-medium cursor-pointer transition-all",
                  answeredCount > 0
                    ? "bg-editorial-accent text-editorial-ink-on-primary hover:bg-editorial-accent/90"
                    : "opacity-50",
                )}
              >
                <CornerDownLeft className="size-3" />
                <span>
                  {normalizedQuestions.length > 1
                    ? allAnswered
                      ? t("chat.submitAllAnswers", "提交所有回答")
                      : t(
                          "chat.submitAnswersProgress",
                          `提交回答 (${answeredCount}/${normalizedQuestions.length})`,
                          {
                            count: answeredCount,
                            total: normalizedQuestions.length,
                          },
                        )
                    : t("chat.submitAnswer", "提交回答")}
                </span>
              </ConfirmationAction>
            </div>
          </ConfirmationActions>
        )}
      </Confirmation>
    );
  },
);

DecisionCard.displayName = "DecisionCard";
