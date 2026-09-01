// @ts-nocheck
import { useMemo, useState, type ReactNode } from "react";
import type { Category } from "../domain/models";
import { navigate, useAuth, useNow } from "../state/app";
import { can } from "../services/authService";
import { availabilityService } from "../services/availabilityService";
import { inventoryService } from "../services/inventoryService";
import { useDB } from "../storage/storage";
import { countdown, faNum, money } from "../utils/format";
import { Badge, Btn, Modal, useToast } from "../ui/kit";
import { MoneyInput, moneyValue } from "../ui/money";
import {
  IconBox,
  IconEdit,
  IconMinus,
  IconPlus,
  IconWrench,
} from "../ui/icons";

export default function Bikes() {
  const db = useDB();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(15_000);
  const isManager = can(user, "inventory.manage");

  const [addOpen, setAddOpen] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);

  const counts = useMemo(
    () =>
      db.categories.map((cat) => ({
        cat,
        ...availabilityService.countsFor(db, cat.id),
      })),
    [db]
  );

  function changeStock(catId: string, delta: number) {
    try {
      if (delta > 0) inventoryService.increaseStock(catId, delta);
      else inventoryService.decreaseStock(catId, -delta);
      toast.push("ok", delta > 0 ? `${faNum(delta)} دستگاه اضافه شد` : `${faNum(-delta)} دستگاه کسر شد`);
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "تغییر موجودی ناموفق بود");
    }
  }

  function toggleService(bikeId: string, out: boolean) {
    try {
      inventoryService.setOutOfService(bikeId, out);
      toast.push("ok", out ? "دوچرخه از سرویس خارج شد" : "دوچرخه به سرویس برگشت");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "عملیات ناموفق بود");
    }
  }

  const rentedBikes = db.bikes.filter((b) => b.status === "RENTED");
  const maintBikes = db.bikes.filter((b) => b.status === "MAINTENANCE");
  const outBikes = db.bikes.filter((b) => b.status === "OUT_OF_SERVICE");

  return (
    <div className="space-y-4">
      {/* مدیریت موجودی */}
      <section className="anim-up card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <IconBox size={19} className="text-branddeep" />
            موجودی دسته‌ها
          </h2>
          {isManager && (
            <Btn size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus size={15} />
              دسته جدید
            </Btn>
          )}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          {counts.map(({ cat, total, available, rented, maintenance, outOfService }, i) => (
            <div
              key={cat.id}
              style={{ animationDelay: `${i * 45}ms` }}
              className={`anim-up rounded-xl border p-3.5 transition-colors ${cat.active ? "border-line" : "border-dashed border-linedeep opacity-70"}`}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-coal font-display text-base text-white">{cat.code}</span>
                {!cat.active && <Badge tone="neutral">غیرفعال</Badge>}
              </div>
              <p className="mt-2 text-sm font-extrabold text-ink">{cat.name}</p>
              <p className="num text-[11px] text-inkmute">{money(cat.hourlyRate)}/ساعت</p>
              <div className="num mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-bold">
                <span className="rounded-lg bg-black/[0.04] py-1.5">
                  <span className="block font-display text-base text-ink">{faNum(total)}</span>
                  کل
                </span>
                <span className="rounded-lg bg-oksoft py-1.5 text-ok">
                  <span className="block font-display text-base">{faNum(available)}</span>
                  آزاد
                </span>
                <span className="rounded-lg bg-brandsoft py-1.5 text-branddeep">
                  <span className="block font-display text-base">{faNum(rented)}</span>
                  اجاره
                </span>
                <span className="rounded-lg bg-warnsoft py-1.5 text-[#b45309]">
                  <span className="block font-display text-base">{faNum(maintenance + outOfService)}</span>
                  تعمیر/خارج
                </span>
              </div>
              {isManager && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    onClick={() => changeStock(cat.id, -1)}
                    className="grid size-7 cursor-pointer place-items-center rounded-lg border border-linedeep text-inksoft transition-colors hover:border-danger hover:text-danger"
                    title="کاهش یک دستگاه"
                  >
                    <IconMinus size={13} />
                  </button>
                  <button
                    onClick={() => changeStock(cat.id, 1)}
                    className="grid size-7 cursor-pointer place-items-center rounded-lg border border-linedeep text-inksoft transition-colors hover:border-ok hover:text-ok"
                    title="افزایش یک دستگاه"
                  >
                    <IconPlus size={13} />
                  </button>
                  <button
                    onClick={() => changeStock(cat.id, 5)}
                    className="num h-7 cursor-pointer rounded-lg border border-linedeep px-2 text-[11px] font-bold text-inksoft transition-colors hover:border-ok hover:text-ok"
                    title="افزایش پنج دستگاه"
                  >
                    +{faNum(5)}
                  </button>
                  <button
                    onClick={() => setEditCat(cat)}
                    className="ms-auto cursor-pointer rounded-lg p-1.5 text-inkmute transition-colors hover:bg-black/5 hover:text-ink"
                    title="ویرایش دسته"
                  >
                    <IconEdit size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* تابلوی وضعیت فیزیکی */}
      <section className="grid items-start gap-4 lg:grid-cols-3">
        <StatusColumn
          title="در حال اجاره"
          tone="brand"
          bikes={rentedBikes}
          emptyText="هیچ دوچرخه‌ای بیرون نیست"
          render={(b) => {
            const r = db.rentals.find((x) => x.id === b.rentalId);
            const c = r ? db.customers.find((x) => x.id === r.customerId) : null;
            const cd = r ? countdown(r.plannedEndAt, now) : null;
            return (
              <>
                <span className="block truncate text-xs font-extrabold text-ink">
                  {c?.name ?? "—"}
                  <span className="num ms-1.5 font-display text-[11px] text-inkmute">#{r ? faNum(r.number) : ""}</span>
                </span>
                {cd && (
                  <span className={`num text-[11px] font-bold ${cd.overdue ? "text-danger" : "text-inksoft"}`}>{cd.label}</span>
                )}
              </>
            );
          }}
        />
        <StatusColumn
          title="در حال تعمیر"
          tone="warn"
          bikes={maintBikes}
          emptyText="همه سالم‌اند — تعمیراتی نیست"
          render={(b) => {
            const m = db.maintenances.find((x) => x.id === b.maintenanceId);
            return (
              <>
                <span className="block truncate text-xs font-extrabold text-ink">{m?.reason ?? "—"}</span>
                {m && (
                  <span className="num text-[11px] text-inksoft">
                    از {faNum(Math.max(1, Math.round((now - m.startedAt) / 3_600_000)))} ساعت پیش
                  </span>
                )}
              </>
            );
          }}
          footer={
            can(user, "maintenance.manage") ? (
              <Btn variant="outline" size="sm" className="w-full" onClick={() => navigate("maintenance")}>
                <IconWrench size={14} />
                مدیریت تعمیرات
              </Btn>
            ) : undefined
          }
        />
        <StatusColumn
          title="خارج از سرویس"
          tone="neutral"
          bikes={outBikes}
          emptyText="همه دوچرخه‌ها در سرویس‌اند"
          render={(b) => (
            <span className="block text-xs text-inksoft">{b.note || "خروج موقت"}</span>
          )}
          actionFor={
            can(user, "bikes.service")
              ? (bikeId) => toggleService(bikeId, false)
              : undefined
          }
          actionLabel="بازگشت به سرویس"
        />
      </section>

      <AddCategoryModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditCategoryModal cat={editCat} onClose={() => setEditCat(null)} />
    </div>
  );
}

function StatusColumn({
  title,
  tone,
  bikes,
  emptyText,
  render,
  footer,
  actionFor,
  actionLabel,
}: {
  title: string;
  tone: "brand" | "warn" | "neutral";
  bikes: ReturnType<typeof useDB>["bikes"];
  emptyText: string;
  render: (b: ReturnType<typeof useDB>["bikes"][number]) => ReactNode;
  footer?: ReactNode;
  actionFor?: (bikeId: string) => void;
  actionLabel?: string;
}) {
  return (
    <div className="anim-up card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="font-display text-base text-ink">{title}</h3>
        <Badge tone={tone}>{faNum(bikes.length)}</Badge>
      </div>
      <div className="max-h-72 space-y-1.5 overflow-y-auto p-3">
        {bikes.length === 0 ? (
          <p className="py-6 text-center text-xs font-bold text-inkmute">{emptyText}</p>
        ) : (
          bikes.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-coal font-display text-xs text-white">
                {b.serial}
              </span>
              <div className="min-w-0 flex-1">{render(b)}</div>
              {actionFor && (
                <button
                  onClick={() => actionFor(b.id)}
                  className="cursor-pointer rounded-lg bg-oksoft px-2 py-1 text-[11px] font-bold text-ok transition-colors hover:bg-ok hover:text-white"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          ))
        )}
      </div>
      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </div>
  );
}

function AddCategoryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ code: "", name: "", hourlyRate: "" });

  function submit() {
    try {
      inventoryService.addCategory({
        code: form.code,
        name: form.name,
        hourlyRate: moneyValue(form.hourlyRate),
      });
      toast.push("ok", `دسته «${form.name}» اضافه شد — حالا موجودی‌اش را افزایش دهید`);
      onClose();
      setForm({ code: "", name: "", hourlyRate: "" });
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "افزودن دسته ناموفق بود");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="دسته دوچرخه جدید">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">کد دسته (انگلیسی) *</label>
            <input className="inp" dir="ltr" style={{ textAlign: "left" }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="F" maxLength={2} />
          </div>
          <div>
            <label className="lbl">نام دسته *</label>
            <input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="کوهستان" />
          </div>
          <div>
            <label className="lbl">نرخ ساعتی (تومان) *</label>
            <MoneyInput value={form.hourlyRate} onChange={(v) => setForm({ ...form, hourlyRate: v })} />
          </div>
        </div>
        <p className="text-[11px] leading-5 text-inkmute">
          کد، شناسه دسته است (نه دوچرخه فیزیکی). شماره سریال دستگاه‌ها خودکار از همین کد ساخته می‌شود — مثل F-01
        </p>
        <Btn data-enter-submit className="w-full" onClick={submit}>
          <IconPlus size={15} />
          افزودن دسته
        </Btn>
      </div>
    </Modal>
  );
}

function EditCategoryModal({ cat, onClose }: { cat: Category | null; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", hourlyRate: "" });
  const [key, setKey] = useState("");

  if (cat && key !== cat.id) {
    setKey(cat.id);
    setForm({ name: cat.name, hourlyRate: String(cat.hourlyRate) });
  }

  function submit() {
    if (!cat) return;
    try {
      inventoryService.updateCategory(cat.id, {
        name: form.name,
        hourlyRate: moneyValue(form.hourlyRate),
      });
      toast.push("ok", "دسته به‌روزرسانی شد");
      onClose();
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ویرایش ناموفق بود");
    }
  }

  function toggleActive() {
    if (!cat) return;
    try {
      inventoryService.updateCategory(cat.id, { active: !cat.active });
      toast.push("ok", cat.active ? "دسته غیرفعال شد — در فرم اجاره نمایش داده نمی‌شود" : "دسته فعال شد");
      onClose();
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "عملیات ناموفق بود");
    }
  }

  return (
    <Modal open={!!cat} onClose={onClose} title={`ویرایش دسته ${cat?.code ?? ""}`}>
      <div className="space-y-3">
        <div>
          <label className="lbl">نام دسته</label>
          <input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="lbl">نرخ ساعتی</label>
          <MoneyInput value={form.hourlyRate} onChange={(v) => setForm({ ...form, hourlyRate: v })} />
        </div>
        <div className="flex gap-2">
          <Btn data-enter-submit className="flex-1" onClick={submit}>ذخیره تغییرات</Btn>
          <Btn variant={cat?.active ? "danger" : "ok"} className="flex-1" onClick={toggleActive}>
            {cat?.active ? "غیرفعال‌سازی دسته" : "فعال‌سازی دسته"}
          </Btn>
        </div>
        <p className="text-[11px] leading-5 text-inkmute">
          قیمت‌های اجاره‌های قبلی دست نمی‌خورند — قیمت در لحظه اجاره در سند ذخیره می‌شود
        </p>
      </div>
    </Modal>
  );
}
