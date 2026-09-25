"use client";
import dynamic from "next/dynamic";
const Admin = dynamic(() => import("./AdminApp"), {
  ssr: false,
  loading: () => <p style={{ padding: 40 }}>Загружаем Inspirovate…</p>,
});
export default Admin;
