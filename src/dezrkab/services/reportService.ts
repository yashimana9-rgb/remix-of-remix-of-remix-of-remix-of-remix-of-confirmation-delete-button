// @ts-nocheck
/**
 * سرویس محاسبات مدیریتی — تنها منبع گزارش‌ها
 * پیشخوان مدیر، خروجی PDF و خروجی JSON برای هوش مصنوعی همه از همین سرویس می‌خوانند
 * تا اعداد در هر سه خروجی دقیقاً یکسان باشند.
 */
import type { DB, Rental } from "../domain/models";
import { durationLabel, jalaliMonthKey, startOfDay } from "../utils/format";
import { balanceService } from "./balanceService";

const DAY = 86_400_000;

/* ------------------------------ بازه‌های زمانی ------------------------------ */

export function todayRange(): [number, number] {
  const s = startOfDay(Date.now());
  return [s, s + DAY];
}
export function yesterdayRange(): [number, number] {
  const s = startOfDay(Date.now()) - DAY;
  return [s, s + DAY];
}
export function thisWeekRange(): [number, number] {
  let s = startOfDay(Date.now());
  while (new Date(s).getDay() !== 6) s -= DAY; // هفته ایرانی از شنبه
  return [s, startOfDay(Date.now()) + DAY];
}
export function thisMonthRange(): [number, number] {
  const start = startOfDay(Date.now());
  const key = jalaliMonthKey(start);
  let s = start;
  while (jalaliMonthKey(s - DAY) === key) s -= DAY;
  return [s, start + DAY];
}
export function lastMonthRange(): [number, number] {
  const [ms] = thisMonthRange();
  const key = jalaliMonthKey(ms - DAY);
  let s = startOfDay(ms - DAY);
  while (jalaliMonthKey(s - DAY) === key) s -= DAY;
  return [s, ms];
}

/* ------------------------------ مدل تحلیل ------------------------------ */

export interface HourBucket {
  hour: number;
  rentals: number;
  bikes: number;
  revenue: number;
  avgQty: number | null;
  cancellations: number;
}
export interface WeekdayBucket {
  weekday: number;
  name: string;
  rentals: number;
  bikes: number;
  revenue: number;
  avgValue: number | null;
  lateCount: number;
  lateRate: number | null;
}
export interface DayTrend {
  day: number;
  rentals: number;
  bikes: number;
  revenue: number;
  discounts: number;
  lateFees: number;
  cancellations: number;
  completed: number;
  avgDuration: number | null;
}
export interface DurationBucket {
  hours: number;
  label: string;
  rentals: number;
  percent: number | null;
  bikes: number;
  revenue: number;
}
export interface CategoryPerf {
  code: string;
  name: string;
  inventory: number;
  unitsRented: number;
  rentalHours: number;
  revenue: number;
  avgDuration: number | null;
  avgQty: number | null;
  maintenanceCount: number;
  utilization: number | null;
}
export interface CustomerStat {
  id: string;
  name: string;
  phone: string;
  firstRentalAt: number;
  lastRentalAt: number;
  completedRentals: number;
  totalHours: number;
  totalUnits: number;
  spending: number;
  avgValue: number | null;
  cancelled: number;
  lateCount: number;
  lateMinutes: number;
  lateFees: number;
  discounts: number;
  rewardUses: number;
  rewardHours: number;
  rewardEligible: boolean;
}
export interface PaymentStat {
  accountId: string;
  name: string;
  kind: string;
  count: number;
  amount: number;
  percent: number | null;
}
export interface DiscountAnalysis {
  discountedRentals: number;
  totalDiscount: number;
  distribution: Array<{ rate: number; count: number; amount: number }>;
  rewardUsed: number;
  customersWithDiscount: number;
  beforeRevenue: number;
  afterRevenue: number;
}
export interface LateAnalysis {
  lateRentals: number;
  actualMinutes: number;
  waivedMinutes: number;
  chargeableMinutes: number;
  fees: number;
  avgDelay: number | null;
  latePercent: number | null;
  byWeekday: Array<{ weekday: number; name: string; count: number }>;
}
export interface MaintenanceAnalysis {
  count: number;
  openCount: number;
  totalHours: number;
  avgHours: number | null;
  totalCost: number;
  byCategory: Array<{ code: string; name: string; count: number }>;
  topBikes: Array<{ serial: string; count: number }>;
}
export interface RetentionAnalysis {
  newCustomers: number;
  returningCustomers: number;
  repeatRate: number | null;
  avgGapDays: number | null;
  highValue: Array<{ id: string; name: string; spending: number }>;
  inactive: Array<{ id: string; name: string; lastAt: number | null }>;
}
export interface LiabilityAnalysis {
  /** جمع بستانکاری همه مشتریان — بدهی ما به آن‌ها */
  customerCredit: number;
  /** جمع بدهی مشتریان به ما (فاکتورهای تسویه‌نشده) */
  customerDebt: number;
  /** اضافه‌دریافت ثبت‌شده در این بازه (وارد درآمد نشده) */
  creditReceived: number;
  /** بستانکاری خرج‌شده در این بازه (به درآمد اضافه شده) */
  creditApplied: number;
  creditors: Array<{ id: string; name: string; phone: string; amount: number }>;
  debtors: Array<{ id: string; name: string; phone: string; amount: number }>;
}
export interface Summary {
  revenue: number;
  received: number;
  outstanding: number;
  rentalCount: number;
  completedCount: number;
  cancelledCount: number;
  activeCount: number;
  avgRental: number | null;
  discounts: number;
  lateFees: number;
  activeCustomers: number;
  repeatRate: number | null;
  topCategory: string | null;
  busiestHour: number | null;
  peakWindow: string | null;
  busiestWeekday: string | null;
}
export interface DataQuality {
  record_count: { rentals: number; customers: number; payments: number };
  period_covered: { from: string; to: string; days: number };
  missing_fields: string[];
  calculation_notes: string[];
}
export interface Analytics {
  start: number;
  end: number;
  summary: Summary;
  hourly: HourBucket[];
  weekdays: WeekdayBucket[];
  daily: DayTrend[];
  durations: DurationBucket[];
  categories: CategoryPerf[];
  customers: CustomerStat[];
  payments: PaymentStat[];
  discounts: DiscountAnalysis;
  late: LateAnalysis;
  maintenance: MaintenanceAnalysis;
  retention: RetentionAnalysis;
  liabilities: LiabilityAnalysis;
  quality: DataQuality;
  rentalsInRange: Rental[];
}

const WEEKDAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // شنبه اول هفته
function weekdayName(jsDay: number): string {
  return WEEKDAY_NAMES[WEEKDAY_ORDER.indexOf(jsDay)] ?? "";
}

/* درآمد: اضافه‌دریافت (CREDIT) عمداً حذف شده — بدهی ما به مشتری است، نه درآمد */
const moneyKinds = new Set(["RENT", "CORRECTION", "DEPOSIT_APPLY", "CREDIT_APPLY"]);

export const reportService = {
  buildAnalytics(db: DB, start: number, end: number): Analytics {
    const inRange = (t: number | null) => t !== null && t >= start && t < end;
    const grace = db.settings.graceMinutes;

    const created = db.rentals.filter((r) => inRange(r.createdAt));
    const alive = created.filter((r) => r.status !== "CANCELLED");
    const cancelled = created.filter((r) => r.status === "CANCELLED");
    const completedIn = db.rentals.filter((r) => inRange(r.actualEndAt) && r.status !== "CANCELLED");

    const pays = db.payments.filter((p) => inRange(p.createdAt));
    const received = pays.filter((p) => moneyKinds.has(p.kind)).reduce((s, p) => s + p.amount, 0);
    const revenue = received;

    const paidByRental = new Map<string, number>();
    for (const p of db.payments) {
      if (!p.rentalId || !moneyKinds.has(p.kind)) continue;
      paidByRental.set(p.rentalId, (paidByRental.get(p.rentalId) ?? 0) + p.amount);
    }

    const outstanding = alive
      .filter((r) => r.status === "ACTIVE" || r.status === "PARTIAL" || r.status === "COMPLETED")
      .reduce((s, r) => s + Math.max(0, r.total - (paidByRental.get(r.id) ?? 0)), 0);

    const discounts = alive.reduce((s, r) => s + r.discount, 0);
    const lateFees = completedIn.reduce((s, r) => s + r.lateFee, 0);

    const late = (r: Rental) => !!r.actualEndAt && r.actualEndAt > r.plannedEndAt;
    const lateRentals = db.rentals.filter((r) => inRange(r.actualEndAt) && late(r));
    const lateActualMin = lateRentals.reduce(
      (s, r) => s + Math.ceil(((r.actualEndAt as number) - r.plannedEndAt) / 60_000),
      0
    );
    const lateWaivedMin = lateRentals.reduce(
      (s, r) => s + Math.min(grace, Math.ceil(((r.actualEndAt as number) - r.plannedEndAt) / 60_000)),
      0
    );
    const lateChargeableMin = Math.max(0, lateActualMin - lateWaivedMin);

    /* ---------- ساعتی ---------- */
    const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      rentals: 0,
      bikes: 0,
      revenue: 0,
      avgQty: null,
      cancellations: 0,
    }));
    for (const r of created) {
      const h = hourly[new Date(r.createdAt).getHours()];
      h.rentals += 1;
      h.bikes += r.items.reduce((s, i) => s + i.qty, 0);
      h.cancellations += r.status === "CANCELLED" ? 1 : 0;
    }
    for (const p of pays.filter((p) => moneyKinds.has(p.kind))) {
      hourly[new Date(p.createdAt).getHours()].revenue += p.amount;
    }
    for (const h of hourly) h.avgQty = h.rentals > 0 ? +(h.bikes / h.rentals).toFixed(1) : null;

    /* ---------- روزهای هفته ---------- */
    const weekdays: WeekdayBucket[] = WEEKDAY_ORDER.map((jsDay) => ({
      weekday: jsDay,
      name: weekdayName(jsDay),
      rentals: 0,
      bikes: 0,
      revenue: 0,
      avgValue: null,
      lateCount: 0,
      lateRate: null,
    }));
    const wdIndex = new Map(WEEKDAY_ORDER.map((d, i) => [d, i] as const));
    for (const r of created) {
      const b = weekdays[wdIndex.get(new Date(r.createdAt).getDay()) ?? 0];
      b.rentals += 1;
      b.bikes += r.items.reduce((s, i) => s + i.qty, 0);
      if (r.status !== "CANCELLED") b.revenue += r.total;
      if (late(r)) b.lateCount += 1;
    }
    for (const b of weekdays) {
      b.avgValue = b.rentals > 0 ? Math.round(b.revenue / b.rentals) : null;
      b.lateRate = b.rentals > 0 ? Math.round((b.lateCount / b.rentals) * 100) : null;
    }

    /* ---------- روند روزانه ---------- */
    const daily: DayTrend[] = [];
    const spanDays = Math.min(62, Math.max(1, Math.round((end - start) / DAY)));
    for (let i = 0; i < spanDays; i++) {
      const d0 = start + i * DAY;
      const d1 = d0 + DAY;
      const dayRentals = created.filter((r) => r.createdAt >= d0 && r.createdAt < d1);
      const dayAlive = dayRentals.filter((r) => r.status !== "CANCELLED");
      const dayCompleted = completedIn.filter((r) => (r.actualEndAt as number) >= d0 && (r.actualEndAt as number) < d1);
      daily.push({
        day: d0,
        rentals: dayRentals.length,
        bikes: dayAlive.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0), 0),
        revenue: pays
          .filter((p) => moneyKinds.has(p.kind) && p.createdAt >= d0 && p.createdAt < d1)
          .reduce((s, p) => s + p.amount, 0),
        discounts: dayAlive.reduce((s, r) => s + r.discount, 0),
        lateFees: dayCompleted.reduce((s, r) => s + r.lateFee, 0),
        cancellations: dayRentals.filter((r) => r.status === "CANCELLED").length,
        completed: dayCompleted.length,
        avgDuration: dayAlive.length > 0 ? +(dayAlive.reduce((s, r) => s + r.hours, 0) / dayAlive.length).toFixed(1) : null,
      });
    }

    /* ---------- بازه‌های زمانی ---------- */
    const durMap = new Map<number, DurationBucket>();
    for (const r of alive) {
      const cur = durMap.get(r.hours) ?? {
        hours: r.hours,
        label: durationLabel(r.hours),
        rentals: 0,
        percent: null,
        bikes: 0,
        revenue: 0,
      };
      cur.rentals += 1;
      cur.bikes += r.items.reduce((s, i) => s + i.qty, 0);
      cur.revenue += r.total;
      durMap.set(r.hours, cur);
    }
    const durations = [...durMap.values()].sort((a, b) => a.hours - b.hours);
    for (const d of durations) {
      d.percent = alive.length > 0 ? Math.round((d.rentals / alive.length) * 100) : null;
    }

    /* ---------- عملکرد دسته‌ها ---------- */
    const periodDays = spanDays;
    const categories: CategoryPerf[] = db.categories.map((c) => {
      const inv = db.bikes.filter((b) => b.categoryId === c.id).length;
      let units = 0;
      let hoursSum = 0;
      let revenueSum = 0;
      let rentalCount = 0;
      for (const r of alive) {
        for (const it of r.items) {
          if (it.categoryId !== c.id) continue;
          units += it.qty;
          hoursSum += it.qty * r.hours;
          revenueSum += it.qty * r.hours * it.hourlyRate;
          rentalCount += 1;
        }
      }
      const maintCount = db.maintenances.filter((m) => inRange(m.startedAt) && m.categoryId === c.id).length;
      const utilization = inv > 0 ? +((hoursSum / (inv * periodDays * 24)) * 100).toFixed(1) : null;
      return {
        code: c.code,
        name: c.name,
        inventory: inv,
        unitsRented: units,
        rentalHours: hoursSum,
        revenue: Math.round(revenueSum),
        avgDuration: rentalCount > 0 ? +(hoursSum / units).toFixed(1) : null,
        avgQty: rentalCount > 0 ? +(units / rentalCount).toFixed(1) : null,
        maintenanceCount: maintCount,
        utilization,
      };
    });

    /* ---------- مشتریان (آمار تمام‌دوره برای وفاداری) ---------- */
    const customers: CustomerStat[] = db.customers.map((c) => {
      const rents = db.rentals
        .filter((r) => r.customerId === c.id)
        .sort((a, b) => a.createdAt - b.createdAt);
      const aliveRents = rents.filter((r) => r.status !== "CANCELLED");
      const lateRents = aliveRents.filter(late);
      const spending = aliveRents.reduce((s, r) => s + Math.min(r.total, paidByRental.get(r.id) ?? 0), 0);
      const totalUnits = aliveRents.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0), 0);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        firstRentalAt: rents.length ? rents[0].createdAt : c.createdAt,
        lastRentalAt: rents.length ? rents[rents.length - 1].createdAt : c.createdAt,
        completedRentals: aliveRents.filter((r) => r.status === "COMPLETED" || r.status === "SETTLED").length,
        totalHours: aliveRents.reduce((s, r) => s + r.items.reduce((x, i) => x + i.qty, 0) * r.hours, 0),
        totalUnits,
        spending,
        avgValue: aliveRents.length > 0 ? Math.round(aliveRents.reduce((s, r) => s + r.total, 0) / aliveRents.length) : null,
        cancelled: rents.length - aliveRents.length,
        lateCount: lateRents.length,
        lateMinutes: lateRents.reduce((s, r) => s + Math.ceil(((r.actualEndAt as number) - r.plannedEndAt) / 60_000), 0),
        lateFees: lateRents.reduce((s, r) => s + r.lateFee, 0),
        discounts: aliveRents.reduce((s, r) => s + r.discount, 0),
        rewardUses: c.discountUses?.length ?? 0,
        rewardHours: c.completedHours ?? 0,
        rewardEligible: (c.completedHours ?? 0) >= db.settings.rewardThresholdHours,
      };
    });

    /* ---------- روش‌های پرداخت ---------- */
    const payMap = new Map<string, PaymentStat>();
    for (const p of pays.filter((p) => moneyKinds.has(p.kind))) {
      const acc = db.settings.accounts.find((a) => a.id === p.accountId);
      const cur = payMap.get(p.accountId) ?? {
        accountId: p.accountId,
        name: acc?.name ?? "حساب حذف‌شده",
        kind: acc?.kind ?? "—",
        count: 0,
        amount: 0,
        percent: null,
      };
      cur.count += 1;
      cur.amount += p.amount;
      payMap.set(p.accountId, cur);
    }
    const payments = [...payMap.values()].sort((a, b) => b.amount - a.amount);
    for (const p of payments) p.percent = received > 0 ? Math.round((p.amount / received) * 100) : null;

    /* ---------- تخفیف‌ها ---------- */
    const discounted = alive.filter((r) => r.discount > 0);
    const distMap = new Map<number, { rate: number; count: number; amount: number }>();
    for (const r of discounted) {
      const cur = distMap.get(r.discountRate) ?? { rate: r.discountRate, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.discount;
      distMap.set(r.discountRate, cur);
    }
    const discountAnalysis: DiscountAnalysis = {
      discountedRentals: discounted.length,
      totalDiscount: discounts,
      distribution: [...distMap.values()].sort((a, b) => a.rate - b.rate),
      rewardUsed: alive.filter((r) => r.discountAuto).length,
      customersWithDiscount: new Set(discounted.map((r) => r.customerId)).size,
      beforeRevenue: alive.reduce((s, r) => s + r.subtotal, 0),
      afterRevenue: alive.reduce((s, r) => s + r.total, 0),
    };

    /* ---------- تأخیرها ---------- */
    const lateByWeekday = WEEKDAY_ORDER.map((d) => ({ weekday: d, name: weekdayName(d), count: 0 }));
    for (const r of lateRentals) {
      const b = lateByWeekday[wdIndex.get(new Date(r.actualEndAt as number).getDay()) ?? 0];
      b.count += 1;
    }
    const lateAnalysis: LateAnalysis = {
      lateRentals: lateRentals.length,
      actualMinutes: lateActualMin,
      waivedMinutes: lateWaivedMin,
      chargeableMinutes: lateChargeableMin,
      fees: lateFees,
      avgDelay: lateRentals.length > 0 ? Math.round(lateActualMin / lateRentals.length) : null,
      latePercent: completedIn.length > 0 ? Math.round((lateRentals.length / completedIn.length) * 100) : null,
      byWeekday: lateByWeekday,
    };

    /* ---------- تعمیرات ---------- */
    const maints = db.maintenances.filter((m) => inRange(m.startedAt));
    const maintCatMap = new Map<string, { code: string; name: string; count: number }>();
    for (const m of maints) {
      const c = db.categories.find((x) => x.id === m.categoryId);
      const cur = maintCatMap.get(m.categoryId) ?? { code: c?.code ?? "؟", name: c?.name ?? "نامشخص", count: 0 };
      cur.count += 1;
      maintCatMap.set(m.categoryId, cur);
    }
    const bikeCount = new Map<string, number>();
    for (const m of maints) bikeCount.set(m.serial, (bikeCount.get(m.serial) ?? 0) + 1);
    const maintHours = maints.reduce((s, m) => s + ((m.endedAt ?? Date.now()) - m.startedAt) / 3_600_000, 0);
    const maintenanceAnalysis: MaintenanceAnalysis = {
      count: maints.length,
      openCount: maints.filter((m) => m.status === "OPEN").length,
      totalHours: +maintHours.toFixed(1),
      avgHours: maints.length > 0 ? +(maintHours / maints.length).toFixed(1) : null,
      totalCost: maints.reduce((s, m) => s + m.cost, 0),
      byCategory: [...maintCatMap.values()].sort((a, b) => b.count - a.count),
      topBikes: [...bikeCount.entries()].map(([serial, count]) => ({ serial, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    };

    /* ---------- نگهداشت مشتری ---------- */
    const renters = customers.filter((c) => db.rentals.some((r) => r.customerId === c.id));
    const newCustomers = customers.filter((c) => inRange(c.firstRentalAt)).length;
    const returningCustomers = customers.filter((c) => !inRange(c.firstRentalAt) && inRange(c.lastRentalAt)).length;
    const multi = renters.filter((c) => {
      const n = db.rentals.filter((r) => r.customerId === c.id).length;
      return n >= 2;
    });
    const repeatRate = renters.length > 0 ? Math.round((multi.length / renters.length) * 100) : null;
    const gaps: number[] = [];
    for (const c of multi) {
      const n = db.rentals.filter((r) => r.customerId === c.id).length;
      if (n > 1) gaps.push((c.lastRentalAt - c.firstRentalAt) / (n - 1) / DAY);
    }
    const retention: RetentionAnalysis = {
      newCustomers,
      returningCustomers,
      repeatRate,
      avgGapDays: gaps.length > 0 ? +(gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(1) : null,
      highValue: [...customers].sort((a, b) => b.spending - a.spending).slice(0, 5).map((c) => ({ id: c.id, name: c.name, spending: c.spending })),
      inactive: customers
        .filter((c) => Date.now() - c.lastRentalAt > 30 * DAY)
        .sort((a, b) => a.lastRentalAt - b.lastRentalAt)
        .slice(0, 8)
        .map((c) => ({ id: c.id, name: c.name, lastAt: c.lastRentalAt })),
    };

    /* ---------- حساب جاری مشتریان (بستانکاری/بدهکاری) ---------- */
    const creditors: Array<{ id: string; name: string; phone: string; amount: number }> = [];
    const debtors: Array<{ id: string; name: string; phone: string; amount: number }> = [];
    for (const c of db.customers) {
      const bal = balanceService.summary(db, c.id);
      if (bal.credit > 0) creditors.push({ id: c.id, name: c.name, phone: c.phone, amount: bal.credit });
      if (bal.debt > 0) debtors.push({ id: c.id, name: c.name, phone: c.phone, amount: bal.debt });
    }
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
    const liabilities: LiabilityAnalysis = {
      customerCredit: creditors.reduce((s, x) => s + x.amount, 0),
      customerDebt: debtors.reduce((s, x) => s + x.amount, 0),
      creditReceived: pays.filter((p) => p.kind === "CREDIT").reduce((s, p) => s + p.amount, 0),
      creditApplied: pays.filter((p) => p.kind === "CREDIT_APPLY").reduce((s, p) => s + p.amount, 0),
      creditors: creditors.slice(0, 10),
      debtors: debtors.slice(0, 10),
    };

    /* ---------- خلاصه مدیریتی ---------- */
    const busiest = [...hourly].sort((a, b) => b.rentals - a.rentals)[0];
    const busiestHour = busiest && busiest.rentals > 0 ? busiest.hour : null;
    let peakWindow: string | null = null;
    if (busiestHour !== null) {
      let best = -1;
      let bestH = 0;
      for (let h = 0; h < 23; h++) {
        const sum = hourly[h].rentals + hourly[h + 1].rentals;
        if (sum > best) {
          best = sum;
          bestH = h;
        }
      }
      if (best > 0) {
        const p = (x: number) => String(x).padStart(2, "0");
        peakWindow = `${p(bestH)}:۰۰ تا ${p(bestH + 2)}:۰۰`;
      }
    }
    const busiestWd = [...weekdays].sort((a, b) => b.rentals - a.rentals)[0];
    const topCat = [...categories].sort((a, b) => b.unitsRented - a.unitsRented)[0];

    const missing: string[] = [];
    if (db.rentals.some((r) => r.status !== "CANCELLED" && r.actualEndAt === null)) missing.push("actualEndAt (اجاره‌های در جریان)");
    if (db.customers.some((c) => !c.phone)) missing.push("customer.phone");

    const quality: DataQuality = {
      record_count: { rentals: created.length, customers: customers.length, payments: pays.length },
      period_covered: { from: new Date(start).toISOString(), to: new Date(end).toISOString(), days: spanDays },
      missing_fields: missing,
      calculation_notes: [
        "revenue = دریافتی‌های اجاره/اصلاحیه/منظور و مصرف بستانکاری در بازه — ودیعه و اضافه‌دریافت (بستانکاری مشتری) جزو درآمد نیست",
        "آمار مشتریان تمام‌دوره است تا وفاداری واقعی نشان داده شود",
        "بهره‌وری = ساعت‌های اجاره دسته ÷ (موجودی × روز × ۲۴) — اگر موجودی صفر باشد null",
        `دقایق تأخیر پس از ${grace} دقیقه بخشودگی محاسبه شده‌اند`,
      ],
    };

    return {
      start,
      end,
      summary: {
        revenue,
        received,
        outstanding,
        rentalCount: created.length,
        completedCount: completedIn.length,
        cancelledCount: cancelled.length,
        activeCount: db.rentals.filter((r) => r.status === "ACTIVE" || r.status === "PARTIAL").length,
        avgRental: alive.length > 0 ? Math.round(alive.reduce((s, r) => s + r.total, 0) / alive.length) : null,
        discounts,
        lateFees,
        activeCustomers: new Set(created.map((r) => r.customerId)).size,
        repeatRate,
        topCategory: topCat && topCat.unitsRented > 0 ? `${topCat.code} — ${topCat.name}` : null,
        busiestHour,
        peakWindow,
        busiestWeekday: busiestWd && busiestWd.rentals > 0 ? busiestWd.name : null,
      },
      hourly,
      weekdays,
      daily,
      durations,
      categories,
      customers,
      payments,
      discounts: discountAnalysis,
      late: lateAnalysis,
      maintenance: maintenanceAnalysis,
      retention,
      liabilities,
      quality,
      rentalsInRange: [...created].sort((a, b) => b.createdAt - a.createdAt),
    };
  },
};
