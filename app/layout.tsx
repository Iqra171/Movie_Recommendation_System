import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interactive Explainable Recommender — MovieLens",
  description:
    "A research prototype for human-in-the-loop, explainable collaborative filtering using SVD on the MovieLens dataset. HESTIA Lab, MS Computer Science.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
