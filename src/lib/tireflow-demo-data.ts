export type DemoProduct = {
  id: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  measure: string;
  condition: "Novo" | "Usado" | "Recapado";
  stock: number;
  minimum: number;
  cost: number;
  price: number;
  location: string;
  dot: string;
  active: boolean;
};

export type DemoMovement = {
  id: string;
  type: "Entrada" | "Saída" | "Estorno";
  product: string;
  identification: string;
  quantity: number;
  reason: string;
  linkedTo: string;
  employee: string;
  role: string;
  date: string;
  time: string;
  risk: "Normal" | "Atenção" | "Suspeito" | "Crítico";
  value: number;
};

export const demoProducts: DemoProduct[] = [
  { id: "p1", code: "PNE-0018", name: "Pneu EfficientGrip Performance", brand: "Goodyear", category: "Pneu passeio", measure: "185/65 R15", condition: "Novo", stock: 4, minimum: 6, cost: 329.9, price: 489.9, location: "A-01-03", dot: "1826", active: true },
  { id: "p2", code: "PNE-0024", name: "Pneu Cinturato P1", brand: "Pirelli", category: "Pneu passeio", measure: "195/55 R16", condition: "Novo", stock: 12, minimum: 4, cost: 389.5, price: 569.9, location: "A-02-01", dot: "2226", active: true },
  { id: "p3", code: "PNE-0031", name: "Pneu LTX Force", brand: "Michelin", category: "SUV e picape", measure: "265/65 R17", condition: "Novo", stock: 7, minimum: 4, cost: 879, price: 1199, location: "B-01-02", dot: "1426", active: true },
  { id: "p4", code: "PNE-0042", name: "Pneu SportControl 2", brand: "Continental", category: "Alta performance", measure: "225/45 R17", condition: "Novo", stock: 2, minimum: 4, cost: 572, price: 789.9, location: "B-03-01", dot: "0926", active: true },
  { id: "p5", code: "PNE-0055", name: "Pneu Cargo Marathon 2", brand: "Goodyear", category: "Utilitário", measure: "205/75 R16", condition: "Recapado", stock: 9, minimum: 3, cost: 365, price: 535, location: "C-01-04", dot: "4825", active: true },
  { id: "p6", code: "PRO-0084", name: "Válvula de borracha TR414", brand: "Schrader", category: "Acessórios", measure: "Universal", condition: "Novo", stock: 38, minimum: 20, cost: 4.2, price: 12, location: "D-02-06", dot: "—", active: true },
];

export const demoMovements: DemoMovement[] = [
  { id: "MOV-2048", type: "Entrada", product: "Pneu Cinturato P1", identification: "TF-PI-195-2841", quantity: 8, reason: "Compra de fornecedor", linkedTo: "NF 018492", employee: "Marina Costa", role: "Estoquista", date: "28/07/2026", time: "08:42", risk: "Normal", value: 3116 },
  { id: "MOV-2047", type: "Saída", product: "Pneu EfficientGrip Performance", identification: "TF-GO-185-9102", quantity: 2, reason: "Uso em ordem de serviço", linkedTo: "OS #1048", employee: "Lucas Andrade", role: "Mecânico", date: "28/07/2026", time: "08:17", risk: "Normal", value: 659.8 },
  { id: "MOV-2046", type: "Saída", product: "Pneu SportControl 2", identification: "TF-CO-225-4408", quantity: 1, reason: "Ajuste de inventário", linkedTo: "Sem vínculo", employee: "Rafael Lima", role: "Estoquista", date: "27/07/2026", time: "19:34", risk: "Suspeito", value: 572 },
  { id: "MOV-2045", type: "Estorno", product: "Válvula de borracha TR414", identification: "Lote VAL-2607", quantity: 2, reason: "Correção da MOV-2042", linkedTo: "MOV-2042", employee: "Beatriz Nunes", role: "Gerente", date: "27/07/2026", time: "17:12", risk: "Atenção", value: 8.4 },
  { id: "MOV-2044", type: "Saída", product: "Pneu LTX Force", identification: "TF-MI-265-7731", quantity: 4, reason: "Venda", linkedTo: "Venda #0834", employee: "Camila Prado", role: "Atendente", date: "27/07/2026", time: "15:48", risk: "Normal", value: 3516 },
  { id: "MOV-2043", type: "Entrada", product: "Pneu Cargo Marathon 2", identification: "Lote CM2-4825", quantity: 6, reason: "Devolução de cliente", linkedTo: "DEV #0072", employee: "Marina Costa", role: "Estoquista", date: "27/07/2026", time: "13:05", risk: "Atenção", value: 2190 },
];

export const services = [
  ["Troca de pneu", "Montagem", "R$ 35,00", "25 min"],
  ["Conserto de pneu", "Reparo", "R$ 55,00", "40 min"],
  ["Vulcanização", "Reparo", "R$ 95,00", "1h 30"],
  ["Alinhamento", "Geometria", "R$ 120,00", "45 min"],
  ["Balanceamento", "Geometria", "R$ 30,00/roda", "35 min"],
  ["Rodízio de pneus", "Manutenção", "R$ 60,00", "30 min"],
];

export const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
