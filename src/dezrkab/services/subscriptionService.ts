// @ts-nocheck
/**
 * اشتراک‌ها — بسته ساعتی اجاره دوچرخه برای یک مشتری.
 * مشتری تعداد ساعت می‌خرد (با تخفیف دستی یا پیش‌فرض) و هر روز
 * ساعت رفت و برگشت خود را ثبت می‌کند؛ ساعت مصرفی از مانده کم می‌شود.
 */
import type { DB, Payment, Subscription, SubscriptionSession } from "../domain/models";
import { mutate } from "../storage/storage";
import { faNum, money, uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";

export const SUB_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "فعال",
  FINISHED: "تمام‌شده",
  CANCELLED: "لغوشده",
};

/** درصدهای تخفیف پیش‌فرض روی کل هزینه اشتراک */
export const DISCOUNT_PRESETS = [0, 10, 20, 30, 40, 50];

/** گزینه‌های آماده مدت اعتبار (روز) */
export const VALIDITY_PRESETS = [30, 60, 90, 180, 365];

export const DAY_MS = 86_400_000;

function round(n: number): number {
  return Math.round(n);
}

/** محاسبه مبالغ اشتراک — همیشه از همین‌جا تا در UI و سرویس یکسان بماند */
export function quoteSubscription(hours: number, hourlyRate: number, discountPercent: number) {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const rate = Number.isFinite(hourlyRate) ? Math.max(0, hourlyRate) : 0;
  const pct = Math.max(0, Math.min(100, Math.round(discountPercent || 0)));
  const subtotal = round(h * rate);
  const discount = round((subtotal * pct) / 100);
  return { subtotal, discount, total: subtotal - discount, percent: pct };
}

/** «۰۹:۳۰» یا «9:30» → دقیقه از نیمه‌شب */
export function timeToMinutes(value: string): number | null {
  const s = String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/** آیا اعتبار زمانی اشتراک تمام شده است؟ (اشتراک‌های قدیمیِ بدون تاریخ پایان هرگز منقضی نمی‌شوند) */
export function isExpired(sub: Subscription, now = Date.now()): boolean {
  return !!sub.expiresAt && now >= sub.expiresAt;
}

export function remainingHours(sub: Subscription): number {
  return Math.round((sub.totalHours - sub.usedHours) * 100) / 100;
}

/** آیا اشتراک همین حالا قابل استفاده است؟ */
export function isUsable(sub: Subscription, now = Date.now()): boolean {
  return sub.status === "ACTIVE" && !isExpired(sub, now) && remainingHours(sub) > 0;
}


/** ساخت ردیف‌های اشتراک با قیمت واقعی دسته‌ها */
export function buildItems(db: DB, picked: Array<{ categoryId: string; qty: number }>) {
  return picked
    .filter((p) => p.qty > 0)
    .map((p) => {
      const cat = db.categories.find((c) => c.id === p.categoryId);
      if (!cat) throw new Error("دسته دوچرخه پیدا نشد");
      if (!cat.active) throw new Error(`دسته «${cat.name}» غیرفعال است`);
      return {
        categoryId: cat.id,
        code: cat.code,
        name: cat.name,
        qty: Math.max(1, Math.round(p.qty)),
        hourlyRate: cat.hourlyRate,
      };
    });
}

/** مجموع نرخ ساعتی ردیف‌ها */
export function itemsRate(items: Array<{ qty: number; hourlyRate: number }>): number {
  return items.reduce((s, i) => s + i.qty * i.hourlyRate, 0);
}


export const subscriptionService = {
  create(input: {
    name: string;
    phone: string;
    idNumber: string;
    planTitle: string;
    hours: number;
    hourlyRate: number;
    discountPercent: number;
    note: string;
    /** حساب دریافت وجه — الزامی؛ پرداخت همان لحظه ثبت می‌شود */
    accountId: string;
    /** مدت اعتبار به روز */
    validDays: number;
    /** دوچرخه‌های اشتراک — تعداد هر دسته */
    items?: Array<{ categoryId: string; qty: number }>;
  }): Subscription {
    const me = authService.requireUser();
    requirePerm(me, "subscription.manage");

    const name = (input.name ?? "").trim().replace(/\s+/g, " ");
    const phone = (input.phone ?? "").trim().replace(/\s/g, "");
    const idNumber = (input.idNumber ?? "").trim();
    const planTitle = (input.planTitle ?? "").trim() || "اشتراک ساعتی";
    const validDays = Math.max(1, Math.round(Number(input.validDays) || 0));
    const picked = (input.items ?? []).filter((i) => i.qty > 0);

    if (!name) throw new Error("نام و نام خانوادگی مشتری را وارد کنید");
    if (!/^0\d{10}$/.test(phone)) throw new Error("شماره تماس باید ۱۱ رقمی و با ۰ شروع شود");
    if (idNumber && !/^\d{10}$/.test(idNumber)) throw new Error("کد ملی باید ۱۰ رقم باشد");
    if (!Number.isFinite(input.hours) || input.hours <= 0) {
      throw new Error("تعداد ساعت اشتراک را وارد کنید");
    }
    if (picked.length === 0) throw new Error("حداقل یک دوچرخه برای اشتراک انتخاب کنید");
    if (!input.accountId) throw new Error("نوع پرداخت (حساب دریافت وجه) را انتخاب کنید");


    return mutate((draft) => {
      const account = draft.settings.accounts.find((a) => a.id === input.accountId);
      if (!account) throw new Error("حساب پرداخت انتخاب‌شده معتبر نیست");
      if (!account.active) throw new Error(`حساب «${account.name}» غیرفعال است`);

      /* قیمت واقعی هر دسته از تنظیمات دسته‌ها خوانده می‌شود */
      const items = buildItems(draft, picked);
      const combinedRate = itemsRate(items);
      const q = quoteSubscription(input.hours, combinedRate, input.discountPercent);
      if (q.total <= 0) throw new Error("مبلغ نهایی اشتراک باید بزرگ‌تر از صفر باشد");


      /* مشتری: اگر با همین شماره وجود دارد استفاده می‌شود، وگرنه ساخته می‌شود */
      let customer = draft.customers.find((c) => c.phone.replace(/\s/g, "") === phone);
      if (!customer) {
        customer = {
          id: uid(),
          name,
          phone,
          idNumber,
          note: "",
          completedHours: 0,
          discountUses: [],
          createdAt: Date.now(),
        };
        draft.customers.push(customer);
        auditService.log(draft, "ثبت مشتری", "customer", customer.id, `${name} — ${phone}`);
      } else {
        if (idNumber) customer.idNumber = idNumber;
        customer.name = name;
      }

      const now = Date.now();
      const subId = uid();
      /* سند پرداخت — همان لحظه ثبت می‌شود تا درآمد فوراً وارد آمار شود */
      const payment: Payment = {
        id: uid(),
        rentalId: null,
        subscriptionId: subId,
        kind: "RENT",
        amount: q.total,
        accountId: account.id,
        note: `اشتراک — ${planTitle} — ${name}`,
        operatorId: me.id,
        createdAt: now,
      };
      draft.payments.push(payment);

      const sub: Subscription = {
        id: subId,
        customerId: customer.id,
        name,
        phone,
        idNumber,
        planTitle,
        totalHours: Math.round(input.hours * 100) / 100,
        usedHours: 0,
        hourlyRate: round(combinedRate),
        items,
        openSession: null,
        discountPercent: q.percent,
        subtotal: q.subtotal,

        discount: q.discount,
        total: q.total,
        status: "ACTIVE",
        note: (input.note ?? "").trim(),
        accountId: account.id,
        paymentId: payment.id,
        validDays,
        expiresAt: now + validDays * DAY_MS,
        sessions: [],
        createdBy: me.id,
        createdAt: now,
      };
      draft.subscriptions.unshift(sub);
      authService.withActor(draft, (d) => {
        auditService.log(
          d,
          "ثبت اشتراک",
          "subscription",
          sub.id,
          `${name} — ${planTitle} ${faNum(sub.totalHours)} ساعت — ${money(sub.total)}${
            q.percent ? ` (${faNum(q.percent)}٪ تخفیف)` : ""
          } — اعتبار ${faNum(validDays)} روز`
        );
        auditService.log(
          d,
          "ثبت پرداخت",
          "payment",
          payment.id,
          `اشتراک ${planTitle} — ${name} — ${money(payment.amount)} — ${account.name}`
        );
      });
      return sub;
    });
  },


  /** ثبت رفت و برگشت روزانه — ساعت مصرف‌شده از مانده کم می‌شود */
  addSession(subscriptionId: string, input: { start: string; end: string; note?: string }): SubscriptionSession {
    requirePerm(authService.requireUser(), "subscription.manage");
    const startMin = timeToMinutes(input.start);
    const endMin = timeToMinutes(input.end);
    if (startMin === null) throw new Error("ساعت رفت نامعتبر است");
    if (endMin === null) throw new Error("ساعت برگشت نامعتبر است");
    if (endMin <= startMin) throw new Error("ساعت برگشت باید بعد از ساعت رفت باشد");
    const hours = Math.round(((endMin - startMin) / 60) * 100) / 100;

    return mutate((draft) => {
      const sub = draft.subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) throw new Error("اشتراک پیدا نشد");
      if (sub.status !== "ACTIVE") throw new Error("این اشتراک فعال نیست");
      if (isExpired(sub)) throw new Error("اعتبار زمانی این اشتراک به پایان رسیده است");
      const remaining = Math.round((sub.totalHours - sub.usedHours) * 100) / 100;
      if (remaining <= 0) throw new Error("مانده اشتراک صفر است");
      if (hours > remaining) {
        throw new Error(`مانده اشتراک فقط ${faNum(remaining)} ساعت است`);
      }
      const session: SubscriptionSession = {
        id: uid(),
        at: Date.now(),
        start: input.start,
        end: input.end,
        hours,
        note: (input.note ?? "").trim(),
        byId: authService.actorId(),
      };
      sub.sessions.unshift(session);
      sub.usedHours = Math.round((sub.usedHours + hours) * 100) / 100;
      if (sub.usedHours >= sub.totalHours - 0.001) sub.status = "FINISHED";
      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "ثبت تردد اشتراک",
          "subscription",
          sub.id,
          `${sub.name} — ${input.start} تا ${input.end} (${faNum(hours)} ساعت) — مانده ${faNum(
            Math.round((sub.totalHours - sub.usedHours) * 100) / 100
          )} ساعت`
        )
      );
      return session;
    });
  },

  /**
   * ثبت «رفت» — دوچرخه‌های اشتراک همین حالا تحویل مشتری می‌شوند و
   * تا لحظه ثبت برگشت از موجودی صفحه اجاره خارج می‌مانند.
   */
  startSession(subscriptionId: string, start: string) {
    requirePerm(authService.requireUser(), "subscription.manage");
    if (timeToMinutes(start) === null) throw new Error("ساعت رفت نامعتبر است");
    return mutate((draft) => {
      const sub = draft.subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) throw new Error("اشتراک پیدا نشد");
      if (sub.status !== "ACTIVE") throw new Error("این اشتراک فعال نیست");
      if (isExpired(sub)) throw new Error("اعتبار زمانی این اشتراک به پایان رسیده است");
      if (sub.openSession) throw new Error("یک تردد باز دارید — ابتدا ساعت برگشت را ثبت کنید");
      if (Math.round((sub.totalHours - sub.usedHours) * 100) / 100 <= 0) {
        throw new Error("مانده اشتراک صفر است");
      }
      const items = (sub.items ?? []).filter((i) => i.qty > 0);
      if (items.length === 0) throw new Error("این اشتراک دوچرخه‌ای ثبت‌شده ندارد");

      const now = Date.now();
      const bikeIds: string[] = [];
      for (const it of items) {
        const free = draft.bikes
          .filter(
            (b) => b.categoryId === it.categoryId && b.status === "AVAILABLE" && b.availableAt <= now
          )
          .sort((a, b) => a.serial.localeCompare(b.serial))
          .slice(0, it.qty);
        if (free.length < it.qty) {
          throw new Error(
            `موجودی «${it.name}» کافی نیست — فقط ${faNum(free.length)} دستگاه آزاد است`
          );
        }
        for (const bike of free) {
          bike.status = "RENTED";
          bike.subscriptionId = sub.id;
          bikeIds.push(bike.id);
        }
      }

      sub.openSession = { id: uid(), start, startAt: now, bikeIds, byId: authService.actorId() };
      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "رفت اشتراک",
          "subscription",
          sub.id,
          `${sub.name} — ساعت ${start} — ${items.map((i) => `${faNum(i.qty)} × ${i.name}`).join("، ")}`
        )
      );
      return sub.openSession;
    });
  },

  /** ثبت «برگشت» — دوچرخه‌ها آزاد و ساعت مصرفی از مانده کم می‌شود */
  endSession(subscriptionId: string, end: string, note?: string): SubscriptionSession {
    requirePerm(authService.requireUser(), "subscription.manage");
    const endMin = timeToMinutes(end);
    if (endMin === null) throw new Error("ساعت برگشت نامعتبر است");

    return mutate((draft) => {
      const sub = draft.subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) throw new Error("اشتراک پیدا نشد");
      const open = sub.openSession;
      if (!open) throw new Error("تردد بازی برای این اشتراک ثبت نشده است");
      const startMin = timeToMinutes(open.start);
      if (startMin === null) throw new Error("ساعت رفت نامعتبر است");
      let diff = endMin - startMin;
      if (diff <= 0) diff += 24 * 60; /* عبور از نیمه‌شب */
      const hours = Math.round((diff / 60) * 100) / 100;
      const remaining = Math.round((sub.totalHours - sub.usedHours) * 100) / 100;
      if (hours > remaining) {
        throw new Error(`مانده اشتراک فقط ${faNum(remaining)} ساعت است`);
      }

      for (const bike of draft.bikes) {
        if (open.bikeIds.includes(bike.id)) {
          bike.status = "AVAILABLE";
          bike.subscriptionId = null;
          bike.availableAt = 0;
        }
      }

      const session: SubscriptionSession = {
        id: open.id,
        at: Date.now(),
        start: open.start,
        end,
        hours,
        note: (note ?? "").trim(),
        byId: authService.actorId(),
      };
      sub.sessions.unshift(session);
      sub.openSession = null;
      sub.usedHours = Math.round((sub.usedHours + hours) * 100) / 100;
      if (sub.usedHours >= sub.totalHours - 0.001) sub.status = "FINISHED";
      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "برگشت اشتراک",
          "subscription",
          sub.id,
          `${sub.name} — ${open.start} تا ${end} (${faNum(hours)} ساعت) — مانده ${faNum(
            Math.round((sub.totalHours - sub.usedHours) * 100) / 100
          )} ساعت`
        )
      );
      return session;
    });
  },



  /**
   * لغو اشتراک — ارزش ساعت‌های مصرف‌نشده با یک سند اصلاحی منفی
   * برگشت می‌خورد تا آمار درآمد دقیقاً با واقعیت بخواند.
   */
  cancel(subscriptionId: string, reason: string): void {
    const me = authService.requireUser();
    requirePerm(me, "subscription.manage");
    mutate((draft) => {
      const sub = draft.subscriptions.find((s) => s.id === subscriptionId);
      if (!sub) throw new Error("اشتراک پیدا نشد");
      if (sub.status === "CANCELLED") throw new Error("این اشتراک قبلاً لغو شده است");
      sub.status = "CANCELLED";
      /* اگر ترددی باز مانده، دوچرخه‌ها آزاد می‌شوند */
      if (sub.openSession) {
        for (const bike of draft.bikes) {
          if (sub.openSession.bikeIds.includes(bike.id)) {
            bike.status = "AVAILABLE";
            bike.subscriptionId = null;
            bike.availableAt = 0;
          }
        }
        sub.openSession = null;
      }


      const remaining = Math.round((sub.totalHours - sub.usedHours) * 100) / 100;
      const refund =
        sub.totalHours > 0 ? Math.round((sub.total * Math.max(0, remaining)) / sub.totalHours) : 0;
      if (refund > 0 && sub.accountId) {
        const payment: Payment = {
          id: uid(),
          rentalId: null,
          subscriptionId: sub.id,
          kind: "CORRECTION",
          amount: -refund,
          accountId: sub.accountId,
          note: `برگشت وجه اشتراک لغوشده — ${sub.name}${reason ? ` — ${reason}` : ""}`,
          operatorId: me.id,
          createdAt: Date.now(),
        };
        draft.payments.push(payment);
      }

      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "لغو اشتراک",
          "subscription",
          sub.id,
          `${sub.name}${reason ? ` — ${reason}` : ""}${refund > 0 ? ` — برگشت ${money(refund)}` : ""}`
        )
      );
    });
  },

  remaining(sub: Subscription): number {
    return remainingHours(sub);
  },

  /** همه اشتراک‌های یک مشتری (جدیدترین اول) */
  forCustomer(db: DB, customerId: string): Subscription[] {
    return (db.subscriptions ?? [])
      .filter((s) => s.customerId === customerId)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * خلاصه وضعیت اشتراک ویژه یک مشتری — برای نمایش در همه بخش‌های مشتری‌محور.
   * اگر اشتراک قابل استفاده نداشته باشد null برمی‌گرداند.
   */
  summaryFor(db: DB, customerId: string | null | undefined, now = Date.now()) {
    if (!customerId) return null;
    const usable = this.forCustomer(db, customerId).filter((s) => isUsable(s, now));
    if (usable.length === 0) return null;
    /* اشتراکی که زودتر منقضی می‌شود اولویت مصرف دارد */
    const sub = [...usable].sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity))[0];
    const remaining = remainingHours(sub);
    const daysLeft = sub.expiresAt ? Math.ceil((sub.expiresAt - now) / DAY_MS) : null;
    return {
      sub,
      planTitle: sub.planTitle,
      remainingHours: remaining,
      totalHours: sub.totalHours,
      usedHours: sub.usedHours,
      expiresAt: sub.expiresAt || null,
      daysLeft,
      /** مجموع ساعت مانده روی همه اشتراک‌های قابل استفاده */
      allRemainingHours: Math.round(usable.reduce((s, x) => s + remainingHours(x), 0) * 100) / 100,
      count: usable.length,
    };
  },
};
