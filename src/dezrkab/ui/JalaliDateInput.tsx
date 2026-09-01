// @ts-nocheck
/**
 * انتخابگر تاریخ جلالی — جایگزین کامل input[type=date] میلادی مرورگر
 * هفته از شنبه؛ نام ماه‌های فارسی؛ روز ناموجود اصلاً قابل انتخاب نیست؛
 * پیمایش ماه/سال؛ کلید Escape و کلیک بیرون، تقویم را می‌بندند.
 *
 * لایه‌بندی: پنجره تقویم با portal روی document.body و با position: fixed
 * رندر می‌شود تا از stacking-context و overflow همه نیاکان (کارت‌های anim-up،
 * جدول‌ها و…) مستقل باشد — هیچ‌وقت پشت عنصر دیگری نمی‌ماند و بریده نمی‌شود.
 * موقعیت از مستطیل ورودی محاسبه، به لبه‌های viewport محدود و در صورت کمبود
 * جا به بالای ورودی منتقل می‌شود.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  faNum,
  JALALI_MONTHS,
  JALALI_WEEKDAYS_SHORT,
  jalaliInputString,
  jalaliMonthLength,
  jalaliParts,
  jalaliToTime,
  startOfDay,
} from "../utils/format";
import { IconArrowLeft, IconArrowRight } from "./icons";

const POPUP_W = 256; /* w-64 */
const POPUP_H = 336; /* برآورد ارتفاع برای تصمیم جابه‌جایی به بالا */

export default function JalaliDateInput({
  value,
  onChange,
  invalid,
  compact,
}: {
  value: number | null;
  onChange: (ts: number) => void;
  invalid?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => jalaliParts(value ?? Date.now()));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  /* با بازشدن، نمای تقویم روی ماهِ مقدار فعلی قفل می‌شود */
  useEffect(() => {
    if (open) setView(jalaliParts(value ?? Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* موقعیت پنجره نسبت به viewport — هنگام اسکرول/تغییر اندازه به‌روز می‌ماند */
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      /* راستِ تقویم با راستِ ورودی هم‌تراز (حس RTL) — با محدود به لبه‌ها */
      const left = Math.round(
        Math.min(Math.max(8, r.right - POPUP_W), Math.max(8, vw - POPUP_W - 8))
      );
      /* پایینِ ورودی جا نیست و بالای صفحه جا هست → باز شدن رو به بالا */
      const below = r.bottom + 6 + POPUP_H + 8;
      const top =
        below <= vh || r.top < POPUP_H + 14
          ? Math.round(r.bottom + 6)
          : Math.round(r.top - POPUP_H - 6);
      setPos({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  /* بستن با کلیک بیرون (ورودی و پنجره هر دو استثنا) یا Escape */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const moveMonth = (n: number) => {
    let jy = view.jy;
    let jm = view.jm + n;
    while (jm < 1) {
      jm += 12;
      jy -= 1;
    }
    while (jm > 12) {
      jm -= 12;
      jy += 1;
    }
    setView({ jy, jm, jd: 1 });
  };

  const monthStartTs = jalaliToTime(view.jy, view.jm, 1);
  /* فاصله اولین روز ماه از خانه نخست — شنبه = ۰ */
  const offset = (new Date(monthStartTs).getDay() + 1) % 7;
  const len = jalaliMonthLength(view.jy, view.jm);
  const todayP = jalaliParts(startOfDay(Date.now()));
  const selP = value ? jalaliParts(startOfDay(value)) : null;

  return (
    <>
      <div ref={wrapRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inp num cursor-pointer text-center text-sm font-bold transition-colors hover:border-brand ${
            compact ? "w-32" : "w-36"
          } ${invalid ? "border-danger ring-2 ring-danger/20" : ""} ${
            value ? "text-ink" : "text-inkmute"
          }`}
        >
          {value ? jalaliInputString(value) : "انتخاب تاریخ"}
        </button>
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            dir="rtl"
            style={{ top: pos.top, left: pos.left, width: POPUP_W }}
            className="anim-pop fixed z-[75] rounded-xl border border-line bg-card p-3 shadow-[var(--shadow-pop)]"
          >
            {/* سربرگ ماه و سال */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="cursor-pointer rounded-lg p-1.5 text-inksoft transition-colors hover:bg-brandsoft hover:text-branddeep"
                aria-label="ماه قبل"
                title="ماه قبل"
              >
                <IconArrowRight size={15} />
              </button>
              <div className="text-center">
                <p className="font-display text-base leading-5 text-ink">
                  {JALALI_MONTHS[view.jm - 1]}
                </p>
                <p className="num text-[11px] font-bold text-inkmute">{faNum(view.jy)}</p>
              </div>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="cursor-pointer rounded-lg p-1.5 text-inksoft transition-colors hover:bg-brandsoft hover:text-branddeep"
                aria-label="ماه بعد"
                title="ماه بعد"
              >
                <IconArrowLeft size={15} />
              </button>
            </div>

            {/* شبکه روزها — راست‌به‌چپ با شنبه در نخستین ستون */}
            <div className="mt-2.5 grid grid-cols-7 gap-1 text-center">
              {JALALI_WEEKDAYS_SHORT.map((w) => (
                <span key={w} className="py-1 text-[10px] font-extrabold text-inkmute">
                  {w}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`e${i}`} />
              ))}
              {Array.from({ length: len }).map((_, i) => {
                const d = i + 1;
                const isSel =
                  !!selP && selP.jy === view.jy && selP.jm === view.jm && selP.jd === d;
                const isToday =
                  todayP.jy === view.jy && todayP.jm === view.jm && todayP.jd === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onChange(jalaliToTime(view.jy, view.jm, d));
                      setOpen(false);
                    }}
                    className={`num aspect-square cursor-pointer rounded-lg text-xs font-bold transition-all duration-100 active:scale-90 ${
                      isSel
                        ? "bg-brand text-white shadow-[0_3px_10px_rgba(29,98,214,0.4)]"
                        : isToday
                          ? "bg-brandsoft text-branddeep ring-1 ring-brand/40"
                          : "text-ink hover:bg-black/5"
                    }`}
                  >
                    {faNum(d)}
                  </button>
                );
              })}
            </div>

            {/* پانوشت: میانبر امروز + تاریخ اول ماه جاری */}
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <button
                type="button"
                onClick={() => {
                  onChange(startOfDay(Date.now()));
                  setOpen(false);
                }}
                className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold text-branddeep transition-colors hover:bg-brandsoft"
              >
                امروز
              </button>
              <span className="num text-[10px] font-bold text-inkmute">
                {jalaliInputString(monthStartTs)}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
