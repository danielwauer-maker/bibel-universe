import type { Metadata } from "next";
import "./globals.css";
import "./galaxy-engine.css";
import "./hermeneutica-shell.css";

export const metadata: Metadata = {
  title: "Bible Universe",
  description: "Interaktive Bibel-Galaxie und Scripture Knowledge Graph",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
