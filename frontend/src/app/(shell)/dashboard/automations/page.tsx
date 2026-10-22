import type { Metadata } from "next";
import { AutomationsWorkspace } from "@/components/automations/AutomationsWorkspace";

export const metadata: Metadata = {
  title: "Automations | Xroga",
  robots: { index: false, follow: false },
};

export default function AutomationsPage() {
  return <AutomationsWorkspace />;
}
