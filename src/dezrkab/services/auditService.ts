// @ts-nocheck
/** تاریخچه سبک رویدادها — همه تغییرات مهم ردپای قابل پیگیری دارند */
import type { AuditEntry, DB } from "../domain/models";
import { uid } from "../utils/format";

export const auditService = {
  /** داخل mutate صدا زده می‌شود تا رویداد هم‌تراکنش با خود عملیات ثبت شود */
  log(
    draft: DB,
    action: string,
    entity: string,
    entityId: string,
    details: string
  ): void {
    const sessionUserId = draft.__actor ?? "";
    const actor = draft.users.find((u) => u.id === sessionUserId);
    const entry: AuditEntry = {
      id: uid(),
      at: Date.now(),
      actorId: sessionUserId || "system",
      actorName: actor ? actor.name : "سامانه",
      action,
      entity,
      entityId,
      details,
    };
    draft.audit.unshift(entry);
    if (draft.audit.length > 500) draft.audit.length = 500;
  },
};

declare module "../domain/models" {
  interface DB {
    /** شناسه کاربر جاری برای ثبت در audit — توسط authService قبل از mutate ست می‌شود */
    __actor?: string;
  }
}
