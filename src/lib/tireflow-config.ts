export type TenantBrand = {
  id: string;
  companyName: string;
  tradingName: string;
  document: string;
  address: string;
  phone: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  dangerColor: string;
};

export const platformConfig = {
  productName: "TireFlow",
  productSuffix: "ERP",
  description: "ERP para borracharias e auto centers",
  supportEmail: "suporte@tireflow.demo",
} as const;

// Em produção, esta configuração virá da organização autenticada no banco.
export const demoTenant: TenantBrand = {
  id: "tenant-demo-autocenter",
  companyName: "Auto Center Modelo Ltda.",
  tradingName: "Auto Center Modelo",
  document: "00.000.000/0001-00",
  address: "Av. das Oficinas, 1000 • Centro • Cidade/UF",
  phone: "(00) 0000-0000",
  primaryColor: "#f26a21",
  accentColor: "#15181b",
  dangerColor: "#d83b32",
};

export const demoModules = {
  inventory: true,
  products: true,
  audit: true,
  customers: false,
  vehicles: false,
  sales: false,
  serviceOrders: false,
  finance: false,
  reports: false,
  tools: false,
  scheduling: false,
  warranties: false,
  fraudIntelligence: false,
} as const;
