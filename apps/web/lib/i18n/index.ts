/**
 * i18n 国际化配置
 * 使用 react-i18next，支持中文和英文
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

const SUPPORTED_LANGUAGES = ["zh-CN", "en-US"];

void i18n
  .use(LanguageDetector) // 自动检测浏览器语言
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en-US": { translation: enUS },
    },
    fallbackLng: "zh-CN", // 默认中文
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false, // React 已处理 XSS
      prefix: "{",
      suffix: "}",
    },
    detection: {
      // 语言检测策略：localStorage > cookie > 浏览器设置
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "feedmind-language",
    },
  });

export default i18n;
