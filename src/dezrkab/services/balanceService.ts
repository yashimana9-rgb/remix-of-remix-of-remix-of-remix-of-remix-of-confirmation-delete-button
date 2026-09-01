// @ts-nocheck
/**
 * حساب جاری مشتری — بستانکاری و بدهکاری
 *
 * قانون طلایی: پولی که بیشتر از مبلغ فاکتور از مشتری گرفته می‌شود «درآمد» نیست،
 * «بدهی ما به مشتری» است. این مبلغ با نوع سند CREDIT ثبت می‌شود و از درآمد کنار
 * گذاشته می‌شود؛ هر وقت در فاکتور بعدی خرج شد با سند CREDIT_APPLY مصرف و همان لحظه
 * به درآمد تبدیل می‌شود.
 *
 * بدهکاری = مانده پرداخت‌نشدهٔ اجاره‌های تمام‌شده/نسبیِ قبلی.
 */
import type { DB, Payment, Rental } from "../domain/models";
import { paymentService } from "./paymentService";

/** وضعیت‌هایی که مانده‌شان بدهی سررسیدشده تلقی می‌شود */
const DUE_STATUS = new Set(["COMPLETED", "PARTIAL"]);

export interface CreditLot {
  paymentId: string;
  accountId: string;
  amount: number;
  createdAt: number;
}

export interface DebtItem {
  rentalId: string;
  number: number;
  remaining: number;
  at: number;
}

export interface BalanceSummary {
  /** طلب مشتری از ما (بستانکاری) */
  credit: number;
  /** بدهی مشتری به ما */
  debt: number;
  /** مثبت = مشتری بستانکار است، منفی = مشتری بدهکار است */
  net: number;
  debtItems: DebtItem[];
}

function rentalIdsOf(db: DB, customerId: string): Set<string> {
  return new Set(db.rentals.filter((r) => r.customerId === customerId).map((r) => r.id));
}

export const balanceService = {
  remainingOf(db: DB, rental: Rental): number {
    return Math.max(0, Math.round(rental.total - paymentService.paidFor(db, rental.id)));
  },

  /** سندهای بستانکاری مصرف‌نشده به ترتیب قدیمی‌ترین — برای مصرف FIFO */
  creditLots(db: DB, customerId: string): CreditLot[] {
    const ids = rentalIdsOf(db, customerId);
    const mine = db.payments.filter((p) => p.rentalId && ids.has(p.rentalId));
    const lots: CreditLot[] = mine
      .filter((p: Payment) => p.kind === "CREDIT")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => ({ paymentId: p.id, accountId: p.accountId, amount: p.amount, createdAt: p.createdAt }));
    let applied = mine
      .filter((p: Payment) => p.kind === "CREDIT_APPLY")
      .reduce((s, p) => s + p.amount, 0);
    for (const lot of lots) {
      const use = Math.min(lot.amount, applied);
      lot.amount -= use;
      applied -= use;
    }
    return lots.filter((l) => l.amount > 0);
  },

  creditOf(db: DB, customerId: string): number {
    return this.creditLots(db, customerId).reduce((s, l) => s + l.amount, 0);
  },

  debtItems(db: DB, customerId: string, excludeRentalId?: string | null): DebtItem[] {
    return db.rentals
      .filter(
        (r) =>
          r.customerId === customerId &&
          r.id !== excludeRentalId &&
          DUE_STATUS.has(r.status)
      )
      .map((r) => ({
        rentalId: r.id,
        number: r.number,
        remaining: this.remainingOf(db, r),
        at: r.actualEndAt ?? r.createdAt,
      }))
      .filter((d) => d.remaining > 0)
      .sort((a, b) => a.at - b.at);
  },

  summary(db: DB, customerId: string, excludeRentalId?: string | null): BalanceSummary {
    const credit = this.creditOf(db, customerId);
    const debtItems = this.debtItems(db, customerId, excludeRentalId);
    const debt = debtItems.reduce((s, d) => s + d.remaining, 0);
    return { credit, debt, net: credit - debt, debtItems };
  },

  /* ------------------------- عملیات روی draft (اتمیک) ------------------------- */

  /** بستانکاری موجود مشتری را روی فاکتور جدید خرج می‌کند — تا سقف مانده فاکتور */
  applyCreditTo(draft: DB, rental: Rental): number {
    const lots = this.creditLots(draft, rental.customerId);
    let need = this.remainingOf(draft, rental);
    let used = 0;
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(lot.amount, need);
      paymentService.applyPayment(draft, {
        rentalId: rental.id,
        kind: "CREDIT_APPLY",
        amount: take,
        accountId: lot.accountId,
        note: "مصرف بستانکاری مشتری",
      });
      need -= take;
      used += take;
    }
    return used;
  },

  /** ثبت اضافه‌دریافت به‌عنوان بدهی ما به مشتری (نه درآمد) */
  addCredit(draft: DB, rentalId: string, amount: number, accountId: string, note: string): void {
    if (amount <= 0) return;
    paymentService.applyPayment(draft, {
      rentalId,
      kind: "CREDIT",
      amount,
      accountId,
      note: note || "اضافه‌دریافت — بستانکاری مشتری",
    });
  },

  /** پرداخت بدهی فاکتورهای قبلی از قدیمی‌ترین — مقدار خرج‌نشده برگردانده می‌شود */
  settleDebt(
    draft: DB,
    customerId: string,
    amount: number,
    accountId: string,
    excludeRentalId?: string | null
  ): number {
    let left = Math.round(amount);
    if (left <= 0) return 0;
    for (const item of this.debtItems(draft, customerId, excludeRentalId)) {
      if (left <= 0) break;
      const pay = Math.min(item.remaining, left);
      paymentService.applyPayment(draft, {
        rentalId: item.rentalId,
        kind: "RENT",
        amount: pay,
        accountId,
        note: "تسویه بدهی فاکتور قبلی",
      });
      left -= pay;
    }
    return left;
  },
};
