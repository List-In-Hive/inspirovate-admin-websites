"use client";
import dynamic from "next/dynamic";
const Admin = dynamic(() => import("./AdminApp"), {
  ssr: false,
  loading: () => <p style={{ padding: 40 }}>Loading Inspirovate…</p>,
});
export default Admin;
