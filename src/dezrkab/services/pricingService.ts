// @ts-nocheck
/**
 * موتور قیمت‌گذاری مرکزی — تنها منبع محاسبه اجاره، جریمه تأخیر و گردش
 * هیچ صفحه‌ای منطق قیمت را برای خودش کپی نمی‌کند؛ همه از اینجا می‌خوانند.
 */
import type { DB, Rental, RentalItem, Settings } from "../domain/models";

export interface QuoteLine {
  categoryId: string;
  code: string;
  name: string;
  qty: number;
  hourlyRate: number;
  lineTotal: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
}

export interface LateBreakdown {
  /** کل دیرکرد واقعی از سررسید (دقیقه) */
  totalLateMinutes: number;
  /** دقیقه‌های بخشوده (مهلت رایگان) */
  graceMinutes: number;
  /** دیرکرد قابل محاسبه = کل − بخشوده */
  chargeableMinutes: number;
  lateFee: number;
}

export interface ReturnPreview {
  early: boolean;
  /** کل دیرکرد واقعی (بدون کسر مهلت) */
  lateMinutes: number;
  graceMinutes: number;
  chargeableMinutes: number;
  lateFee: number;
}

export const pricingService = {
  quote(
    db: DB,
    items: Array<{ categoryId: string; qty: number }>,
    hours: number,
    discount: number
  ): Quote {
    const lines: QuoteLine[] = [];
    for (const it of items) {
      if (it.qty <= 0) continue;
      const cat = db.categories.find((c) => c.id === it.categoryId);
      if (!cat) throw new Error("دسته دوچرخه پیدا نشد");
      lines.push({
        categoryId: cat.id,
        code: cat.code,
        name: cat.name,
        qty: it.qty,
        hourlyRate: cat.hourlyRate,
        lineTotal: cat.hourlyRate * it.qty * hours,
      });
    }
    if (lines.length === 0) throw new Error("حداقل یک دسته دوچرخه انتخاب کنید");
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const disc = Math.min(Math.max(0, discount), subtotal);
    return { lines, subtotal, discount: disc, total: subtotal - disc };
  },

  /**
   * ریز محاسبه دیرکرد — شفاف برای مشتری:
   * دیرکرد واقعی = فاصله از سررسید؛ دقیقه‌های مهلت بخشوده می‌شوند؛
   * جریمه = دقیقه قابل‌محاسبه × نرخ دقیقه‌ای × ضریب × تعداد دوچرخه‌ها
   */
  lateBreakdown(
    settings: Settings,
    items: RentalItem[],
    plannedEndAt: number,
    actualEndAt: number
  ): LateBreakdown {
    const graceMinutes = Math.max(0, settings.graceMinutes);
    if (actualEndAt <= plannedEndAt) {
      return { totalLateMinutes: 0, graceMinutes, chargeableMinutes: 0, lateFee: 0 };
    }
    const totalLateMinutes = Math.ceil((actualEndAt - plannedEndAt) / 60_000);
    const chargeableMinutes = Math.max(0, totalLateMinutes - graceMinutes);
    if (chargeableMinutes === 0) {
      return { totalLateMinutes, graceMinutes, chargeableMinutes: 0, lateFee: 0 };
    }
    // نرخ دقیقه‌ای = مجموع(نرخ ساعتی × تعداد) ÷ ۶۰ — پس تعداد دوچرخه‌ها داخل فرمول است
    const perMinute = items.reduce((s, i) => s + i.hourlyRate * i.qty, 0) / 60;
    const lateFee = Math.round(chargeableMinutes * perMinute * settings.lateMultiplier);
    return { totalLateMinutes, graceMinutes, chargeableMinutes, lateFee };
  },

  lateFeeFor(
    settings: Settings,
    items: RentalItem[],
    plannedEndAt: number,
    actualEndAt: number
  ): number {
    return this.lateBreakdown(settings, items, plannedEndAt, actualEndAt).lateFee;
  },

  /** پیش‌نمایش لحظه‌ای وضعیت برگشت همین حالا */
  previewReturn(db: DB, rental: Rental, now: number = Date.now()): ReturnPreview {
    const b = this.lateBreakdown(db.settings, rental.items, rental.plannedEndAt, now);
    return {
      early: now < rental.plannedEndAt,
      lateMinutes: b.totalLateMinutes,
      graceMinutes: b.graceMinutes,
      chargeableMinutes: b.chargeableMinutes,
      lateFee: b.lateFee,
    };
  },

  /** زمان آزادسازی دوچرخه بعد از برگشت — قانون گردش تنظیمات */
  releaseAt(db: DB, returnedEarly: boolean, now: number = Date.now()): number {
    return returnedEarly ? now + db.settings.releaseDelayMinutes * 60_000 : now;
  },
};
