// @ts-nocheck
/**
 * نشان «اشتراک ویژه» — در همه بخش‌هایی که مشتری نمایش داده می‌شود استفاده می‌شود.
 * ساعت مانده و تاریخ پایان اشتراک را نشان می‌دهد.
 */
import { subscriptionService } from "../services/subscriptionService";
import { useDB } from "../storage/storage";
import { faNum, fmtDateFull } from "../utils/format";
import { IconClock, IconGift } from "./icons";

/** خلاصه اشتراک فعال یک مشتری — null یعنی اشتراک قابل استفاده ندارد */
export function useSubscriptionSummary(customerId?: string | null) {
  const db = useDB();
  return subscriptionService.summaryFor(db, customerId ?? null);
}

/** نشان کوچک — برای جدول‌ها و فهرست‌ها */
export function SubChip({ customerId }: { customerId?: string | null }) {
  const s = useSubscriptionSummary(customerId);
  if (!s) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brandsoft px-2 py-0.5 text-[10px] font-extrabold text-branddeep"
      title={`${s.planTitle} — مانده ${faNum(s.remainingHours)} ساعت${
        s.expiresAt ? ` — پایان ${fmtDateFull(s.expiresAt)}` : ""
      }`}
    >
      <IconGift size={11} />
      اشتراک ویژه
      <span className="num">{faNum(s.allRemainingHours)} ساعت</span>
    </span>
  );
}

/** کارت کامل — برای صفحه جزئیات مشتری و مراحل اجاره */
export function SubBanner({ customerId }: { customerId?: string | null }) {
  const s = useSubscriptionSummary(customerId);
  if (!s) return null;
  return (
    <div className="rounded-xl border border-branddeep/35 bg-brandsoft/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-sm text-branddeep">
          <IconGift size={16} />
          مشتری اشتراک ویژه دارد — {s.planTitle}
          {s.count > 1 && <span className="num text-[11px]">({faNum(s.count)} اشتراک فعال)</span>}
        </p>
        <span className="num rounded-full bg-white px-2.5 py-0.5 text-[11px] font-extrabold text-branddeep">
          مانده {faNum(s.allRemainingHours)} ساعت
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-inksoft">
        <span className="num">
          مصرف‌شده {faNum(s.usedHours)} از {faNum(s.totalHours)} ساعت
        </span>
        {s.expiresAt && (
          <span className="flex items-center gap-1">
            <IconClock size={12} className="text-inkmute" />
            تاریخ پایان: <span className="num text-ink">{fmtDateFull(s.expiresAt)}</span>
            {s.daysLeft !== null && (
              <span className={`num ${s.daysLeft <= 7 ? "text-warn" : "text-inkmute"}`}>
                ({faNum(Math.max(0, s.daysLeft))} روز مانده)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
