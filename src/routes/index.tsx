import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import App from "@/dezrkab/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دز رکاب — مدیریت اجاره دوچرخه" },
      {
        name: "description",
        content:
          "باشگاه دوچرخه‌سواری دز رکاب؛ سامانه مدیریت اجاره دوچرخه — پیشخوان، مشتریان، پرداخت‌ها، تعمیرات و گزارش‌ها",
      },
      { property: "og:title", content: "دز رکاب — مدیریت اجاره دوچرخه" },
      {
        property: "og:description",
        content:
          "سامانه مدیریت اجاره دوچرخه: ثبت اجاره، برگشت، پرداخت، تعمیرات و گزارش‌گیری",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly>
      <App />
    </ClientOnly>
  );
}
