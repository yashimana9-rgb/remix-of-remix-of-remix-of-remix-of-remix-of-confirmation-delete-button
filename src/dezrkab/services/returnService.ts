// @ts-nocheck
/**
 * برگشت دوچرخه — کامل یا نسبی
 * برگشت زودهنگام: دوچرخه همان لحظه (با قانون گردش تنظیمات) آزاد می‌شود،
 * نه اینکه تا پایان برنامه‌ریزی‌شده بلوکه بماند.
 * جریمه تأخیر فقط از pricingService می‌آید — منطق تکراری nowhere.
 */
import type { Rental } from "../domain/models";
import { mutate } from "../storage/storage";
import { faNum, money } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";
import { balanceService } from "./balanceService";
import { paymentService } from "./paymentService";
import { pricingService } from "./pricingService";

export interface ReturnInput {
  rentalId: string;
  /** تعداد برگشتی به‌تفکیک دسته */
  returns: Array<{ categoryId: string; qty: number }>;
  paymentAmount?: number;
  accountId?: string;
  /** پرداخت ترکیبی — چند روش پرداخت در یک تسویه */
  payments?: Array<{ amount: number; accountId: string }>;
  /**
   * مبلغ نهایی دستی برای کل فاکتور (شامل پرداخت‌های قبلی).
   * کمتر از مبلغ محاسبه‌شده ⇒ تخفیف روی کل، بیشتر ⇒ بستانکاری مشتری.
   */
  finalAmount?: number | null;
}

export interface ReturnResult {
  rental: Rental;
  full: boolean;
  lateFee: number;
  releasedCount: number;
  /** تخفیف دستی اعمال‌شده روی کل */
  manualDiscount: number;
  /** مبلغ بستانکاری مشتری (اضافه‌پرداخت) */
  credit: number;
  /** بستانکاری قبلی که روی همین فاکتور خرج شد */
  usedCredit: number;
  /** بدهی فاکتورهای قبلی که با اضافه‌دریافت تسویه شد */
  settledDebt: number;
}


export const returnService = {
  processReturn(input: ReturnInput): ReturnResult {
    const me = authService.requireUser();
    requirePerm(me, "return.process");

    const returns = input.returns.filter((r) => r.qty > 0);
    if (returns.length === 0) throw new Error("تعداد برگشتی را مشخص کنید");

    return mutate((draft) => {
      const rental = draft.rentals.find((r) => r.id === input.rentalId);
      if (!rental) throw new Error("اجاره پیدا نشد");
      if (rental.status !== "ACTIVE" && rental.status !== "PARTIAL") {
        throw new Error("این اجاره در جریان نیست و قابل برگشت نیست");
      }

      const now = Date.now();
      const early = now < rental.plannedEndAt;
      let released = 0;

      for (const ret of returns) {
        const item = rental.items.find((i) => i.categoryId === ret.categoryId);
        if (!item) throw new Error("دسته در این اجاره وجود ندارد");
        const outstanding = item.qty - item.returnedQty;
        if (ret.qty > outstanding) {
          throw new Error(
            `از «${item.name}» فقط ${faNum(outstanding)} دستگاه بیرون است`
          );
        }
        // آزادسازی دقیقاً همان تعداد — با قانون گردش
        const bikes = draft.bikes.filter((b) => b.rentalId === rental.id && b.categoryId === ret.categoryId);
        if (bikes.length < ret.qty) {
          throw new Error("سازگاری موجودی به هم خورده است — با مدیر بررسی کنید");
        }
        const releaseAt = pricingService.releaseAt(draft, early, now);
        for (const bike of bikes.slice(0, ret.qty)) {
          bike.status = "AVAILABLE";
          bike.rentalId = null;
          bike.availableAt = releaseAt;
          released++;
        }
        item.returnedQty += ret.qty;
      }

      const full = rental.items.every((i) => i.returnedQty >= i.qty);
      let lateFee = 0;
      let manualDiscount = 0;
      let credit = 0;

      if (full) {
        rental.actualEndAt = now;
        /*
          پاداش مشتری: ساعت‌های تکمیل‌شده = مجموع (تعداد × مدت) برای همه دسته‌ها
          فقط هنگام تکمیل واقعی اجاره محاسبه می‌شود — نه هنگام ایجاد، نه هنگام لغو
        */
        const cust = draft.customers.find((c) => c.id === rental.customerId);
        if (cust) {
          const earned = rental.items.reduce((s, it) => s + it.qty * rental.hours, 0);
          cust.completedHours = (cust.completedHours ?? 0) + earned;
        }
        lateFee = pricingService.lateFeeFor(draft.settings, rental.items, rental.plannedEndAt, now);
        rental.lateFee = lateFee;
        rental.total = rental.subtotal - rental.discount + lateFee;

        /* مبلغ نهایی دستی — کمتر از مبلغ محاسبه‌شده ⇒ تخفیف روی کل فاکتور */
        if (input.finalAmount !== null && input.finalAmount !== undefined) {
          const settle = Math.max(0, Math.round(input.finalAmount));
          if (settle < rental.total) {
            manualDiscount = rental.total - settle;
            rental.discount += manualDiscount;
            rental.total = settle;
          }
        }

        rental.status = "COMPLETED";
        // اگر از قبل کامل پرداخت شده باشد، مستقیم تسویه می‌شود
        if (paymentService.paidFor(draft, rental.id) >= rental.total) {
          rental.status = "SETTLED";
        }
      } else {
        rental.status = "PARTIAL";
      }

      /* بستانکاری قبلی مشتری ابتدا روی همین فاکتور خرج می‌شود */
      let usedCredit = 0;
      if (full) {
        usedCredit = authService.withActor(draft, (d) => balanceService.applyCreditTo(d, rental));
        if (usedCredit > 0 && rental.status === "COMPLETED") {
          if (paymentService.paidFor(draft, rental.id) >= rental.total) rental.status = "SETTLED";
        }
      }

      /* پرداخت‌ها — ترکیبی (چند روش) یا تک‌روشِ سازگار با نسخه قبل */
      const lines =
        input.payments && input.payments.length > 0
          ? input.payments
          : (input.paymentAmount ?? 0) > 0
            ? [{ amount: input.paymentAmount as number, accountId: input.accountId as string }]
            : [];

      let settledDebt = 0;
      for (const line of lines) {
        const amount = Math.round(line.amount);
        if (amount <= 0) continue;
        const remaining = Math.max(0, rental.total - paymentService.paidFor(draft, rental.id));
        const rentPart = Math.min(amount, remaining);
        if (rentPart > 0) {
          paymentService.applyPayment(draft, {
            rentalId: rental.id,
            kind: "RENT",
            amount: rentPart,
            accountId: line.accountId,
            note: full ? "دریافت هنگام تسویه" : "دریافت هنگام برگشت نسبی",
          });
        }
        let extra = amount - rentPart;
        if (extra > 0) {
          /* اول بدهی فاکتورهای قبلی همین مشتری تسویه می‌شود */
          const left = balanceService.settleDebt(
            draft,
            rental.customerId,
            extra,
            line.accountId,
            rental.id
          );
          settledDebt += extra - left;
          extra = left;
        }
        if (extra > 0) {
          /* باقی‌مانده بدهی ما به مشتری است — نه درآمد */
          credit += extra;
          balanceService.addCredit(draft, rental.id, extra, line.accountId, "اضافه‌دریافت هنگام تسویه");
        }
      }

      const detail = [
        `اجاره #${faNum(rental.number)}`,
        returns
          .map((r) => {
            const item = rental.items.find((i) => i.categoryId === r.categoryId);
            return `${faNum(r.qty)} × ${item?.name ?? ""}`;
          })
          .join("، "),
        full ? "برگشت کامل" : "برگشت نسبی",
        lateFee > 0 ? `جریمه تأخیر ${money(lateFee)}` : early ? "زودهنگام" : "به‌موقع",
        manualDiscount > 0 ? `تخفیف دستی ${money(manualDiscount)}` : "",
        usedCredit > 0 ? `مصرف بستانکاری ${money(usedCredit)}` : "",
        settledDebt > 0 ? `تسویه بدهی قبلی ${money(settledDebt)}` : "",
        credit > 0 ? `بستانکاری ${money(credit)}` : "",
      ]
        .filter(Boolean)
        .join(" — ");

      authService.withActor(draft, (d) =>
        auditService.log(d, "برگشت اجاره", "rental", rental.id, detail)
      );

      return {
        rental,
        full,
        lateFee,
        releasedCount: released,
        manualDiscount,
        credit,
        usedCredit,
        settledDebt,
      };

    });
  },

};
