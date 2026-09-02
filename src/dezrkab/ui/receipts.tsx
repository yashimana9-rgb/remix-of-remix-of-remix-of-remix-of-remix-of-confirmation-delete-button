// @ts-nocheck
/**
 * رسیدهای حرارتی ۸۰ میلی‌متری — مشترک بین صفحه‌ها
 * فاکتور نهایی برگشت اجاره + فاکتور اشتراک، با همان چیدمان رسید اجاره حضوری.
 */
import type { Payment, Rental, Subscription } from "../domain/models";
import { KIND_LABEL, paymentService } from "../services/paymentService";
import { useDB } from "../storage/storage";
import { accountKindLabel, faNum, faPhone, fmtDateFull, fmtDateTime, fmtTime, money } from "../utils/format";

/**
 * چاپ روی رول حرارتی ۸ سانتی — بدون کاغذ اضافه.
 * ارتفاع واقعی رسید در چیدمان چاپی اندازه‌گیری می‌شود و اندازهٔ برگه
 * دقیقاً همان‌قدر تنظیم می‌شود؛ نه فضای خالی می‌ماند نه برگهٔ دوم.
 */
export function printThermalReceipt() {
  const receipt = document.querySelector<HTMLElement>(".print-receipt");
  let pageHeightMm = 0;
  if (receipt) {
    const prev = receipt.style.cssText;
    receipt.style.width = "80mm";
    receipt.style.maxWidth = "80mm";
    receipt.style.margin = "0";
    receipt.style.padding = "0 2mm";
    pageHeightMm = Math.ceil((receipt.getBoundingClientRect().height * 25.4) / 96) + 1;
    receipt.style.cssText = prev;
  }
  const style = document.createElement("style");
  style.id = "pedal-receipt-page";
  style.textContent =
    pageHeightMm > 0
      ? `@page{size:80mm ${pageHeightMm}mm;margin:0}`
      : "@page{size:80mm 200mm;margin:0}";
  document.head.appendChild(style);
  try {
    window.print();
  } finally {
    style.remove();
  }
}

/* ------------------------------ اجزای مشترک ------------------------------ */

function ReceiptShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const db = useDB();
  const S = db.settings;
  return (
    <div
      dir="rtl"
      className="print-root print-receipt mx-auto w-[72mm] bg-white px-[4mm] pb-[3mm] pt-[2.5mm] text-[#161616] shadow-[0_10px_40px_rgba(20,20,15,0.25)] print:shadow-none"
    >
      {/* ── سربرگ ── */}
      <header className="text-center">
        <p className="text-[9px] font-extrabold tracking-[0.28em] text-[#3d3d3a]">
          {S.receiptTitleSub}
        </p>
        <h1 className="font-display text-[27px] leading-9 text-[#111]">{S.receiptTitleMain}</h1>
        <div className="mx-auto mt-1 h-[3px] w-12 border-y border-[#111]" />
        <p className="num mt-1.5 text-[9.5px] font-bold text-[#3d3d3a]">
          {fmtDateFull(Date.now())} <span className="mx-1 text-[#9a9a94]">•</span> {subtitle}
        </p>
        <p className="mt-0.5 text-[11px] font-black text-[#111]">{title}</p>
      </header>
      {children}
      {/* ── تشکر و تماس ── */}
      <footer className="mt-2 border-t border-dashed border-[#8f8f8a] pt-2 text-center">
        <p className="text-[11px] font-extrabold text-[#111]">{S.receiptThanks}</p>
        <p className="mt-1.5 text-[9px] font-bold text-[#5c5c58]">برای اطلاعات بیشتر با ما تماس بگیرید</p>
        <p className="num text-[15px] font-black tracking-wide text-[#111]" dir="ltr">
          {faPhone(S.receiptPhone)}
        </p>
      </footer>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="num flex items-center justify-between text-[11px] font-bold text-[#3d3d3a]">
      <span>{k}</span>
      <span className={strong ? "font-black text-[#111]" : "text-[#111]"}>{v}</span>
    </div>
  );
}

/* ------------------------- فاکتور نهایی برگشت ------------------------- */

export function ReturnReceipt({ rental }: { rental: Rental }) {
  const db = useDB();
  const cust = db.customers.find((c) => c.id === rental.customerId);
  const paid = paymentService.paidFor(db, rental.id);
  const remaining = Math.max(0, rental.total - paid);
  const pays = db.payments
    .filter((p) => p.rentalId === rental.id && p.kind === "RENT")
    .sort((a, b) => a.createdAt - b.createdAt);

  return (
    <ReceiptShell title="فاکتور نهایی اجاره" subtitle={`اجاره #${faNum(rental.number)}`}>
      {/* ── مشتری ── */}
      <div className="mt-2.5">
        <p className="text-[9.5px] font-extrabold text-[#5c5c58]">نام مشتری</p>
        <p className="font-display text-[19px] leading-7 text-[#111]">{cust?.name ?? "—"}</p>
        {cust?.phone && (
          <p className="num text-[10px] font-bold text-[#5c5c58]" dir="ltr">{cust.phone}</p>
        )}
      </div>

      {/* ── ساعت رفت / برگشت واقعی ── */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border-[1.6px] border-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-[#5c5c58]">ساعت رفت</p>
          <p className="num font-display text-[23px] leading-8 text-[#111]">{fmtTime(rental.startAt)}</p>
        </div>
        <div className="rounded-md border-[1.6px] border-[#111] bg-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-white/70">ساعت برگشت</p>
          <p className="num font-display text-[23px] leading-8 text-white">
            {fmtTime(rental.actualEndAt ?? rental.plannedEndAt)}
          </p>
        </div>
      </div>

      {/* ── دوچرخه‌ها ── */}
      <div className="mt-2.5">
        <p className="border-b border-dashed border-[#8f8f8a] pb-0.5 text-[9.5px] font-extrabold text-[#5c5c58]">
          دوچرخه‌ها
        </p>
        <ul className="mt-1 space-y-1">
          {rental.items.map((it) => (
            <li key={it.categoryId} className="flex items-center gap-2">
              <span className="num font-display text-[20px] leading-6 text-[#111]">{faNum(it.qty)}</span>
              <span className="text-[13px] font-black text-[#3d3d3a]">×</span>
              <bdi
                dir="ltr"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border-[1.6px] border-[#111] font-display text-[17px] leading-none text-[#111]"
              >
                {it.code}
              </bdi>
              <span className="text-[11.5px] font-bold text-[#3d3d3a]">{it.name}</span>
              <span className="num ms-auto text-[10px] font-bold text-[#5c5c58]">
                {money(it.hourlyRate * it.qty * rental.hours)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── مبلغ‌ها ── */}
      <div className="mt-2.5 space-y-0.5 border-t border-dashed border-[#8f8f8a] pt-1.5">
        <Row k="مبلغ اصلی" v={money(rental.subtotal)} />
        {rental.discount > 0 && (
          <Row k={`تخفیف ${faNum(rental.discountRate)}٪`} v={`− ${money(rental.discount)}`} />
        )}
        {rental.lateFee > 0 && <Row k="جریمه تأخیر" v={`+ ${money(rental.lateFee)}`} />}
        <div className="mt-1.5 flex items-center justify-between rounded-md bg-[#111] px-2.5 py-1.5">
          <span className="text-[10.5px] font-extrabold text-white/75">مبلغ نهایی</span>
          <span className="num font-display text-[21px] leading-7 text-white">
            {faNum(rental.total)} <span className="text-[11px]">تومان</span>
          </span>
        </div>
      </div>

      {/* ── تسویه ── */}
      <div className="num mt-1.5 space-y-0.5 text-[11px] font-bold text-[#3d3d3a]">
        <Row k="پرداخت شده" v={money(paid)} />
        <Row k="مانده" v={money(remaining)} strong />
        {pays.map((p) => {
          const acc = db.settings.accounts.find((a) => a.id === p.accountId);
          return (
            <p key={p.id} className="pt-0.5 text-[9.5px] font-bold text-[#5c5c58]">
              دریافت {money(p.amount)} — {acc ? acc.name : accountKindLabel(acc?.kind ?? "POS")}
            </p>
          );
        })}
      </div>
    </ReceiptShell>
  );
}

/* ---------------------------- فاکتور اشتراک ---------------------------- */

export function SubscriptionReceipt({ sub }: { sub: Subscription }) {
  const db = useDB();
  const acc = db.settings.accounts.find((a) => a.id === sub.accountId);

  return (
    <ReceiptShell title="فاکتور اشتراک" subtitle={sub.planTitle}>
      {/* ── مشتری ── */}
      <div className="mt-2.5">
        <p className="text-[9.5px] font-extrabold text-[#5c5c58]">نام مشترک</p>
        <p className="font-display text-[19px] leading-7 text-[#111]">{sub.name}</p>
        <p className="num text-[10px] font-bold text-[#5c5c58]" dir="ltr">{sub.phone}</p>
      </div>

      {/* ── مشخصات اشتراک ── */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border-[1.6px] border-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-[#5c5c58]">ساعت اشتراک</p>
          <p className="num font-display text-[23px] leading-8 text-[#111]">{faNum(sub.totalHours)}</p>
        </div>
        <div className="rounded-md border-[1.6px] border-[#111] bg-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-white/70">اعتبار تا</p>
          <p className="num mt-1 text-[13px] font-black leading-7 text-white">
            {sub.expiresAt ? fmtDateFull(sub.expiresAt) : "بدون انقضا"}
          </p>
        </div>
      </div>

      {/* ── دوچرخه‌ها ── */}
      {sub.items?.length > 0 && (
        <div className="mt-2.5">
          <p className="border-b border-dashed border-[#8f8f8a] pb-0.5 text-[9.5px] font-extrabold text-[#5c5c58]">
            دوچرخه‌های اشتراک
          </p>
          <ul className="mt-1 space-y-1">
            {sub.items.map((it) => (
              <li key={it.categoryId} className="flex items-center gap-2">
                <span className="num font-display text-[20px] leading-6 text-[#111]">{faNum(it.qty)}</span>
                <span className="text-[13px] font-black text-[#3d3d3a]">×</span>
                <bdi
                  dir="ltr"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border-[1.6px] border-[#111] font-display text-[17px] leading-none text-[#111]"
                >
                  {it.code}
                </bdi>
                <span className="text-[11.5px] font-bold text-[#3d3d3a]">{it.name}</span>
                <span className="num ms-auto text-[10px] font-bold text-[#5c5c58]">
                  {money(it.hourlyRate)} / ساعت
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── مبلغ‌ها ── */}
      <div className="mt-2.5 space-y-0.5 border-t border-dashed border-[#8f8f8a] pt-1.5">
        <Row k={`جمع کل (${faNum(sub.totalHours)} ساعت)`} v={money(sub.subtotal)} />
        {sub.discount > 0 && (
          <Row k={`تخفیف ${faNum(sub.discountPercent)}٪`} v={`− ${money(sub.discount)}`} />
        )}
        <div className="mt-1.5 flex items-center justify-between rounded-md bg-[#111] px-2.5 py-1.5">
          <span className="text-[10.5px] font-extrabold text-white/75">دریافت شد</span>
          <span className="num font-display text-[21px] leading-7 text-white">
            {faNum(sub.total)} <span className="text-[11px]">تومان</span>
          </span>
        </div>
        <p className="pt-1 text-[9.5px] font-bold text-[#5c5c58]">
          پرداخت: {acc ? `${acc.name} — ${accountKindLabel(acc.kind)}` : "—"}
        </p>
      </div>
    </ReceiptShell>
  );
}

/* ---------------------------- رسید هر پرداخت ---------------------------- */

export function PaymentReceipt({ payment }: { payment: Payment }) {
  const db = useDB();
  const rental = payment.rentalId ? db.rentals.find((r) => r.id === payment.rentalId) : null;
  const sub = payment.subscriptionId ? db.subscriptions.find((s) => s.id === payment.subscriptionId) : null;
  const cust = rental
    ? db.customers.find((c) => c.id === rental.customerId)
    : sub
      ? { name: sub.name, phone: sub.phone }
      : null;
  const acc = db.settings.accounts.find((a) => a.id === payment.accountId);
  const op = db.users.find((u) => u.id === payment.operatorId);

  const subtitle = rental
    ? `اجاره #${faNum(rental.number)}`
    : sub
      ? sub.planTitle
      : "—";

  return (
    <ReceiptShell title="رسید پرداخت" subtitle={subtitle}>
      {/* ── مشتری ── */}
      <div className="mt-2.5">
        <p className="text-[9.5px] font-extrabold text-[#5c5c58]">
          {sub ? "نام مشترک" : "نام مشتری"}
        </p>
        <p className="font-display text-[19px] leading-7 text-[#111]">{cust?.name ?? "—"}</p>
        {cust?.phone && (
          <p className="num text-[10px] font-bold text-[#5c5c58]" dir="ltr">{cust.phone}</p>
        )}
      </div>

      {/* ── جزئیات پرداخت ── */}
      <div className="mt-2.5 space-y-0.5 border-t border-dashed border-[#8f8f8a] pt-1.5">
        <Row k="نوع پرداخت" v={KIND_LABEL[payment.kind]} />
        <Row k="تاریخ / ساعت" v={fmtDateTime(payment.createdAt)} />
        <Row k="اپراتور" v={op?.name ?? "سامانه"} />
        <Row k="حساب" v={acc ? `${acc.name} — ${accountKindLabel(acc.kind)}` : "—"} />
        {payment.note && <Row k="توضیحات" v={payment.note} />}
      </div>

      {/* ── مبلغ ── */}
      <div className="mt-2.5 flex items-center justify-between rounded-md bg-[#111] px-2.5 py-1.5">
        <span className="text-[10.5px] font-extrabold text-white/75">مبلغ پرداخت</span>
        <span className="num font-display text-[21px] leading-7 text-white">
          {faNum(Math.abs(payment.amount))} <span className="text-[11px]">تومان</span>
        </span>
      </div>
    </ReceiptShell>
  );
}
