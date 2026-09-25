import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Inspirovate — контент",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
