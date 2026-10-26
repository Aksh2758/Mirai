import type { Metadata } from "next";
import "./globals.css";
import "@xterm/xterm/css/xterm.css";
import { Providers } from "./Providers";

export const metadata: Metadata = {
  title: "Nirmaan - Build-to-Hire Platform",
  description: "Identify your engineering role. AI-driven Build-to-Hire platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col">
        <Providers>
          {/* Global header hidden on dashboard/scanner/forge - those pages have their own nav */}
          <main className="flex-1 flex flex-col">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
