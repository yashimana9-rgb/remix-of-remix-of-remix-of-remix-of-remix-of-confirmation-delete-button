// @ts-nocheck
/**
 * اجاره حضوری — قلب سامانه
 * اعتبارسنجی و commit داخل همان mutate اتمیک انجام می‌شود؛
 * دو درخواست همزمان هرگز نمی‌توانند موجودی را منفی کنند (oversell ممنوع).
 *
 * پاداش مشتری: اگر discountAuto فعال باشد و مشتری به حد نصاب ساعت رسیده باشد،
 * تخفیف روی کل فاکتور اعمال می‌شود و شمارنده پاداش فقط بعد از ثبت موفق اجاره صفر می‌شود.
 * لغو اجاره، تخفیف را برنمی‌گرداند که مصرف‌شده تلقی شود — واجد‌شرط بودن دوباره برمی‌گردد.
 */
import type { Customer, Rental, RentalStatus } from "../domain/models";
import { mutate } from "../storage/storage";
import { faNum, uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";
import { availabilityService } from "./availabilityService";
import { balanceService } from "./balanceService";
import { paymentService } from "./paymentService";
import { pricingService } from "./pricingService";

export const STATUS_LABEL: Record<RentalStatus, string> = {
  DRAFT: "پیش‌نویس",
  ACTIVE: "فعال",
  PARTIAL: "برگشت نسبی",
  SETTLED: "تسویه‌شده",
  COMPLETED: "تکمیل‌شده",
  CANCELLED: "لغوشده",
};

export interface CreateRentalInput {
  /** مشتری موجود (id) یا مشتری جدیدی که فقط هنگام تأیید ذخیره می‌شود */
  customer: { id?: string; name?: string; phone?: string };
  items: Array<{ categoryId: string; qty: number }>;
  hours: number;
  startAt: number;
  note: string;
  /** تخفیف انتخابی روی کل فاکتور (درصد) */
  discountRate: number;
  /** اگر این تخفیف همان پاداش مشتری است، شمارنده پاداش پس از ثبت صفر می‌شود */
  consumeReward: boolean;
  /** پیش‌پرداخت/بیعانه قبل از تحویل (صفر یعنی هیچ پرداختی نشده) — ودیعه نیست */
  prepayAmount: number;
  accountId: string;
  /** بستانکاری قبلی مشتری روی این فاکتور خرج شود؟ پیش‌فرض بله */
  useCredit?: boolean;
}

export const rentalService = {
  createRental(input: CreateRentalInput): Rental {
    const me = authService.requireUser();
    requirePerm(me, "rental.create");

    const items = input.items.filter((i) => i.qty > 0);
    if (items.length === 0) throw new Error("حداقل یک دوچرخه انتخاب کنید");
    if (!Number.isFinite(input.hours) || input.hours <= 0) {
      throw new Error("مدت اجاره نامعتبر است");
    }

    return mutate((draft) => {
      /* ---------- مشتری: موجود را پیدا کن یا همین‌جا بساز ---------- */
      let customer: Customer;
      if (input.customer.id) {
        const found = draft.customers.find((c) => c.id === input.customer.id);
        if (!found) throw new Error("مشتری پیدا نشد — دوباره جستجو کنید");
        customer = found;
      } else {
        const name = (input.customer.name ?? "").trim().replace(/\s+/g, " ");
        const phone = (input.customer.phone ?? "").trim().replace(/\s/g, "");
        if (!name) throw new Error("نام و نام خانوادگی مشتری را وارد کنید");
        if (!/^0\d{10}$/.test(phone)) throw new Error("شماره تماس باید ۱۱ رقمی و با ۰ شروع شود");
        const dup = draft.customers.find((c) => c.phone === phone);
        if (dup) {
          throw new Error(`«${dup.name}» با همین شماره ثبت شده — او را از نتایج جستجو انتخاب کنید`);
        }
        customer = {
          id: uid(),
          name,
          phone,
          idNumber: "",
          note: "",
          completedHours: 0,
          discountUses: [],
          createdAt: Date.now(),
        };
        draft.customers.push(customer);
        auditService.log(draft, "ثبت مشتری", "customer", customer.id, `${name} — ${phone}`);
      }

      for (const c of draft.categories) {
        if (!c.active && items.some((i) => i.categoryId === c.id)) {
          throw new Error(`دسته «${c.name}» غیرفعال است`);
        }
      }

      /* ---------- بررسی موجودی قبل از هر تغییری — اتمیک ---------- */
      for (const it of items) {
        const cat = draft.categories.find((c) => c.id === it.categoryId);
        if (!cat) throw new Error("دسته دوچرخه پیدا نشد");
        const avail = availabilityService.availableCount(draft, it.categoryId);
        if (it.qty > avail) {
          throw new Error(
            avail === 0
              ? `«${cat.name}» در حال حاضر موجود نیست`
              : `موجودی «${cat.name}» کافی نیست — فقط ${faNum(avail)} دستگاه موجود است`
          );
        }
      }

      /* ---------- تخفیف روی کل فاکتور (انتخاب فروشنده یا پاداش مشتری) ---------- */
      const rewardEligible = customer.completedHours >= draft.settings.rewardThresholdHours;
      let discountRate = Math.max(0, Math.min(90, Math.round(input.discountRate)));
      const isReward = input.consumeReward && rewardEligible;
      if (isReward) discountRate = draft.settings.rewardDiscountPercent;
      const quote = pricingService.quote(draft, items, input.hours, 0);
      const discount = Math.round((quote.subtotal * discountRate) / 100);

      const now = Date.now();
      const rental: Rental = {
        id: uid(),
        number: draft.seq.rental++,
        customerId: customer.id,
        items: quote.lines.map((l) => ({
          categoryId: l.categoryId,
          code: l.code,
          name: l.name,
          qty: l.qty,
          returnedQty: 0,
          hourlyRate: l.hourlyRate,
          deposit: 0,
        })),
        startAt: input.startAt || now,
        hours: input.hours,
        plannedEndAt: (input.startAt || now) + input.hours * 3_600_000,
        actualEndAt: null,
        subtotal: quote.subtotal,
        discount,
        discountRate,
        discountAuto: isReward,
        lateFee: 0,
        depositTotal: 0,
        total: quote.subtotal - discount,
        status: "ACTIVE",
        note: input.note.trim(),
        cancelledAt: null,
        cancelReason: "",
        createdBy: me.id,
        createdAt: now,
      };

      /* ---------- تخصیص دوچرخه‌های فیزیکی ---------- */
      for (const it of items) {
        const free = draft.bikes
          .filter(
            (b) =>
              b.categoryId === it.categoryId &&
              b.status === "AVAILABLE" &&
              b.availableAt <= now
          )
          .sort((a, b) => a.serial.localeCompare(b.serial))
          .slice(0, it.qty);
        if (free.length < it.qty) {
          throw new Error("هم‌زمانی تراکنش — موجودی کافی نیست، دوباره تلاش کنید");
        }
        for (const bike of free) {
          bike.status = "RENTED";
          bike.rentalId = rental.id;
        }
      }

      draft.rentals.unshift(rental);

      /* ---------- بستانکاری قبلی مشتری روی همین فاکتور خرج می‌شود ---------- */
      let usedCredit = 0;
      if (input.useCredit !== false) {
        usedCredit = balanceService.applyCreditTo(draft, rental);
      }

      /* ---------- پیش‌پرداخت قبل از تحویل (هم‌تراکنش با اجاره) ---------- */
      let settledDebt = 0;
      if (input.prepayAmount > 0) {
        const remaining = Math.max(0, rental.total - paymentService.paidFor(draft, rental.id));
        const rentPart = Math.min(Math.round(input.prepayAmount), remaining);
        if (rentPart > 0) {
          paymentService.applyPayment(draft, {
            rentalId: rental.id,
            kind: "RENT",
            amount: rentPart,
            accountId: input.accountId,
            note: "پرداخت قبل از تحویل",
          });
        }
        /* مازاد: اول بدهی فاکتورهای قبلی، بعد بستانکاری */
        let extra = Math.round(input.prepayAmount) - rentPart;
        if (extra > 0) {
          const left = balanceService.settleDebt(draft, customer.id, extra, input.accountId, rental.id);
          settledDebt = extra - left;
          extra = left;
        }
        if (extra > 0) {
          balanceService.addCredit(draft, rental.id, extra, input.accountId, "اضافه‌دریافت هنگام اجاره");
        }
      }

      /* ---------- مصرف پاداش فقط بعد از ثبت موفق اجاره ----------
         ساعت‌های اضافه‌تر از حد نصاب سوخت نمی‌شوند و برای دور بعد ذخیره می‌مانند */
      if (isReward) {
        const threshold = draft.settings.rewardThresholdHours;
        const carry = Math.max(0, Math.round((customer.completedHours - threshold) * 100) / 100);
        customer.completedHours = carry;
        customer.discountUses.unshift({
          at: now,
          rentalId: rental.id,
          rentalNumber: rental.number,
        });
        auditService.log(
          draft,
          "مصرف تخفیف پاداش",
          "customer",
          customer.id,
          `${customer.name} — ${faNum(discountRate)}٪ تخفیف روی اجاره #${faNum(rental.number)} اعمال شد${
            carry > 0 ? ` — ${faNum(carry)} ساعت اضافه برای دور بعد ذخیره شد` : " — شمارنده صفر شد"
          }`
        );
      }


      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "ایجاد اجاره",
          "rental",
          rental.id,
          `اجاره #${faNum(rental.number)} — ${rental.items
            .map((i) => `${faNum(i.qty)} × ${i.name}`)
            .join("، ")} برای ${customer.name}${
            input.prepayAmount > 0 ? ` — پیش‌پرداخت ${faNum(input.prepayAmount)} تومان` : " — بدون پیش‌پرداخت"
          }${usedCredit > 0 ? ` — مصرف بستانکاری ${faNum(usedCredit)} تومان` : ""}${
            settledDebt > 0 ? ` — تسویه بدهی قبلی ${faNum(settledDebt)} تومان` : ""
          }`
        )
      );
      return rental;
    });
  },

  /** لغو اجاره — موجودی آزاد می‌شود، رکورد برای همیشه حفظ می‌شود */
  cancelRental(rentalId: string, reason: string): Rental {
    const me = authService.requireUser();
    requirePerm(me, "rental.create");
    return mutate((draft) => {
      const rental = draft.rentals.find((r) => r.id === rentalId);
      if (!rental) throw new Error("اجاره پیدا نشد");
      if (rental.status !== "ACTIVE") {
        throw new Error("فقط اجاره فعال قابل لغو است");
      }
      for (const bike of draft.bikes) {
        if (bike.rentalId === rental.id) {
          bike.status = "AVAILABLE";
          bike.rentalId = null;
          bike.availableAt = 0;
        }
      }
      rental.status = "CANCELLED";
      rental.cancelledAt = Date.now();
      rental.cancelReason = reason.trim();

      /* اگر تخفیف پاداش مصرف شده بود، لغو آن را «مصرف‌نشده» برمی‌گرداند */
      if (rental.discountAuto && rental.discountRate > 0) {
        const c = draft.customers.find((x) => x.id === rental.customerId);
        if (c) {
          c.discountUses = c.discountUses.filter((u) => u.rentalId !== rental.id);
          /* حد نصاب مصرف‌شده برمی‌گردد و ساعت‌های ذخیره‌شده هم حفظ می‌شوند */
          c.completedHours =
            Math.round((c.completedHours + draft.settings.rewardThresholdHours) * 100) / 100;

          auditService.log(
            draft,
            "بازگشت تخفیف به‌دلیل لغو",
            "customer",
            c.id,
            `${c.name} دوباره واجد تخفیف ${faNum(rental.discountRate)}٪ شد`
          );
        }
      }

      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "لغو اجاره",
          "rental",
          rental.id,
          `اجاره #${faNum(rental.number)} لغو شد${reason.trim() ? ` — دلیل: ${reason.trim()}` : ""}`
        )
      );
      return rental;
    });
  },
};
