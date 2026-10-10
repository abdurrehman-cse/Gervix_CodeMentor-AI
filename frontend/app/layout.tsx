import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "CodeMentor AI", description: "Understand your code, one hint at a time.", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#181a20" };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
