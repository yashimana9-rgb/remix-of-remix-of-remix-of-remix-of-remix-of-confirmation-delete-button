// @ts-nocheck
/**
 * ورودی‌های مبلغ — همه‌جا با جداکننده هزارگان (هر ۳ رقم یک ممیز)
 * و پرداخت ترکیبی (چند روش پرداخت در یک تراکنش).
 */
import { useMemo } from "react";
import { accountKindLabel, faNum, money } from "../utils/format";
import { Btn } from "./kit";
import { IconPlus, IconX } from "./icons";

const FA_AR_DIGITS = /[۰-۹٠-٩]/g;

function normalizeDigits(s: string): string {
  return String(s).replace(FA_AR_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    if (code >= 0x06f0) return String(code - 0x06f0);
    return String(code - 0x0660);
  });
}

/** رشته خام (فقط رقم و منهای اختیاری) از هر ورودی کاربر */
export function rawMoney(input: string, allowNegative = false): string {
  const s = normalizeDigits(input);
  const neg = allowNegative && s.trim().startsWith("-");
  const digits = s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return neg ? "-" : "";
  return (neg ? "-" : "") + digits;
}

/** ۱۲۳۴۵۶۷ → 1,234,567 */
export function groupMoney(raw: string): string {
  if (!raw) return "";
  const neg = raw.startsWith("-");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return neg ? "-" : "";
  return (neg ? "-" : "") + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function moneyValue(raw: string): number {
  const n = parseInt(rawMoney(raw, true) || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

/** ورودی مبلغ با ممیز خودکار هر ۳ رقم — اندازه بزرگ و پسوند «تومان» اختیاری */
export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  className = "",
  inputRef,
  size = "md",
  suffix,
  style,
  ...rest
}: {
  value: string;
  onChange: (raw: string) => void;
  allowNegative?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** md = ورودی معمولی؛ lg = مبلغ برجسته و خوانا برای ورودی پرداخت */
  size?: "md" | "lg";
  /** پسوند ثابت داخل فیلد (مثل «تومان») — دربرگیرنده نسبی می‌سازد */
  suffix?: string;
  style?: React.CSSProperties;
  [k: string]: unknown;
}) {
  const lg = size === "lg";
  const inputStyle: React.CSSProperties = {
    textAlign: "left",
    // استایل‌های برجسته‌سازی به‌صورت inline تا از زیر `.inp` (قانون لایه‌نشده) عبور کنند
    ...(lg
      ? { fontSize: "1.0625rem", fontWeight: 700, letterSpacing: "0.01em", paddingBlock: "0.7rem" }
      : {}),
    ...(suffix ? { paddingInlineEnd: "3.6rem" } : {}),
    ...style,
  };
  const input = (
    <input
      ref={inputRef}
      className={`inp num ${className}`}
      dir="ltr"
      style={inputStyle}
      type="text"
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      value={groupMoney(value ?? "")}
      onChange={(e) => onChange(rawMoney(e.target.value, allowNegative))}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative w-full" dir="ltr">
      {input}
      <span className="pointer-events-none absolute inset-y-0 end-3.5 grid place-items-center text-[11px] font-bold text-inkmute">
        {suffix}
      </span>
    </div>
  );
}

/* ----------------------------- پرداخت ترکیبی ----------------------------- */

export interface SplitLine {
  id: string;
  accountId: string;
  amount: string;
}

let splitSeq = 1;
function nextId(): string {
  return `sp-${splitSeq++}-${Math.random().toString(36).slice(2, 6)}`;
}

/** ساخت خط پرداخت پیش‌فرض — کل مبلغ روی حساب پیش‌فرض (کارت‌خوان) */
export function makeSplit(accountId: string, amount: number | string): SplitLine[] {
  const raw = typeof amount === "number" ? String(Math.max(0, Math.round(amount))) : rawMoney(amount);
  return [{ id: nextId(), accountId, amount: raw === "0" ? "" : raw }];
}

export function splitTotal(lines: SplitLine[]): number {
  return lines.reduce((s, l) => s + moneyValue(l.amount), 0);
}

/** خط‌های معتبر برای ثبت */
export function splitPayments(lines: SplitLine[]): Array<{ amount: number; accountId: string }> {
  return lines
    .filter((l) => moneyValue(l.amount) > 0 && l.accountId)
    .map((l) => ({ amount: moneyValue(l.amount), accountId: l.accountId }));
}

export function PaymentSplit({
  lines,
  onChange,
  accounts,
  label = "دریافت (تومان)",
  hint,
}: {
  lines: SplitLine[];
  onChange: (lines: SplitLine[]) => void;
  accounts: Array<{ id: string; name: string; kind: string; active: boolean }>;
  label?: string;
  hint?: string;
}) {
  const active = useMemo(() => accounts.filter((a) => a.active), [accounts]);
  const sum = splitTotal(lines);

  function update(id: string, patch: Partial<SplitLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.accountId));
    const next = active.find((a) => !used.has(a.id)) ?? active[0];
    onChange([...lines, { id: nextId(), accountId: next?.id ?? "", amount: "" }]);
  }

  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="space-y-2">
        {lines.map((l) => (
          /*
            چیدمان گرید.mobile: full width of column 1, then a flex row for method+delete.
          */
          <div
            key={l.id}
            className="grid items-center gap-2 sm:grid-cols-[1fr_minmax(150px,180px)_auto] sm:grid-rows-1"
          >
            {/* مبلغ — ستون پهن و خوانا با ممیز هر ۳ رقم + پسوند تومان */}
            <MoneyInput
              size="lg"
              suffix="تومان"
              value={l.amount}
              onChange={(v) => update(l.id, { amount: v })}
              placeholder="0"
            />
            {/* روش پرداخت + حذف — موبایل: یک ردیف؛ دسکتاپ: دو ستون گرید */}
            <div className="flex items-center gap-2 sm:contents">
              <select
                className="inp w-full sm:w-auto"
                value={l.accountId}
                onChange={(e) => update(l.id, { accountId: e.target.value })}
              >
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountKindLabel(a.kind)} — {a.name}
                  </option>
                ))}
              </select>
              {lines.length > 1 ? (
                <button
                  type="button"
                  aria-label="حذف روش پرداخت"
                  onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-linedeep text-inksoft transition-colors hover:border-danger hover:text-danger"
                >
                  <IconX size={15} />
                </button>
              ) : (
                <span className="hidden sm:block sm:size-9" aria-hidden />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Btn type="button" variant="outline" size="sm" onClick={addLine} disabled={active.length === 0}>
          <IconPlus size={13} />
          افزودن روش پرداخت
        </Btn>
        <span className="num rounded-lg bg-black/[0.03] px-2.5 py-1 text-xs font-extrabold text-ink">
          جمع دریافتی: {money(sum)}
        </span>
      </div>
      {hint ? <p className="mt-1.5 text-[11px] font-bold text-inkmute">{hint}</p> : null}
    </div>
  );
}

export { faNum };
