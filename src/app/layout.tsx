import type { Metadata } from "next";
import { TireFlowShell } from "@/components/tireflow-shell";
import { platformConfig } from "@/lib/tireflow-config";
import "./tireflow.css";

export const metadata: Metadata = {
  title: `${platformConfig.productName} ${platformConfig.productSuffix} | Demonstração`,
  description: platformConfig.description,
};

export default function TireFlowLayout({ children }: { children: React.ReactNode }) {
  return <TireFlowShell>{children}</TireFlowShell>;
}
