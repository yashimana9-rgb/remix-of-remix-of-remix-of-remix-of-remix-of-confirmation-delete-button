// @ts-nocheck
/**
 * موتور مرکزی موجودی لحظه‌ای
 * موجودی هر دسته = تعداد دوچرخه‌های فیزیکیِ «در سرویس و آزاد» در همین لحظه.
 * هیچ‌جا عدد موجودی دستی وارد نمی‌شود — همه صفحات از همین سرویس می‌خوانند.
 */
import type { Bike, Category, DB } from "../domain/models";
import { getDB } from "../storage/storage";

export interface CategoryAvailability {
  category: Category;
  available: number;
  total: number;
}

function isFreeAt(bike: Bike, at: number): boolean {
  return bike.status === "AVAILABLE" && bike.availableAt <= at;
}

export const availabilityService = {
  availableCount(db: DB, categoryId: string, at: number = Date.now()): number {
    return db.bikes.filter((b) => b.categoryId === categoryId && isFreeAt(b, at)).length;
  },

  /** اسnapshot لحظه‌ای همه دسته‌های فعال برای پیشخوان و فرم اجاره */
  snapshot(db: DB = getDB(), at: number = Date.now()): CategoryAvailability[] {
    return db.categories
      .filter((c) => c.active)
      .map((category) => ({
        category,
        available: this.availableCount(db, category.id, at),
        total: db.bikes.filter((b) => b.categoryId === category.id).length,
      }));
  },

  countsFor(db: DB, categoryId: string) {
    const bikes = db.bikes.filter((b) => b.categoryId === categoryId);
    const now = Date.now();
    return {
      total: bikes.length,
      available: bikes.filter((b) => isFreeAt(b, now)).length,
      rented: bikes.filter((b) => b.status === "RENTED").length,
      maintenance: bikes.filter((b) => b.status === "MAINTENANCE").length,
      outOfService: bikes.filter((b) => b.status === "OUT_OF_SERVICE").length,
    };
  },
};
