// @ts-nocheck
/**
 * پرداخت‌ها — تاریخچه مالی هرگز بازنویسی نمی‌شود.
 * اصلاح فقط با ثبت سند اصلاحی مجزا و قابل ردیابی انجام می‌شود.
 */
import type { DB, Payment, PaymentKind, Rental } from "../domain/models";
import { faNum, money, uid } from "../utils/format";
import { mutate } from "../storage/storage";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";

export const KIND_LABEL: Record<PaymentKind, string> = {
  RENT: "اجاره",
  DEPOSIT: "ودیعه",
  DEPOSIT_REFUND: "بازگشت ودیعه",
  DEPOSIT_APPLY: "منظور ودیعه",
  CORRECTION: "اصلاحیه",
  CREDIT: "بستانکاری مشتری",
  CREDIT_APPLY: "مصرف بستانکاری",
};

interface ApplyInput {
  rentalId: string;
  kind: PaymentKind;
  amount: number;
  accountId: string;
  note: string;
}

export const paymentService = {
  paidFor(db: DB, rentalId: string): number {
    return db.payments
      .filter(
        (p) =>
          p.rentalId === rentalId &&
          (p.kind === "RENT" ||
            p.kind === "CORRECTION" ||
            p.kind === "DEPOSIT_APPLY" ||
            p.kind === "CREDIT_APPLY")
      )
      .reduce((s, p) => s + p.amount, 0);
  },

  remainingFor(db: DB, rental: Rental): number {
    return rental.total - this.paidFor(db, rental.id);
  },

  /** ثبت سند پرداخت روی draft — هم‌تراکنش با اجاره/برگشت */
  applyPayment(draft: DB, input: ApplyInput): Payment {
    const rental = draft.rentals.find((r) => r.id === input.rentalId);
    if (!rental) throw new Error("اجاره پیدا نشد");
    if (rental.status === "CANCELLED") throw new Error("اجاره لغوشده قابل پرداخت نیست");
    const account = draft.settings.accounts.find((a) => a.id === input.accountId);
    if (!account) throw new Error("حساب پرداخت را انتخاب کنید");
    if (!account.active) throw new Error(`حساب «${account.name}» غیرفعال است`);

    const amount = Math.round(input.amount);
    if (input.kind === "CORRECTION") {
      if (amount === 0) throw new Error("مبلغ اصلاحیه نمی‌تواند صفر باشد");
      if (!input.note.trim()) throw new Error("اصلاحیه حتماً نیاز به توضیح دارد");
    } else if (amount <= 0) {
      throw new Error("مبلغ باید بزرگ‌تر از صفر باشد");
    }

    if (input.kind === "RENT") {
      const remaining = rental.total - this.paidFor(draft, rental.id);
      if (amount > remaining) {
        throw new Error(`مبلغ دریافتی از مانده (${money(remaining)}) بیشتر است`);
      }
    }

    const payment: Payment = {
      id: uid(),
      rentalId: rental.id,
      kind: input.kind,
      amount,
      accountId: account.id,
      note: input.note.trim(),
      operatorId: draft.__actor ?? "system",
      createdAt: Date.now(),
    };
    draft.payments.push(payment);

    // گذار کنترل‌شده: تکمیل‌شده + بدون مانده ⇒ تسویه‌شده
    if (rental.status === "COMPLETED") {
      const remaining = rental.total - this.paidFor(draft, rental.id);
      if (remaining <= 0) rental.status = "SETTLED";
    }
    return payment;
  },

  addPayment(input: ApplyInput): Payment {
    const me = authService.requireUser();
    requirePerm(me, input.kind === "CORRECTION" ? "payment.correct" : "payment.receive");
    return mutate((draft) => {
      const payment = authService.withActor(draft, (d) => this.applyPayment(d, input));
      const rental = draft.rentals.find((r) => r.id === input.rentalId);
      if (input.kind === "CORRECTION") {
        auditService.log(
          draft,
          "اصلاح پرداخت",
          "payment",
          payment.id,
          `اجاره #${faNum(rental?.number ?? 0)} — ${money(input.amount)} — ${input.note}`
        );
      } else {
        auditService.log(
          draft,
          "ثبت پرداخت",
          "payment",
          payment.id,
          `اجاره #${faNum(rental?.number ?? 0)} — ${KIND_LABEL[input.kind]} ${money(input.amount)}`
        );
      }
      return payment;
    });
  },

  accountName(db: DB, accountId: string): string {
    return db.settings.accounts.find((a) => a.id === accountId)?.name ?? "—";
  },
};
