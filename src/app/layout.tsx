import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoalBet — AI Football Prediction Market",
  description: "Decentralized football prediction market powered by GenLayer AI Oracle and USDC on Base Sepolia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
