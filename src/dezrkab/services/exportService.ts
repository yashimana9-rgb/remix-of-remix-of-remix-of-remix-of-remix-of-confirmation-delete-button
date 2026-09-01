// @ts-nocheck
/**
 * خروجی‌های گزارش — دو قالب با دو هدف مجزا:
 *  1) PDF (قابل چاپ) — برای انسان
 *  2) JSON برای هوش مصنوعی — برای تحلیل ماشین
 * هر دو از همان reportService می‌خوانند تا اعداد یکسان بمانند.
 */
import type { DB } from "../domain/models";
import { jalaliDate, money } from "../utils/format";
import { accountKindLabel } from "../utils/format";
import type { Analytics } from "./reportService";
import { reportService } from "./reportService";

/**
 * ساخت Blob با اعتبارسنجی — تحویل فایل بر عهدهٔ DownloadCenter است.
 * هیچ ادعای «دانلود شد» از این لایه صادر نمی‌شود.
 */
function makeJSONBlob(obj: unknown): Blob {
  const text = JSON.stringify(obj, null, 2);
  JSON.parse(text); // بازاعتبارسنجی — JSON تولیدی باید حتماً سالم باشد
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  if (blob.size === 0) throw new Error("ساخت فایل انجام نشد — خروجی خالی است");
  return blob;
}

/** طرح‌واره پایدار برای تحلیل هوش مصنوعی — سریال‌سازی UI state نیست */
export function buildAIExport(db: DB, start: number, end: number) {
  const a = reportService.buildAnalytics(db, start, end);
  const p = (x: number | null) => x;

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    period: {
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
    },
    store: {
      name: db.settings.storeName,
      currency: db.settings.currency,
      grace_minutes: db.settings.graceMinutes,
      late_multiplier: db.settings.lateMultiplier,
      reward_threshold_hours: db.settings.rewardThresholdHours,
      reward_discount_percent: db.settings.rewardDiscountPercent,
    },
    summary: {
      revenue: a.summary.revenue,
      received: a.summary.received,
      outstanding: a.summary.outstanding,
      rental_count: a.summary.rentalCount,
      completed: a.summary.completedCount,
      cancelled: a.summary.cancelledCount,
      active_now: a.summary.activeCount,
      avg_rental_value: p(a.summary.avgRental),
      discounts: a.summary.discounts,
      late_fees: a.summary.lateFees,
      active_customers: a.summary.activeCustomers,
      repeat_customer_rate: p(a.summary.repeatRate),
      top_category: a.summary.topCategory,
      busiest_hour: a.summary.busiestHour,
      peak_window: a.summary.peakWindow,
      busiest_weekday: a.summary.busiestWeekday,
    },
    customers: a.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      first_rental_at: new Date(c.firstRentalAt).toISOString(),
      last_rental_at: new Date(c.lastRentalAt).toISOString(),
      completed_rentals: c.completedRentals,
      total_rental_hours: c.totalHours,
      total_bicycle_units: c.totalUnits,
      total_spending: c.spending,
      avg_rental_value: p(c.avgValue),
      cancelled_rentals: c.cancelled,
      late_returns: c.lateCount,
      late_minutes: c.lateMinutes,
      late_fees: c.lateFees,
      discounts: c.discounts,
      reward_discount_uses: c.rewardUses,
      current_reward_hours: c.rewardHours,
      reward_eligible: c.rewardEligible,
    })),
    rentals: a.rentalsInRange.map((r) => {
      const c = db.customers.find((x) => x.id === r.customerId);
      return {
        number: r.number,
        customer: c?.name ?? null,
        created_at: new Date(r.createdAt).toISOString(),
        start_at: new Date(r.startAt).toISOString(),
        planned_end_at: new Date(r.plannedEndAt).toISOString(),
        actual_end_at: r.actualEndAt ? new Date(r.actualEndAt).toISOString() : null,
        duration_hours: r.hours,
        bicycles: r.items.map((i) => ({ code: i.code, name: i.name, qty: i.qty })),
        subtotal: r.subtotal,
        discount: r.discount,
        discount_rate: r.discountRate,
        reward_discount_used: r.discountAuto,
        late_fee: r.lateFee,
        total: r.total,
        status: r.status,
      };
    }),
    categories: a.categories.map((c) => ({
      code: c.code,
      name: c.name,
      inventory: c.inventory,
      units_rented: c.unitsRented,
      rental_hours: c.rentalHours,
      revenue: c.revenue,
      avg_duration_hours: p(c.avgDuration),
      avg_quantity: p(c.avgQty),
      maintenance_count: c.maintenanceCount,
      utilization_percent: p(c.utilization),
    })),
    hourly_demand: a.hourly.map((h) => ({
      hour: `${String(h.hour).padStart(2, "0")}:00-${String((h.hour + 1) % 24).padStart(2, "0")}:00`,
      rentals: h.rentals,
      bicycles_rented: h.bikes,
      revenue: h.revenue,
      avg_quantity: p(h.avgQty),
      cancellations: h.cancellations,
    })),
    weekday_demand: a.weekdays.map((w) => ({
      weekday: w.name,
      rentals: w.rentals,
      bicycles_rented: w.bikes,
      revenue: w.revenue,
      avg_value: p(w.avgValue),
      late_rate_percent: p(w.lateRate),
    })),
    daily_trends: a.daily.map((d) => ({
      day: new Date(d.day).toISOString().slice(0, 10),
      rentals: d.rentals,
      bicycles_rented: d.bikes,
      revenue: d.revenue,
      discounts: d.discounts,
      late_fees: d.lateFees,
      cancellations: d.cancellations,
      completed: d.completed,
      avg_duration_hours: p(d.avgDuration),
    })),
    duration_analysis: a.durations.map((d) => ({
      hours: d.hours,
      label: d.label,
      rentals: d.rentals,
      percent: p(d.percent),
      bicycles_rented: d.bikes,
      revenue: d.revenue,
    })),
    payment_analysis: a.payments.map((pm) => ({
      method: accountKindLabel(pm.kind),
      account: pm.name,
      transactions: pm.count,
      amount: pm.amount,
      percent_of_received: p(pm.percent),
    })),
    discount_analysis: {
      discounted_rentals: a.discounts.discountedRentals,
      total_discount: a.discounts.totalDiscount,
      distribution: a.discounts.distribution,
      reward_discounts_used: a.discounts.rewardUsed,
      customers_with_discount: a.discounts.customersWithDiscount,
      revenue_before_discount: a.discounts.beforeRevenue,
      revenue_after_discount: a.discounts.afterRevenue,
    },
    late_return_analysis: {
      late_rentals: a.late.lateRentals,
      actual_late_minutes: a.late.actualMinutes,
      waived_minutes: a.late.waivedMinutes,
      chargeable_minutes: a.late.chargeableMinutes,
      late_fees: a.late.fees,
      avg_delay_minutes: p(a.late.avgDelay),
      late_percent_of_completed: p(a.late.latePercent),
      by_weekday: a.late.byWeekday,
    },
    maintenance_analysis: {
      count: a.maintenance.count,
      open: a.maintenance.openCount,
      total_hours: a.maintenance.totalHours,
      avg_hours: p(a.maintenance.avgHours),
      total_cost: a.maintenance.totalCost,
      by_category: a.maintenance.byCategory,
      frequent_bicycles: a.maintenance.topBikes,
    },
    inventory_utilization: {
      period_days: a.quality.period_covered.days,
      categories: a.categories.map((c) => ({
        code: c.code,
        name: c.name,
        inventory: c.inventory,
        utilization_percent: c.utilization,
      })),
      note: "بهره‌وری فقط وقتی موجودی > 0 باشد محاسبه می‌شود؛ در غیر این صورت null",
    },
    retention_analysis: {
      new_customers: a.retention.newCustomers,
      returning_customers: a.retention.returningCustomers,
      repeat_rate_percent: p(a.retention.repeatRate),
      avg_days_between_rentals: p(a.retention.avgGapDays),
      high_value_customers: a.retention.highValue,
      inactive_customers: a.retention.inactive.map((c) => ({
        id: c.id,
        name: c.name,
        last_rental_at: c.lastAt ? new Date(c.lastAt).toISOString() : null,
      })),
    },
    data_quality: a.quality,
  };
}

/** خروجی JSON برای هوش مصنوعی — فقط ساخت + اعتبارسنجی؛ تحویل با مرکز دانلود */
export function buildAIJSONBlob(
  db: DB,
  start: number,
  end: number
): { blob: Blob; name: string } {
  const obj = buildAIExport(db, start, end);
  return {
    blob: makeJSONBlob(obj),
    name: `pedal-ai-data-${jalaliDate(Date.now())}.json`,
  };
}

export const REPORT_TYPE_LABEL: Record<string, string> = {
  income: "گزارش درآمد",
  rentals: "گزارش اجاره‌ها",
  customers: "گزارش مشتریان",
  bikes: "گزارش عملکرد دوچرخه‌ها",
  full: "گزارش کامل مدیریتی",
};

export type ReportType = keyof typeof REPORT_TYPE_LABEL;

/** عنوان گزارش برای سربرگ PDF */
export function reportTitle(type: ReportType, a: Analytics): string {
  return `${REPORT_TYPE_LABEL[type]} — ${a.quality.period_covered.days} روز`;
}

export { money };
