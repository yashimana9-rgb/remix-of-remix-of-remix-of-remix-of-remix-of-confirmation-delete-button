// @ts-nocheck
/** تنظیمات سامانه — فقط مدیر؛ هیچ مقدار قابل‌تنظیمی hard-code نیست */
import type { DurationOption, PaymentAccount, Settings } from "../domain/models";
import { mutate, resetToSeed } from "../storage/storage";
import { uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";

export const settingsService = {
  updateGeneral(patch: Partial<Pick<Settings, "storeName" | "currency" | "graceMinutes" | "releaseDelayMinutes" | "lateMultiplier" | "prepMinutes" | "rewardThresholdHours" | "rewardDiscountPercent" | "receiptTitleMain" | "receiptTitleSub" | "receiptThanks" | "receiptPhone" | "receiptLateRule">>): void {
    requirePerm(authService.requireUser(), "settings.manage");
    mutate((draft) => {
      if (patch.storeName !== undefined) {
        if (!patch.storeName.trim()) throw new Error("نام فروشگاه نمی‌تواند خالی باشد");
        draft.settings.storeName = patch.storeName.trim();
      }
      if (patch.graceMinutes !== undefined) {
        if (patch.graceMinutes < 0) throw new Error("مهلت تأخیر نامعتبر است");
        draft.settings.graceMinutes = patch.graceMinutes;
      }
      if (patch.releaseDelayMinutes !== undefined) {
        if (patch.releaseDelayMinutes < 0) throw new Error("زمان گردش نامعتبر است");
        draft.settings.releaseDelayMinutes = patch.releaseDelayMinutes;
      }
      if (patch.lateMultiplier !== undefined) {
        if (patch.lateMultiplier < 1 || patch.lateMultiplier > 5) {
          throw new Error("ضریب جریمه باید بین ۱ تا ۵ باشد");
        }
        draft.settings.lateMultiplier = patch.lateMultiplier;
      }
      if (patch.prepMinutes !== undefined) {
        if (patch.prepMinutes < 0 || patch.prepMinutes > 5) {
          throw new Error("زمان آماده‌سازی باید بین ۰ تا ۵ دقیقه باشد");
        }
        draft.settings.prepMinutes = patch.prepMinutes;
      }
      if (patch.rewardThresholdHours !== undefined) {
        if (patch.rewardThresholdHours < 1 || patch.rewardThresholdHours > 100) {
          throw new Error("حد نصاب ساعت پاداش نامعتبر است");
        }
        draft.settings.rewardThresholdHours = patch.rewardThresholdHours;
      }
      if (patch.rewardDiscountPercent !== undefined) {
        if (patch.rewardDiscountPercent < 1 || patch.rewardDiscountPercent > 90) {
          throw new Error("درصد تخفیف پاداش باید بین ۱ تا ۹۰ باشد");
        }
        draft.settings.rewardDiscountPercent = patch.rewardDiscountPercent;
      }
      /* متن‌های رسید حرارتی — خالی‌بودن بخش‌های ضروری مجاز نیست */
      const pickTrim = (v: string | undefined, required: boolean): string | null => {
        if (v === undefined) return null;
        const t = v.trim();
        if (required && !t) throw new Error("این بخش از رسید نمی‌تواند خالی باشد");
        return t;
      };
      const tMain = pickTrim(patch.receiptTitleMain, true);
      const tSub = pickTrim(patch.receiptTitleSub, false);
      const tThanks = pickTrim(patch.receiptThanks, false);
      const tPhone = pickTrim(patch.receiptPhone, true);
      const tRule = pickTrim(patch.receiptLateRule, true);
      if (tMain !== null) draft.settings.receiptTitleMain = tMain;
      if (tSub !== null) draft.settings.receiptTitleSub = tSub;
      if (tThanks !== null) draft.settings.receiptThanks = tThanks;
      if (tPhone !== null) draft.settings.receiptPhone = tPhone;
      if (tRule !== null) draft.settings.receiptLateRule = tRule;
      authService.withActor(draft, (d) =>
        auditService.log(d, "تغییر تنظیمات", "settings", "general", "تنظیمات عمومی به‌روزرسانی شد")
      );
    });
  },

  setDurations(durations: DurationOption[]): void {
    requirePerm(authService.requireUser(), "settings.manage");
    if (durations.length === 0) throw new Error("حداقل یک بازه زمانی لازم است");
    mutate((draft) => {
      draft.settings.durations = [...durations].sort((a, b) => a.hours - b.hours);
      authService.withActor(draft, (d) =>
        auditService.log(d, "تغییر بازه‌های اجاره", "settings", "durations", durations.map((x) => x.label).join("، "))
      );
    });
  },

  addAccount(name: string, kind: string): PaymentAccount {
    requirePerm(authService.requireUser(), "settings.manage");
    const trimmed = name.trim();
    if (!trimmed) throw new Error("نام حساب پرداخت الزامی است");
    return mutate((draft) => {
      if (draft.settings.accounts.some((a) => a.name === trimmed)) {
        throw new Error("حسابی با این نام وجود دارد");
      }
      const acc: PaymentAccount = { id: uid(), name: trimmed, kind, active: true };
      draft.settings.accounts.push(acc);
      authService.withActor(draft, (d) =>
        auditService.log(d, "افزودن حساب پرداخت", "account", acc.id, trimmed)
      );
      return acc;
    });
  },

  toggleAccount(id: string): void {
    requirePerm(authService.requireUser(), "settings.manage");
    mutate((draft) => {
      const acc = draft.settings.accounts.find((a) => a.id === id);
      if (!acc) throw new Error("حساب پیدا نشد");
      acc.active = !acc.active;
      authService.withActor(draft, (d) =>
        auditService.log(d, acc.active ? "فعال‌سازی حساب پرداخت" : "غیرفعال‌سازی حساب پرداخت", "account", id, acc.name)
      );
    });
  },

  /** بازنشانی داده‌های نمایشی (خطرناک) */
  resetDemoData(): void {
    requirePerm(authService.requireUser(), "settings.manage");
    resetToSeed();
  },
};
