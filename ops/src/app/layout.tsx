import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Rail } from "@/components/rail";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Growth desk",
  description: "Approvals, vendor knowledge base and ROI for the Occasion agent team",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${archivo.variable} antialiased`}>
      <body className="min-h-dvh md:flex">
        <Rail />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </body>
    </html>
  );
}
