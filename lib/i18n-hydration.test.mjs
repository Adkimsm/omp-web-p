import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { setLocale, translate, useI18n } = await jiti.import("./i18n/index.tsx");

function Labels() {
  const { locale, t, tn } = useI18n();
  return createElement("span", { lang: locale },
    t("sessionSidebar.new"), " | ", tn("chatWindow.messageCount", 2));
}

test("React translations use the server snapshot even when the client locale is already set", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalState = globalThis.__ompI18nState.locale;
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true, value: { documentElement: { lang: "en" } },
    });
    for (const locale of ["zh-CN", "ja"]) {
      setLocale(locale);
      assert.notEqual(translate("sessionSidebar.new"), "New");
      assert.equal(renderToStaticMarkup(createElement(Labels)),
        '<span lang="en">New | 2 messages</span>');
    }
  } finally {
    globalThis.__ompI18nState.locale = originalState;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  }
});
