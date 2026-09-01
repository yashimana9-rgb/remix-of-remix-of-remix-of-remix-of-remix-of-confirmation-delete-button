// @ts-nocheck
import { useMemo, useState } from "react";
import type { Customer } from "../domain/models";
import { customerService } from "../services/customerService";
import { useDB } from "../storage/storage";
import { faNum, fmtDate, fmtDateTime, isSameDay, money } from "../utils/format";
import { Badge, Btn, Empty, Modal, useToast } from "../ui/kit";
import { STATUS_LABEL } from "../services/rentalService";
import {
  IconEdit,
  IconGift,
  IconIdCard,
  IconPhone,
  IconPlus,
  IconSearch,
  IconUsers,
} from "../ui/icons";
import { SubBanner, SubChip } from "../ui/SubBadge";

export default function Customers() {
  const db = useDB();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", idNumber: "", note: "" });

  const list = useMemo(() => customerService.search(db, q), [db, q]);
  const sel = selected ? db.customers.find((c) => c.id === selected.id) ?? null : null;
  const selStats = sel ? customerService.stats(db, sel.id) : null;
  const selRentals = sel
    ? db.rentals.filter((r) => r.customerId === sel.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];
  const todayCount = db.rentals.filter((r) => isSameDay(r.createdAt, Date.now())).length;

  function openAdd() {
    setForm({ name: "", phone: "", idNumber: "", note: "" });
    setAddOpen(true);
  }

  function saveAdd() {
    try {
      const c = customerService.add(form);
      toast.push("ok", `مشتری «${c.name}» ثبت شد`);
      setAddOpen(false);
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ثبت ناموفق بود");
    }
  }

  function saveEdit() {
    if (!sel) return;
    try {
      customerService.update(sel.id, form);
      toast.push("ok", "اطلاعات مشتری به‌روزرسانی شد");
      setEditMode(false);
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ویرایش ناموفق بود");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-3.5">
        <div className="relative min-w-56 flex-1">
          <input
            className="inp ps-10"
            placeholder="جستجوی فوری با نام یا شماره موبایل…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
            <IconSearch size={17} />
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-inksoft">
          <Badge tone="brand">{faNum(db.customers.length)} مشتری</Badge>
          <Badge tone="neutral">{faNum(todayCount)} اجاره امروز</Badge>
        </div>
        <Btn onClick={openAdd}>
          <IconPlus size={16} />
          مشتری جدید
        </Btn>
      </div>

      <div className="card overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={<IconUsers size={28} />} text="مشتری‌ای پیدا نشد" sub="با «مشتری جدید» اولین مشتری را ثبت کنید" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-black/[0.02] text-start text-[11px] font-bold text-inkmute">
                  <th className="px-4 py-2.5 text-start">مشتری</th>
                  <th className="px-4 py-2.5 text-start">تماس</th>
                  <th className="px-4 py-2.5 text-start">ساعت تکمیل‌شده</th>
                  <th className="px-4 py-2.5 text-start">تخفیف {faNum(db.settings.rewardDiscountPercent)}٪</th>
                  <th className="px-4 py-2.5 text-start">اجاره‌ها</th>
                  <th className="px-4 py-2.5 text-start">آخرین اجاره</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const st = customerService.stats(db, c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelected(c);
                        setEditMode(false);
                      }}
                      className="cursor-pointer transition-colors hover:bg-brandsoft/40"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="grid size-9 place-items-center rounded-full bg-coal font-display text-sm text-white">
                            {c.name.slice(0, 1)}
                          </span>
                          <span className="font-extrabold text-ink">{c.name}</span>
                          <SubChip customerId={c.id} />
                          {c.note && <span className="hidden max-w-40 truncate text-[11px] text-inkmute lg:inline">{c.note}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="num flex items-center gap-1.5 text-inksoft">
                          <IconPhone size={13} className="text-inkmute" />
                          <span dir="ltr">{c.phone}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className="num text-xs font-extrabold text-ink">
                            {faNum(Math.min(st.completedHours, st.threshold))} از {faNum(st.threshold)} ساعت
                          </span>
                          {st.completedHours > st.threshold && (
                            <span className="num rounded-md bg-oksoft px-1.5 py-0.5 text-[10px] font-extrabold text-ok">
                              +{faNum(Math.round((st.completedHours - st.threshold) * 100) / 100)} ذخیره
                            </span>
                          )}
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
                            <span
                              className={`block h-full rounded-full ${st.discountAvailable ? "bg-ok" : "bg-brand"}`}
                              style={{ width: `${Math.min(100, (st.completedHours / st.threshold) * 100)}%` }}
                            />
                          </span>
                        </span>

                      </td>
                      <td className="px-4 py-3">
                        {st.discountAvailable ? (
                          <Badge tone="ok">آماده مصرف</Badge>
                        ) : (
                          <span className="num text-[11px] font-bold text-inkmute">
                            {faNum(st.hoursUntilReward)} ساعت مانده
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={st.count > 3 ? "brand" : "neutral"}>{faNum(st.count)} اجاره</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-inksoft">{st.lastAt ? fmtDate(st.lastAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* جزئیات مشتری */}
      <Modal open={!!sel} onClose={() => setSelected(null)} title={sel?.name ?? ""} wide>
        {sel && selStats && (
          <div className="space-y-4">
            {editMode ? (
              <div className="anim-pop grid gap-3 rounded-xl border border-line bg-black/[0.02] p-3 sm:grid-cols-2">
                <div>
                  <label className="lbl">نام *</label>
                  <input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">موبایل *</label>
                  <input className="inp num" dir="ltr" style={{ textAlign: "left" }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">کد ملی / مدارک</label>
                  <input className="inp num" dir="ltr" style={{ textAlign: "left" }} value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">یادداشت</label>
                  <input className="inp" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Btn data-enter-submit size="sm" onClick={saveEdit}>ذخیره تغییرات</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setEditMode(false)}>انصراف</Btn>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid size-12 place-items-center rounded-full bg-coal font-display text-xl text-white">
                  {sel.name.slice(0, 1)}
                </span>
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
                    <IconPhone size={13} className="text-inkmute" />
                    <span dir="ltr" className="num">{sel.phone}</span>
                  </p>
                  {sel.idNumber && (
                    <p className="num mt-0.5 flex items-center gap-2 text-xs text-inksoft">
                      <IconIdCard size={13} className="text-inkmute" />
                      <span dir="ltr">{sel.idNumber}</span>
                    </p>
                  )}
                  {sel.note && <p className="mt-1 text-xs text-inkmute">{sel.note}</p>}
                </div>
                <div className="flex gap-3 text-center">
                  <div className="rounded-xl bg-brandsoft px-3 py-2">
                    <p className="num font-display text-xl text-branddeep">{faNum(selStats.count)}</p>
                    <p className="text-[10px] font-bold text-branddeep">اجاره</p>
                  </div>
                  <div className="rounded-xl bg-oksoft px-3 py-2">
                    <p className="num font-display text-xl text-ok">{money(selStats.paid)}</p>
                    <p className="text-[10px] font-bold text-ok">پرداخت</p>
                  </div>
                </div>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm({ name: sel.name, phone: sel.phone, idNumber: sel.idNumber, note: sel.note });
                    setEditMode(true);
                  }}
                >
                  <IconEdit size={14} />
                  ویرایش
                </Btn>
              </div>
            )}

            {/* اشتراک ویژه */}
            <SubBanner customerId={sel.id} />

            {/* پاداش و تخفیف */}
            <div className={`rounded-xl border p-3.5 ${selStats.discountAvailable ? "border-ok/40 bg-oksoft/60" : "border-line bg-black/[0.02]"}`}>
              <div className="flex items-center justify-between">
                <h4 className={`flex items-center gap-2 font-display text-base ${selStats.discountAvailable ? "text-ok" : "text-ink"}`}>
                  <IconGift size={17} />
                  پاداش مشتری
                </h4>
                {selStats.discountAvailable ? (
                  <Badge tone="ok">تخفیف {faNum(selStats.discountPercent)}٪ آماده مصرف</Badge>
                ) : (
                  <Badge tone="neutral">{faNum(selStats.hoursUntilReward)} ساعت تا تخفیف</Badge>
                )}
              </div>
              <p className="num mt-1.5 text-xs font-bold text-inksoft">
                اجاره تکمیل‌شده: {faNum(Math.min(selStats.completedHours, selStats.threshold))} از{" "}
                {faNum(selStats.threshold)} ساعت
                {selStats.discountAvailable
                  ? " — روی کل فاکتور بعدی اعمال می‌شود"
                  : ` — هر ${faNum(selStats.threshold)} ساعت، ${faNum(selStats.discountPercent)}٪ تخفیف روی کل فاکتور`}
              </p>
              {selStats.completedHours > selStats.threshold && (
                <p className="num mt-1 text-[11px] font-extrabold text-ok">
                  {faNum(Math.round((selStats.completedHours - selStats.threshold) * 100) / 100)} ساعت اضافه ذخیره شده —
                  پس از مصرف تخفیف، همین ساعت‌ها به شمارنده دور بعد اضافه می‌شود
                </p>
              )}

              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${selStats.discountAvailable ? "bg-ok" : "bg-brand"}`}
                  style={{ width: `${Math.min(100, (selStats.completedHours / selStats.threshold) * 100)}%` }}
                />
              </div>
              {selStats.discountUses.length > 0 && (
                <div className="mt-3 border-t border-line pt-2.5">
                  <p className="text-[11px] font-extrabold text-inksoft">تاریخچه مصرف تخفیف</p>
                  <ul className="mt-1.5 space-y-1">
                    {selStats.discountUses.map((u) => (
                      <li key={u.rentalId} className="num flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-[11px]">
                        <span className="font-extrabold text-ink">اجاره #{faNum(u.rentalNumber)}</span>
                        <span className="text-inkmute">{fmtDateTime(u.at)}</span>
                        <Badge tone="brand">{faNum(selStats.discountPercent)}٪</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-extrabold text-inksoft">تاریخچه اجاره ({faNum(selRentals.length)})</h4>
              {selRentals.length === 0 ? (
                <p className="rounded-xl border border-dashed border-linedeep p-4 text-center text-xs text-inkmute">
                  هنوز اجاره‌ای ثبت نشده
                </p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {selRentals.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <span className="num font-display text-sm text-inksoft">#{faNum(r.number)}</span>
                      <span className="flex-1 truncate text-xs font-bold text-ink">
                        {r.items.map((i) => `${faNum(i.qty)}×${i.name}`).join(" + ")}
                      </span>
                      <span className="num text-[11px] text-inkmute">{fmtDateTime(r.createdAt)}</span>
                      <span className="num text-xs font-extrabold text-ink">{money(r.total)}</span>
                      <Badge
                        tone={r.status === "CANCELLED" ? "danger" : r.status === "SETTLED" || r.status === "COMPLETED" ? "ok" : "brand"}
                      >
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* مشتری جدید */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="مشتری جدید">
        <div className="space-y-3">
          <div>
            <label className="lbl">نام و نام خانوادگی *</label>
            <input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="lbl">موبایل *</label>
            <input className="inp num" dir="ltr" style={{ textAlign: "left" }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09xxxxxxxxx" />
          </div>
          <div>
            <label className="lbl">کد ملی / شماره مدارک</label>
            <input className="inp num" dir="ltr" style={{ textAlign: "left" }} value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
          </div>
          <div>
            <label className="lbl">یادداشت</label>
            <input className="inp" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <Btn data-enter-submit className="w-full" onClick={saveAdd}>
            <IconPlus size={16} />
            ثبت مشتری
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
