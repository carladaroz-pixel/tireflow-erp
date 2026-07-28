import type { SVGProps } from "react";

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

export const TireFlowIcon = ({ name, className = "h-5 w-5" }: { name: string; className?: string }) => {
  const common = { className };
  if (name === "dashboard") return <Icon {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></Icon>;
  if (name === "box") return <Icon {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></Icon>;
  if (name === "stock") return <Icon {...common}><path d="M3 6h18M5 6v14h14V6M8 10h8M8 14h8"/></Icon>;
  if (name === "move") return <Icon {...common}><path d="M7 7h12l-3-3m3 3-3 3M17 17H5l3 3m-3-3 3-3"/></Icon>;
  if (name === "shield") return <Icon {...common}><path d="M12 3 4.5 6v5.5c0 4.6 3.1 7.8 7.5 9.5 4.4-1.7 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="M12 8v5m0 3h.01"/></Icon>;
  if (name === "users") return <Icon {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>;
  if (name === "bell") return <Icon {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Icon>;
  if (name === "search") return <Icon {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>;
  if (name === "plus") return <Icon {...common}><path d="M12 5v14M5 12h14"/></Icon>;
  if (name === "menu") return <Icon {...common}><path d="M4 6h16M4 12h16M4 18h16"/></Icon>;
  if (name === "chevron") return <Icon {...common}><path d="m9 18 6-6-6-6"/></Icon>;
  if (name === "trend") return <Icon {...common}><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></Icon>;
  if (name === "download") return <Icon {...common}><path d="M12 3v12m-4-4 4 4 4-4M5 21h14"/></Icon>;
  return <Icon {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></Icon>;
};
