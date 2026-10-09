import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Poppins is exposed as a CSS variable so Tailwind's --font-sans can use it.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "XenFlo | Knowledge Builder",
  description:
    "Turn your website into a structured knowledge base that powers your marketing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable goes on <html> (:root) because globals.css defines --font-sans there,
    // and a CSS variable can only reference variables that exist on the same element or above.
    <html lang="en" className={poppins.variable}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
