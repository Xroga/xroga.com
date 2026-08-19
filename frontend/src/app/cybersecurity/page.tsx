import type { Metadata } from "next";
import CybersecurityLanding from "./CybersecurityLanding";

export const metadata: Metadata = {
  title: "Xroga Cybersecurity — Coming 2027",
  description:
    "Xroga AI is exploring the next generation of AI-native cybersecurity. A new security intelligence initiative is in development for 2027.",
  openGraph: {
    title: "Xroga Cybersecurity — Coming 2027",
    description:
      "AI-native cybersecurity intelligence from Xroga. In development for 2027.",
    type: "website",
    url: "https://xroga.com/cybersecurity",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xroga Cybersecurity — Coming 2027",
    description:
      "AI-native cybersecurity intelligence from Xroga. In development for 2027.",
  },
  alternates: {
    canonical: "https://xroga.com/cybersecurity",
  },
};

export default function CybersecurityPage() {
  return <CybersecurityLanding />;
}
