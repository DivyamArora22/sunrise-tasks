import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";
export const metadata: Metadata = { title:"Sunrise Tasks", description:"Simple, accountable work for Sunrise Manufacturing" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><AppProvider>{children}</AppProvider></body></html> }
