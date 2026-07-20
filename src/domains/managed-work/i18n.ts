import type { Language } from "../../types.js";

export function managedLanguage(language?: Language): Language {
  return language === "en" ? "en" : "zh";
}

export function managedText(
  language: Language | undefined,
  zh: string,
  en: string,
): string {
  return managedLanguage(language) === "en" ? en : zh;
}

export function managedList(
  language: Language | undefined,
  values: string[],
  emptyZh = "无",
  emptyEn = "none",
): string {
  if (values.length === 0) return managedText(language, emptyZh, emptyEn);
  return values.join(managedText(language, "、", ", "));
}
