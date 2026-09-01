// @ts-nocheck
/**
 * گزارش چاپی A4 — متن و جدول واقعی، راست‌چین
 * همان داده‌های reportService که روی صفحه نمایش داده می‌شود
 */
import type { ReactNode } from "react";
import type { DB } from "../domain/models";
import type { Analytics } from "../services/reportService";
import { STATUS_LABEL } from "../services/rentalService";
import { accountKindLabel, faNum, fmtDateTime, jalaliDate, money } from "../utils/format";
import type { ReportType } from "../services/exportService";
import { REPORT_TYPE_LABEL } from "../services/exportService";

function RTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="mt-2 w-full border-collapse text-[10px]">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="border border-neutral-300 bg-neutral-100 px-1.5 py-1 text-start font-bold text-neutral-700">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={i % 2 ? "bg-neutral-50" : ""}>
            {r.map((c, j) => (
              <td key={j} className="num border border-neutral-300 px-1.5 py-1 text-neutral-800">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="border-b-2 border-neutral-800 pb-1 text-[13px] font-extrabold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function RKV({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="keep-together mt-2 grid grid-cols-4 gap-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded border border-neutral-300 px-2 py-1.5">
          <p className="text-[9px] font-bold text-neutral-500">{k}</p>
          <p className="num mt-0.5 text-[11px] font-extrabold text-neutral-900">{v}</p>
        </div>
      ))}
    </div>
  );
}

export default function PrintReport({ type, a, db }: { type: ReportType; a: Analytics; db: DB }) {
  const s = a.summary;
  const rangeLabel = `${jalaliDate(a.start)} تا ${jalaliDate(a.end - 1)}`;

  const incomeBlock = (
    <>
      <RKV
        items={[
          ["درآمد اجاره", money(s.revenue)],
          ["تعداد اجاره", faNum(s.rentalCount)],
          ["میانگین اجاره", s.avgRental !== null ? money(s.avgRental) : "—"],
          ["تکمیل‌شده", faNum(s.completedCount)],
          ["لغوشده", faNum(s.cancelledCount)],
          ["فعال الآن", faNum(s.activeCount)],
          ["تخفیف‌ها", money(s.discounts)],
          ["جریمه تأخیر", money(s.lateFees)],
          ["مانده‌های باز", money(s.outstanding)],
          ["مشتریان فعال", faNum(s.activeCustomers)],
          ["دسته محبوب", s.topCategory ?? "—"],
          ["شلوغ‌ترین ساعت", s.busiestHour !== null ? `${faNum(s.busiestHour)}:۰۰` : "—"],
        ]}
      />
      <RSection title="روند روزانه درآمد">
        <RTable
          head={["روز", "اجاره", "دوچرخه", "درآمد", "تخفیف", "جریمه", "لغو", "تکمیل", "میانگین مدت"]}
          rows={a.daily.map((d) => [
            jalaliDate(d.day),
            faNum(d.rentals),
            faNum(d.bikes),
            money(d.revenue),
            money(d.discounts),
            money(d.lateFees),
            faNum(d.cancellations),
            faNum(d.completed),
            d.avgDuration !== null ? `${faNum(d.avgDuration)} ساعت` : "—",
          ])}
        />
      </RSection>
      <RSection title="روش‌های پرداخت">
        <RTable
          head={["روش", "حساب", "تعداد تراکنش", "مبلغ", "سهم از دریافتی"]}
          rows={a.payments.map((p) => [
            accountKindLabel(p.kind),
            p.name,
            faNum(p.count),
            money(p.amount),
            p.percent !== null ? `${faNum(p.percent)}٪` : "—",
          ])}
        />
      </RSection>
    </>
  );

  const rentalsBlock = (
    <RSection title={`فهرست اجاره‌های بازه (${faNum(a.rentalsInRange.length)})`}>
      <RTable
        head={["شماره", "مشتری", "تاریخ", "دوچرخه‌ها", "مدت", "تخفیف", "جریمه", "جمع", "وضعیت"]}
        rows={a.rentalsInRange.map((r) => [
          `#${faNum(r.number)}`,
          db.customers.find((c) => c.id === r.customerId)?.name ?? "—",
          fmtDateTime(r.createdAt),
          r.items.map((i) => `${i.code}×${faNum(i.qty)}`).join(" + "),
          `${faNum(r.hours)} ساعت`,
          r.discount > 0 ? money(r.discount) : "—",
          r.lateFee > 0 ? money(r.lateFee) : "—",
          money(r.total),
          STATUS_LABEL[r.status],
        ])}
      />
    </RSection>
  );

  const customersBlock = (
    <RSection title={`آمار مشتریان (${faNum(a.customers.length)})`}>
      <RTable
        head={["مشتری", "تلفن", "اولین اجاره", "آخرین اجاره", "تکمیل‌شده", "ساعت", "دوچرخه", "پرداخت", "لغو", "تأخیر", "جریمه", "تخفیف", "پاداش"]}
        rows={a.customers.map((c) => [
          c.name,
          c.phone,
          jalaliDate(c.firstRentalAt),
          jalaliDate(c.lastRentalAt),
          faNum(c.completedRentals),
          faNum(c.totalHours),
          faNum(c.totalUnits),
          money(c.spending),
          faNum(c.cancelled),
          faNum(c.lateCount),
          c.lateFees > 0 ? money(c.lateFees) : "—",
          c.discounts > 0 ? money(c.discounts) : "—",
          c.rewardEligible ? "واجد" : `${faNum(c.rewardHours)}/${faNum(db.settings.rewardThresholdHours)}`,
        ])}
      />
    </RSection>
  );

  const bikesBlock = (
    <RSection title="عملکرد دسته‌های دوچرخه">
      <RTable
        head={["کد", "دسته", "موجودی", "اجاره‌شده", "ساعت اجاره", "درآمد", "میانگین مدت", "میانگین تعداد", "تعمیرات", "بهره‌وری"]}
        rows={a.categories.map((c) => [
          c.code,
          c.name,
          faNum(c.inventory),
          faNum(c.unitsRented),
          faNum(c.rentalHours),
          money(c.revenue),
          c.avgDuration !== null ? `${faNum(c.avgDuration)} س` : "—",
          c.avgQty !== null ? faNum(c.avgQty) : "—",
          faNum(c.maintenanceCount),
          c.utilization !== null ? `${faNum(c.utilization)}٪` : "داده ناکافی",
        ])}
      />
    </RSection>
  );

  return (
    <div className="print-root">
      <div className="report-page p-6">
        {/* سربرگ */}
        <header className="keep-together flex items-end justify-between border-b-4 border-neutral-900 pb-3">
          <div>
            <p className="font-display text-2xl text-neutral-900">{db.settings.storeName}</p>
            <p className="mt-0.5 text-[11px] font-bold text-neutral-500">{REPORT_TYPE_LABEL[type]}</p>
          </div>
          <div className="text-end text-[10px] text-neutral-600">
            <p className="font-bold text-neutral-900">
              بازه: <bdi className="num">{rangeLabel}</bdi>
            </p>
            <p>
              تهیه‌شده در <bdi className="num">{fmtDateTime(Date.now())}</bdi>
            </p>
            <p className="num">واحد پول: {db.settings.currency}</p>
          </div>
        </header>

        {type === "income" && incomeBlock}
        {type === "rentals" && (
          <>
            <RKV
              items={[
                ["تعداد اجاره", faNum(s.rentalCount)],
                ["تکمیل‌شده", faNum(s.completedCount)],
                ["لغوشده", faNum(s.cancelledCount)],
                ["فعال الآن", faNum(s.activeCount)],
              ]}
            />
            {rentalsBlock}
          </>
        )}
        {type === "customers" && (
          <>
            <RKV
              items={[
                ["مشتریان فعال بازه", faNum(s.activeCustomers)],
                ["نرخ مشتری تکراری", s.repeatRate !== null ? `${faNum(s.repeatRate)}٪` : "—"],
                ["مشتری جدید", faNum(a.retention.newCustomers)],
                ["مشتری بازگشتی", faNum(a.retention.returningCustomers)],
              ]}
            />
            {customersBlock}
          </>
        )}
        {type === "bikes" && bikesBlock}

        {type === "full" && (
          <>
            <RSection title="خلاصه مدیریتی">
              <RKV
                items={[
                  ["درآمد", money(s.revenue)],
                  ["تعداد اجاره", faNum(s.rentalCount)],
                  ["میانگین اجاره", s.avgRental !== null ? money(s.avgRental) : "—"],
                  ["مشتریان فعال", faNum(s.activeCustomers)],
                  ["نرخ تکرار", s.repeatRate !== null ? `${faNum(s.repeatRate)}٪` : "—"],
                  ["دسته محبوب", s.topCategory ?? "—"],
                  ["ساعت اوج", s.peakWindow ?? "—"],
                  ["روز اوج", s.busiestWeekday ?? "—"],
                  ["تخفیف‌ها", money(s.discounts)],
                  ["جریمه‌ها", money(s.lateFees)],
                  ["مانده‌های باز", money(s.outstanding)],
                  ["هزینه تعمیرات", money(a.maintenance.totalCost)],
                ]}
              />
            </RSection>
            {incomeBlock}
            <div className="report-break" />
            <RSection title="تقاضای ساعتی">
              <RTable
                head={["بازه ساعت", "اجاره", "دوچرخه", "درآمد", "میانگین تعداد", "لغو"]}
                rows={a.hourly.map((h) => [
                  `${faNum(h.hour)}:۰۰ تا ${faNum((h.hour + 1) % 24)}:۰۰`,
                  faNum(h.rentals),
                  faNum(h.bikes),
                  money(h.revenue),
                  h.avgQty !== null ? faNum(h.avgQty) : "—",
                  faNum(h.cancellations),
                ])}
              />
            </RSection>
            <RSection title="تقاضای روزهای هفته">
              <RTable
                head={["روز", "اجاره", "دوچرخه", "درآمد", "میانگین اجاره", "نرخ تأخیر"]}
                rows={a.weekdays.map((w) => [
                  w.name,
                  faNum(w.rentals),
                  faNum(w.bikes),
                  money(w.revenue),
                  w.avgValue !== null ? money(w.avgValue) : "—",
                  w.lateRate !== null ? `${faNum(w.lateRate)}٪` : "—",
                ])}
              />
            </RSection>
            <RSection title="توزیع مدت اجاره">
              <RTable
                head={["مدت", "اجاره", "درصد", "دوچرخه", "درآمد"]}
                rows={a.durations.map((d) => [
                  d.label,
                  faNum(d.rentals),
                  d.percent !== null ? `${faNum(d.percent)}٪` : "—",
                  faNum(d.bikes),
                  money(d.revenue),
                ])}
              />
            </RSection>
            {bikesBlock}
            <div className="report-break" />
            {rentalsBlock}
            {customersBlock}
            <RSection title="تخفیف‌ها">
              <RTable
                head={["نرخ تخفیف", "تعداد اجاره", "مبلغ"]}
                rows={a.discounts.distribution.map((d) => [`${faNum(d.rate)}٪`, faNum(d.count), money(d.amount)])}
              />
              <p className="num mt-1 text-[10px] text-neutral-600">
                جمع تخفیف: {money(a.discounts.totalDiscount)} — پاداش مصرف‌شده: {faNum(a.discounts.rewardUsed)} مورد — درآمد قبل از تخفیف: {money(a.discounts.beforeRevenue)} — بعد از تخفیف: {money(a.discounts.afterRevenue)}
              </p>
            </RSection>
            <RSection title="تأخیر در برگشت">
              <p className="num mt-2 text-[10px] leading-5 text-neutral-700">
                اجاره‌های دارای تأخیر: {faNum(a.late.lateRentals)} — دیرکرد واقعی: {faNum(a.late.actualMinutes)} دقیقه — بخشوده: {faNum(a.late.waivedMinutes)} دقیقه — قابل محاسبه: {faNum(a.late.chargeableMinutes)} دقیقه — جریمه: {money(a.late.fees)} — میانگین تأخیر: {a.late.avgDelay !== null ? `${faNum(a.late.avgDelay)} دقیقه` : "—"} — نرخ تأخیر: {a.late.latePercent !== null ? `${faNum(a.late.latePercent)}٪` : "—"}
              </p>
            </RSection>
            <RSection title="تعمیرات">
              <p className="num mt-2 text-[10px] leading-5 text-neutral-700">
                تعداد: {faNum(a.maintenance.count)} — باز: {faNum(a.maintenance.openCount)} — مجموع زمان: {faNum(a.maintenance.totalHours)} ساعت — میانگین: {a.maintenance.avgHours !== null ? `${faNum(a.maintenance.avgHours)} ساعت` : "—"} — هزینه: {money(a.maintenance.totalCost)}
              </p>
            </RSection>
            <RSection title="نگهداشت مشتری">
              <p className="num mt-2 text-[10px] leading-5 text-neutral-700">
                مشتری جدید: {faNum(a.retention.newCustomers)} — بازگشتی: {faNum(a.retention.returningCustomers)} — نرخ تکرار: {a.retention.repeatRate !== null ? `${faNum(a.retention.repeatRate)}٪` : "—"} — میانگین فاصله اجاره‌ها: {a.retention.avgGapDays !== null ? `${faNum(a.retention.avgGapDays)} روز` : "—"}
              </p>
            </RSection>
          </>
        )}

        {/* پانوشت کیفیت داده */}
        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[8.5px] leading-4 text-neutral-500">
          <p>
            کیفیت داده — رکوردها: {faNum(a.quality.record_count.rentals)} اجاره، {faNum(a.quality.record_count.customers)} مشتری، {faNum(a.quality.record_count.payments)} پرداخت | روزهای پوشش: {faNum(a.quality.period_covered.days)}
            {a.quality.missing_fields.length > 0 && <> | فیلدهای ناقص: {a.quality.missing_fields.join("، ")}</>}
          </p>
          <p className="mt-0.5">این گزارش به‌صورت خودکار از سامانه «دز رکاب» تولید شده است</p>
        </footer>
      </div>
    </div>
  );
}
