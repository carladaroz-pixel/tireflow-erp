import type { Metadata } from "next";
import { platformConfig } from "@/lib/tireflow-config";
import "./tireflow.css";

export const metadata: Metadata = {
  title: `${platformConfig.productName} ${platformConfig.productSuffix}`,
  description: platformConfig.description,
};

export default function TireFlowLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
