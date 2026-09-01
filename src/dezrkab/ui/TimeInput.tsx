// @ts-nocheck
/**
 * ورودی ساعت با اعداد فارسی — جایگزین input[type=time] مرورگر.
 * مقدار همیشه به شکل استاندارد "HH:MM" (لاتین) نگه داشته می‌شود
 * ولی نمایش برای کاربر کاملاً فارسی است.
 */
import { useEffect, useRef, useState } from "react";

const FA = "۰۱۲۳۴۵۶۷۸۹";

function toFa(s: string): string {
  return String(s).replace(/\d/g, (d) => FA[Number(d)]);
}
function toEn(s: string): string {
  return String(s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
function digits(s: string): string {
  return toEn(s).replace(/\D/g, "");
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function TimeInput({
  value,
  onChange,
  label,
  showNow = true,
  separator = ":",
  nowOffsetMinutes = 0,
  showHalfHour = false,
  ltr = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  showNow?: boolean;
  /** جداکننده نمایشی ساعت و دقیقه — سبک ایرانی «.» */
  separator?: string;
  /** چند دقیقه جلوتر از الان ثبت شود (آماده‌سازی) */
  nowOffsetMinutes?: number;
  /** دکمه‌های میان‌بر نیم‌ساعت */
  showHalfHour?: boolean;
  /** نمایش چپ‌به‌راست با اعداد لاتین (مثلاً 10:20) */
  ltr?: boolean;
}) {
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const minRef = useRef<HTMLInputElement | null>(null);

  const display = (s: string) => (ltr ? s : toFa(s));
  const placeholder = ltr ? "00" : "۰۰";

  /* همگام‌سازی با مقدار بیرونی (مثلاً پس از ثبت و خالی شدن) */
  useEffect(() => {
    const parts = /^(\d{1,2}):(\d{1,2})$/.exec(toEn(value ?? ""));
    if (parts) {
      setH(parts[1]);
      setM(parts[2]);
    } else if (!value) {
      setH("");
      setM("");
    }
  }, [value]);

  function emit(hh: string, mm: string) {
    /* مقدار نهایی فقط پس از ورود کامل هر چهار رقم ثبت می‌شود؛
       در غیر این صورت مقدار بیرونی نباید رقم اول را بازنویسی کند. */
    if (hh.length !== 2 || mm.length !== 2) return;
    const H = Math.min(23, Number(hh));
    const M = Math.min(59, Number(mm));
    onChange(`${pad(H)}:${pad(M)}`);
  }

  function onHour(raw: string) {
    let d = digits(raw).slice(0, 2);
    if (d && Number(d) > 23) d = "23";
    setH(d);
    if (!d) onChange("");
    emit(d, m);
    /* فقط بعد از زدن رقم دوم ساعت به بخش دقیقه برو */
    if (d.length === 2) minRef.current?.focus();
  }

  function onMin(raw: string) {
    let d = digits(raw).slice(0, 2);
    if (d && Number(d) > 59) d = "59";
    setM(d);
    if (!d) onChange("");
    emit(h, d);
  }

  function step(which: "h" | "m", delta: number) {
    if (which === "h") {
      const next = ((Number(h || "0") + delta) % 24 + 24) % 24;
      setH(pad(next));
      emit(pad(next), m || "00");
      if (!m) setM("00");
    } else {
      const next = ((Number(m || "0") + delta) % 60 + 60) % 60;
      setM(pad(next));
      emit(h || "00", pad(next));
      if (!h) setH("00");
    }
  }

  function now() {
    const d = new Date(Date.now() + nowOffsetMinutes * 60_000);
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    setH(hh);
    setM(mm);
    emit(hh, mm);
  }

  function setMinute(mm: string) {
    setM(mm);
    const hh = h || pad(new Date().getHours());
    if (!h) setH(hh);
    emit(hh, mm);
  }

  const cell =
    "num w-full bg-transparent text-center font-display text-lg text-ink outline-none placeholder:text-inkmute/50 placeholder:font-normal";
  const quick =
    "shrink-0 cursor-pointer rounded-xl border border-line bg-white px-2 py-2 text-[11px] font-extrabold text-branddeep transition-colors hover:border-brand";

  return (
    <div>
      {label && <label className="lbl">{label}</label>}
      <div className="flex items-center gap-1.5" dir="ltr">
        <div className="flex flex-1 items-center rounded-xl border border-line bg-white px-2 py-1.5 focus-within:border-brand">
          {/* ساعت — سمت چپ */}
          <input
            className={cell}
            dir="ltr"
            inputMode="numeric"
            maxLength={2}
            autoComplete="off"
            placeholder={placeholder}
            aria-label="ساعت"
            value={display(h)}
            onChange={(e) => onHour(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); step("h", 1); }
              if (e.key === "ArrowDown") { e.preventDefault(); step("h", -1); }
              if (e.key === ":" || e.key === "." ) { e.preventDefault(); minRef.current?.focus(); }
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className="num select-none px-0.5 font-display text-lg text-inkmute">{separator}</span>
          {/* دقیقه */}
          <input
            ref={minRef}
            className={cell}
            dir="ltr"
            inputMode="numeric"
            maxLength={2}
            autoComplete="off"
            placeholder={placeholder}
            aria-label="دقیقه"
            value={display(m)}
            onChange={(e) => onMin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); step("m", 5); }
              if (e.key === "ArrowDown") { e.preventDefault(); step("m", -5); }
              if (e.key === "Backspace" && !m) minRef.current?.previousElementSibling?.previousElementSibling?.focus?.();
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
        {showHalfHour && (
          <>
            <button type="button" className={quick} onClick={() => setMinute("00")}>
              {ltr ? ":00" : `${separator}۰۰`}
            </button>
            <button type="button" className={quick} onClick={() => setMinute("30")}>
              {ltr ? ":30" : `${separator}۳۰`}
            </button>
          </>
        )}
        {showNow && (
          <button
            type="button"
            onClick={now}
            className="shrink-0 cursor-pointer rounded-xl border border-line bg-white px-2.5 py-2 text-[11px] font-extrabold text-branddeep transition-colors hover:border-brand"
          >
            الان
          </button>
        )}
      </div>
    </div>
  );
}


export { toFa as faTime };

/** نمایش ساعت به سبک ایرانی با نقطه — «۱۲.۳۰» */
export function faTimeDot(v: string): string {
  return toFa(String(v ?? "").replace(":", "."));
}
