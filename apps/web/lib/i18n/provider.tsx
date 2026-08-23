import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./index";

/**
 * I18nProvider — 使用 react-i18next 的 I18nextProvider
 * i18n 在模块导入时已同步初始化，无需额外 waiting state
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
