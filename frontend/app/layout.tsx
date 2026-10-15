import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bible Universe",
  description: "Interactive Scripture Knowledge Graph",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
