// @ts-nocheck
/** تعمیرات — دوچرخه در تعمیر از موجودی قابل‌اجاره خارج است و خودکار برمی‌گردد */
import type { MaintenanceRecord } from "../domain/models";
import { mutate } from "../storage/storage";
import { uid } from "../utils/format";
import { auditService } from "./auditService";
import { authService, requirePerm } from "./authService";

export const maintenanceService = {
  start(bikeId: string, reason: string, note: string): MaintenanceRecord {
    const me = authService.requireUser();
    requirePerm(me, "maintenance.manage");
    if (!reason.trim()) throw new Error("دلیل تعمیر را بنویسید");
    return mutate((draft) => {
      const bike = draft.bikes.find((b) => b.id === bikeId);
      if (!bike) throw new Error("دوچرخه پیدا نشد");
      if (bike.status !== "AVAILABLE") {
        throw new Error(
          bike.status === "RENTED"
            ? "این دوچرخه در اجاره است"
            : bike.status === "MAINTENANCE"
              ? "این دوچرخه از قبل در تعمیر است"
              : "این دوچرخه خارج از سرویس است"
        );
      }
      const rec: MaintenanceRecord = {
        id: uid(),
        bikeId: bike.id,
        serial: bike.serial,
        categoryId: bike.categoryId,
        reason: reason.trim(),
        note: note.trim(),
        cost: 0,
        startedAt: Date.now(),
        endedAt: null,
        status: "OPEN",
        byId: me.id,
      };
      bike.status = "MAINTENANCE";
      bike.maintenanceId = rec.id;
      draft.maintenances.unshift(rec);
      authService.withActor(draft, (d) =>
        auditService.log(d, "شروع تعمیرات", "maintenance", rec.id, `${bike.serial} — ${reason.trim()}`)
      );
      return rec;
    });
  },

  /** بازگشت به سرویس — موجودی بلافاصله بازخوانی می‌شود */
  finish(id: string, cost: number): MaintenanceRecord {
    requirePerm(authService.requireUser(), "maintenance.manage");
    return mutate((draft) => {
      const rec = draft.maintenances.find((m) => m.id === id);
      if (!rec) throw new Error("رکورد تعمیر پیدا نشد");
      if (rec.status !== "OPEN") throw new Error("این تعمیر قبلاً بسته شده است");
      rec.status = "DONE";
      rec.endedAt = Date.now();
      rec.cost = Math.max(0, Math.round(cost));
      const bike = draft.bikes.find((b) => b.id === rec.bikeId);
      if (bike) {
        bike.status = "AVAILABLE";
        bike.maintenanceId = null;
        bike.availableAt = 0;
      }
      authService.withActor(draft, (d) =>
        auditService.log(d, "پایان تعمیرات", "maintenance", id, `${rec.serial} به سرویس برگشت`)
      );
      return rec;
    });
  },
};
