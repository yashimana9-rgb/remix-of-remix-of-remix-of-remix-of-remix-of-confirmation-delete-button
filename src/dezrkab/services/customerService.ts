// @ts-nocheck
/** مشتریان — جستجوی فوری با نام/تلفن، بدون مشتری تکراری */
import type { Customer, DB } from "../domain/models";
import { mutate } from "../storage/storage";
import { uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";
import { balanceService } from "./balanceService";

export const customerService = {
  search(db: DB, query: string): Customer[] {
    const q = query.trim().toLowerCase();
    const list = [...db.customers].sort((a, b) => b.createdAt - a.createdAt);
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
  },

  add(input: { name: string; phone: string; idNumber: string; note: string }): Customer {
    requirePerm(authService.requireUser(), "customer.manage");
    const name = input.name.trim();
    const phone = input.phone.trim().replace(/\s/g, "");
    if (!name) throw new Error("نام مشتری الزامی است");
    if (!/^0\d{10}$/.test(phone)) throw new Error("شماره موبایل باید ۱۱ رقمی و با ۰ شروع شود");
    return mutate((draft) => {
      const dup = draft.customers.find((c) => c.phone.replace(/\s/g, "") === phone);
      if (dup) throw new Error(`مشتری تکراری — «${dup.name}» با همین شماره ثبت شده است`);
      const customer: Customer = {
        id: uid(),
        name,
        phone,
        idNumber: input.idNumber.trim(),
        note: input.note.trim(),
        completedHours: 0,
        discountUses: [],
        createdAt: Date.now(),
      };
      draft.customers.push(customer);
      authService.withActor(draft, (d) =>
        auditService.log(d, "ثبت مشتری", "customer", customer.id, `${name} — ${phone}`)
      );
      return customer;
    });
  },

  update(id: string, patch: Partial<Pick<Customer, "name" | "phone" | "idNumber" | "note">>): void {
    requirePerm(authService.requireUser(), "customer.manage");
    mutate((draft) => {
      const c = draft.customers.find((x) => x.id === id);
      if (!c) throw new Error("مشتری پیدا نشد");
      if (patch.phone !== undefined) {
        const phone = patch.phone.trim().replace(/\s/g, "");
        if (!/^0\d{10}$/.test(phone)) throw new Error("شماره موبایل نامعتبر است");
        const dup = draft.customers.find((x) => x.id !== id && x.phone === phone);
        if (dup) throw new Error(`این شماره متعلق به «${dup.name}» است`);
        c.phone = phone;
      }
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new Error("نام مشتری نمی‌تواند خالی باشد");
        c.name = patch.name.trim();
      }
      if (patch.idNumber !== undefined) c.idNumber = patch.idNumber.trim();
      if (patch.note !== undefined) c.note = patch.note.trim();
      authService.withActor(draft, (d) =>
        auditService.log(d, "ویرایش مشتری", "customer", id, c.name)
      );
    });
  },

  stats(db: DB, customerId: string) {
    const rentals = db.rentals.filter((r) => r.customerId === customerId && r.status !== "CANCELLED");
    const cancelled = db.rentals.filter((r) => r.customerId === customerId && r.status === "CANCELLED").length;
    const paid = rentals.reduce((s, r) => {
      return (
        s +
        db.payments
          .filter((p) => p.rentalId === r.id && p.kind !== "DEPOSIT" && p.kind !== "DEPOSIT_REFUND")
          .reduce((x, p) => x + p.amount, 0)
      );
    }, 0);
    const lastAt = rentals.length ? Math.max(...rentals.map((r) => r.createdAt)) : null;
    const customer = db.customers.find((c) => c.id === customerId);
    const completedHours = customer?.completedHours ?? 0;
    const threshold = db.settings.rewardThresholdHours;
    const balance = balanceService.summary(db, customerId);
    return {
      credit: balance.credit,
      debt: balance.debt,
      netBalance: balance.net,
      debtItems: balance.debtItems,
      count: rentals.length,
      cancelled,
      paid,
      lastAt,
      completedHours,
      threshold,
      discountPercent: db.settings.rewardDiscountPercent,
      discountAvailable: completedHours >= threshold,
      hoursUntilReward: Math.max(0, threshold - completedHours),
      discountUses: customer?.discountUses ?? [],
    };
  },
};
