// @ts-nocheck
/**
 * پیمایش سریع فرم‌ها با کلید Enter —
 * با زدن Enter در هر فیلد، فوکوس به فیلد بعدی همان فرم/کارت می‌رود
 * و اگر فیلد آخر باشد، فرم ثبت می‌شود (رفتار طبیعی مرورگر).
 */
import { useEffect } from "react";

const SEL = [
  "input:not([type=hidden]):not([disabled]):not([readonly])",
  "select:not([disabled])",
  "textarea:not([disabled])",
].join(",");

function scopeOf(el: Element): Element {
  return (
    el.closest("form") ??
    el.closest("[data-enter-flow]") ??
    el.closest(".card") ??
    document.body
  );
}

function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

export function useEnterFlow(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
      if (tag !== "INPUT" && tag !== "SELECT") return;
      const type = (el as HTMLInputElement).type;
      if (type === "submit" || type === "button" || type === "checkbox" || type === "radio") return;
      if (el.closest('[data-enter-flow="off"]')) return; // صفحاتی با پیمایش اختصاصی

      const scope = scopeOf(el);
      const fields = Array.from(scope.querySelectorAll<HTMLElement>(SEL)).filter((f) => {
        const t = (f as HTMLInputElement).type;
        return t !== "checkbox" && t !== "radio" && t !== "submit" && t !== "button" && isVisible(f);
      });
      const i = fields.indexOf(el);
      if (i === -1) return;
      const next = fields[i + 1];
      if (!next) {
        // فیلد آخر — اگر فرم واقعی نیست، دکمهٔ ثبت کارت را بزن
        if (scope.tagName !== "FORM") {
          const btn = scope.querySelector<HTMLElement>("[data-enter-submit]:not([disabled])");
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
        return; // فرم واقعی → ثبت با رفتار طبیعی
      }
      e.preventDefault();
      next.focus();
      const nt = (next as HTMLInputElement).type;
      if (typeof (next as HTMLInputElement).select === "function" && nt !== "date" && nt !== "time") {
        try {
          (next as HTMLInputElement).select();
        } catch {
          /* بی‌اهمیت */
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
