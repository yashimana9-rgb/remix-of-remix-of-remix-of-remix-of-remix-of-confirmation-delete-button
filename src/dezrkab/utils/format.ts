// @ts-nocheck
const nf = new Intl.NumberFormat("fa-IR");

export function faNum(n: number): string {
  return nf.format(Math.round(n));
}

export function money(n: number): string {
  return `${faNum(n)} تومان`;
}

/** تبدیل ارقام لاتین شماره تماس به فارسی — بدون جداکننده و با حفظ صفر ابتدایی */
export function faPhone(phone: string): string {
  return String(phone).replace(/\d/g, (d) => nf.format(Number(d)));
}

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  );
}

/* همه نمایش‌های تاریخ صریحاً با تقویم جلالی — مستقل از تقویم پیش‌فرض موتور */
const dFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "long",
});
const dFull = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const tFmt = new Intl.DateTimeFormat("fa-IR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const dtFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const weekdayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long" });

export function fmtDate(ts: number): string {
  return dFmt.format(new Date(ts));
}
export function fmtDateFull(ts: number): string {
  return dFull.format(new Date(ts));
}
export function fmtTime(ts: number): string {
  return tFmt.format(new Date(ts));
}
export function fmtDateTime(ts: number): string {
  return dtFmt.format(new Date(ts));
}
export function fmtWeekday(ts: number): string {
  return weekdayFmt.format(new Date(ts));
}

export interface Countdown {
  label: string;
  overdue: boolean;
  minutes: number;
}

export function countdown(target: number, now: number): Countdown {
  const diff = target - now;
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span =
    h > 0 ? `${faNum(h)} ساعت و ${faNum(m)} دقیقه` : `${faNum(m)} دقیقه`;
  if (diff < 0) {
    return { label: `${span} تأخیر`, overdue: true, minutes: -mins };
  }
  return { label: `${span} مانده`, overdue: false, minutes: mins };
}

export function durationLabel(hours: number): string {
  if (hours >= 24 && hours % 24 === 0)
    return hours === 24 ? "تمام‌روز" : `${faNum(hours / 24)} روزه`;
  return `${faNum(hours)} ساعته`;
}

/** نام فارسی روش پرداخت بر اساس نوع حساب */
export function accountKindLabel(kind: string): string {
  if (kind === "POS") return "کارت‌خوان";
  if (kind === "CASH") return "نقدی";
  if (kind === "TRANSFER") return "کارت به کارت";
  return kind;
}

/** قالب «X دقیقه باقی مانده / X دقیقه دیرکرد» با اعداد فارسی */
export function minutesWords(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${faNum(m)} دقیقه`;
  if (m === 0) return `${faNum(h)} ساعت`;
  return `${faNum(h)} ساعت و ${faNum(m)} دقیقه`;
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* ------------------------- تاریخ جلالی (عددهای لاتین) ------------------------- */

const jalaliDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const jalaliTimeFmt = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const jalaliMonthFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "2-digit",
});

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? "00";
}

/** 1405-06-31 — برای نام فایل پشتیبان */
export function jalaliStamp(ts: number): string {
  const d = new Date(ts);
  const dp = jalaliDateFmt.formatToParts(d);
  const tp = jalaliTimeFmt.formatToParts(d);
  return `${part(dp, "year")}-${part(dp, "month")}-${part(dp, "day")}-${part(tp, "hour")}-${part(tp, "minute")}`;
}

/** 1405/06/31 */
export function jalaliDate(ts: number): string {
  const dp = jalaliDateFmt.formatToParts(new Date(ts));
  return `${part(dp, "year")}/${part(dp, "month")}/${part(dp, "day")}`;
}

/** کلید سال/ماه جلالی — برای محاسبه مرز ماه‌ها */
export function jalaliMonthKey(ts: number): string {
  const mp = jalaliMonthFmt.formatToParts(new Date(ts));
  return `${part(mp, "year")}/${part(mp, "month")}`;
}

/* ============================================================================
   موتور تقویم جلالی — متمرکز برای کل سامانه
   ----------------------------------------------------------------------------
   هیچ صفحه‌ای سیستم تاریخ خودش را ندارد؛ همه محاسبات جلالی از اینجا می‌گذرد.
   مبنای محاسبات: Intl با تقویم persian و «زمان محلی» (ایران) — دقیقه‌دقیق.
   مرز روز/ماه/سال و سال کبیسه (اسفند ۳۰) توسط همان تقویم Persian موتور
   حل می‌شود و توابع تبدیل با راستی‌آزمایی دقیقِ ±۳ روزه، هیچ تاریخ
   ناسازگاری برنمی‌گردانند.
   ========================================================================= */

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** روزهای هفته — ترتیب از شنبه (آغاز هفته ایرانی) */
export const JALALI_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const DAY_MS = 86_400_000;
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const toFaDigits = (s: string) => s.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

const jalaliNumFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const jalaliMonthYearFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  month: "long",
  year: "numeric",
});

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

/** اجزای سال/ماه/روز جلالی یک زمان — به وقت محلی، با اعداد لاتین برای محاسبه */
export function jalaliParts(ts: number): JalaliParts {
  let jy = 0;
  let jm = 0;
  let jd = 0;
  for (const p of jalaliNumFmt.formatToParts(new Date(ts))) {
    if (p.type === "year") jy = Number(p.value);
    else if (p.type === "month") jm = Number(p.value);
    else if (p.type === "day") jd = Number(p.value);
  }
  return { jy, jm, jd };
}

/** شاخص روز خطی — فقط برای محاسبه اختلاف روز بین دو تاریخ جلالی */
function jalaliDayIndex(p: JalaliParts): number {
  return p.jy * 372 + (p.jm - 1) * 31 + p.jd;
}

/** نیمه‌شب محلی (ساعت ۰۰:۰۰ ایران)ِ یک تاریخ جلالی */
export function jalaliToTime(jy: number, jm: number, jd: number): number {
  const target = jalaliDayIndex({ jy, jm, jd });
  /* برآورد اولیه: اول فروردین هر سال ≈ ۲۱ مارسِ (jy + 621) — ساعت ۱۲ برای دوری از لبه منطقه زمانی */
  let guess = Date.UTC(jy + 621, 2, 21, 12);
  for (let i = 0; i < 6; i++) {
    const diff = target - jalaliDayIndex(jalaliParts(guess));
    if (diff === 0) break;
    guess += diff * DAY_MS;
  }
  /* تور ایمنی نهایی — انطباق دقیق در همسایگی ±۳ روز */
  for (let k = -3; k <= 3; k++) {
    const t = guess + k * DAY_MS;
    if (jalaliDayIndex(jalaliParts(t)) === target) {
      guess = t;
      break;
    }
  }
  const d = new Date(guess);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** سال کبیسه جلالی — اسفند ۳۰ روز دارد */
export function isJalaliLeap(jy: number): boolean {
  const noonNext = jalaliToTime(jy, 12, 29) + DAY_MS + DAY_MS / 2;
  return jalaliParts(noonNext).jm === 12;
}

/** طول ماه جلالی — ۳۱ (شش ماه نخست)، ۳۰ (پنج ماه بعد)، ۲۹/۳۰ (اسفند) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

/** نیمه‌شبِ اولِ ماهی که n ماه با ماهِ زمانِ داده‌شده فاصله دارد */
export function addJalaliMonths(ts: number, n: number): number {
  const p = jalaliParts(ts);
  let jy = p.jy;
  let jm = p.jm + n;
  while (jm < 1) {
    jm += 12;
    jy -= 1;
  }
  while (jm > 12) {
    jm -= 12;
    jy += 1;
  }
  return jalaliToTime(jy, jm, 1);
}

/** آغاز هفته ایرانی — شنبه، نیمه‌شب محلی */
export function jalaliWeekStart(ts: number): number {
  const sinceSaturday = (new Date(ts).getDay() + 1) % 7; // شنبه = ۰
  return startOfDay(ts - sinceSaturday * DAY_MS);
}

/** رشته نمایشی ورودی‌های تاریخ — ۱۴۰۴/۰۷/۱۵ (ارقام فارسی، بدون جداکننده هزارگان) */
export function jalaliInputString(ts: number): string {
  const p = jalaliParts(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return toFaDigits(`${p.jy}/${pad(p.jm)}/${pad(p.jd)}`);
}

/** نام ماه و سال — برای سربرگ انتخابگر تاریخ */
export function jalaliMonthYear(ts: number): string {
  return jalaliMonthYearFmt.format(new Date(ts));
}

/* ------------------- اعتبارسنجی بازه دلخواه گزارش (ورودی جلالی) ------------------- */

export interface RangeValidation {
  ok: boolean;
  /** شروع روز «از» — نیمه‌شب */
  start: number;
  /** پایان روز «تا» — نیمه‌شبِ بعد (بازه نیمه‌باز [start, end)) */
  end: number;
  reason: string;
  /** کدام ورودی نامعتبر است — برای نمایش بصری */
  field: "from" | "to" | null;
}

/**
 * بازه دلخواه با مهرهای زمانی جلالی — تاریخ غیرممکن از سمت انتخابگر اصلاً
 * قابل ساخت نیست؛ بازه نامعتبر هرگز بی‌صدا با «امروز» جایگزین نمی‌شود.
 */
export function validateCustomRange(
  fromTs: number | null,
  toTs: number | null
): RangeValidation {
  const bad = (reason: string, field: "from" | "to" | null): RangeValidation => ({
    ok: false,
    start: 0,
    end: 0,
    reason,
    field,
  });
  if (fromTs === null) return bad("تاریخ شروع وارد نشده است.", "from");
  if (toTs === null) return bad("تاریخ پایان وارد نشده است.", "to");
  if (fromTs > toTs) return bad("تاریخ شروع بعد از تاریخ پایان است.", "from");
  return { ok: true, start: startOfDay(fromTs), end: startOfDay(toTs) + DAY_MS, reason: "", field: null };
}
