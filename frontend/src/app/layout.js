import { Inter, Noto_Sans_Thai, Sarabun } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
});

const sarabun = Sarabun({
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
});

export const metadata = {
  title: "Music Longplay - Visualizer Creator",
  description: "Create premium visualizer videos for long-form music playlists",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`${inter.variable} ${notoSansThai.variable} ${sarabun.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

