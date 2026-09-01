// @ts-nocheck
/** مدیریت دسته‌ها و موجودی فیزیکی — فقط مدیر */
import type { Category, DB } from "../domain/models";
import { mutate } from "../storage/storage";
import { faNum } from "../utils/format";
import { uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";

function nextSerial(draft: DB, code: string): string {
  let max = 0;
  for (const b of draft.bikes) {
    if (b.serial.startsWith(`${code}-`)) {
      const n = parseInt(b.serial.slice(code.length + 1), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${code}-${String(max + 1).padStart(2, "0")}`;
}

export const inventoryService = {
  addCategory(input: {
    code: string;
    name: string;
    hourlyRate: number;
  }): Category {
    requirePerm(authService.requireUser(), "inventory.manage");
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!/^[A-Z][A-Z0-9]?$/.test(code)) {
      throw new Error("کد دسته باید یک حرف انگلیسی باشد — مثل F");
    }
    if (!name) throw new Error("نام دسته الزامی است");
    if (input.hourlyRate <= 0) throw new Error("نرخ ساعتی باید بزرگ‌تر از صفر باشد");
    return mutate((draft) => {
      if (draft.categories.some((c) => c.code === code)) {
        throw new Error(`کد «${code}» قبلاً استفاده شده است`);
      }
      const cat: Category = {
        id: uid(),
        code,
        name,
        hourlyRate: input.hourlyRate,
        deposit: 0,
        active: true,
        createdAt: Date.now(),
      };
      draft.categories.push(cat);
      authService.withActor(draft, (d) =>
        auditService.log(d, "افزودن دسته دوچرخه", "category", cat.id, `${code} — ${name}`)
      );
      return cat;
    });
  },

  updateCategory(
    id: string,
    patch: Partial<Pick<Category, "name" | "hourlyRate" | "deposit" | "active">>
  ): void {
    requirePerm(authService.requireUser(), "inventory.manage");
    mutate((draft) => {
      const cat = draft.categories.find((c) => c.id === id);
      if (!cat) throw new Error("دسته پیدا نشد");
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new Error("نام دسته نمی‌تواند خالی باشد");
        cat.name = patch.name.trim();
      }
      if (patch.hourlyRate !== undefined) {
        if (patch.hourlyRate <= 0) throw new Error("نرخ ساعتی نامعتبر است");
        cat.hourlyRate = patch.hourlyRate;
      }
      if (patch.deposit !== undefined) cat.deposit = Math.max(0, patch.deposit);
      if (patch.active !== undefined) cat.active = patch.active;
      authService.withActor(draft, (d) =>
        auditService.log(d, "ویرایش دسته", "category", id, `${cat.code} — ${cat.name}${patch.active === false ? " (غیرفعال شد)" : patch.active === true ? " (فعال شد)" : ""}`)
      );
    });
  },

  increaseStock(categoryId: string, amount: number): void {
    requirePerm(authService.requireUser(), "inventory.manage");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("تعداد افزایش نامعتبر است");
    mutate((draft) => {
      const cat = draft.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error("دسته پیدا نشد");
      for (let i = 0; i < amount; i++) {
        draft.bikes.push({
          id: uid(),
          serial: nextSerial(draft, cat.code),
          categoryId,
          status: "AVAILABLE",
          rentalId: null,
          maintenanceId: null,
          availableAt: 0,
          note: "",
          createdAt: Date.now(),
        });
      }
      authService.withActor(draft, (d) =>
        auditService.log(d, "افزایش موجودی", "inventory", categoryId, `${cat.code} — ${cat.name}: +${faNum(amount)} دستگاه`)
      );
    });
  },

  /** کاهش موجودی فقط تا سقف دستگاه‌های آزادِ داخل فروشگاه مجاز است */
  decreaseStock(categoryId: string, amount: number): void {
    requirePerm(authService.requireUser(), "inventory.manage");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("تعداد کاهش نامعتبر است");
    mutate((draft) => {
      const cat = draft.categories.find((c) => c.id === categoryId);
      if (!cat) throw new Error("دسته پیدا نشد");
      const removable = draft.bikes.filter(
        (b) =>
          b.categoryId === categoryId &&
          (b.status === "AVAILABLE" || b.status === "OUT_OF_SERVICE")
      );
      if (removable.length < amount) {
        throw new Error(
          `امکان کاهش نیست — فقط ${faNum(removable.length)} دستگاه «${cat.name}» در فروشگاه آزاد است`
        );
      }
      const toRemove = removable.slice(0, amount);
      const ids = new Set(toRemove.map((b) => b.id));
      draft.bikes = draft.bikes.filter((b) => !ids.has(b.id));
      authService.withActor(draft, (d) =>
        auditService.log(d, "کاهش موجودی", "inventory", categoryId, `${cat.code} — ${cat.name}: −${faNum(amount)} دستگاه`)
      );
    });
  },

  /** خروج موقت از سرویس / بازگشت به سرویس */
  setOutOfService(bikeId: string, out: boolean): void {
    requirePerm(authService.requireUser(), "bikes.service");
    mutate((draft) => {
      const bike = draft.bikes.find((b) => b.id === bikeId);
      if (!bike) throw new Error("دوچرخه پیدا نشد");
      if (out) {
        if (bike.status !== "AVAILABLE") {
          throw new Error("فقط دوچرخه آزاد را می‌توان از سرویس خارج کرد");
        }
        bike.status = "OUT_OF_SERVICE";
      } else {
        if (bike.status !== "OUT_OF_SERVICE") {
          throw new Error("این دوچرخه خارج از سرویس نیست");
        }
        bike.status = "AVAILABLE";
        bike.availableAt = 0;
      }
      authService.withActor(draft, (d) =>
        auditService.log(d, out ? "خروج از سرویس" : "بازگشت به سرویس", "bike", bikeId, bike.serial)
      );
    });
  },
};
