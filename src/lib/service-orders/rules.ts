import { ServiceOrderStatus } from "../../generated/prisma/client";

export type ServiceOrderInputItem = {
  productId: string;
  quantity: number;
};

const allowedTransitions: Readonly<
  Record<ServiceOrderStatus, ReadonlySet<ServiceOrderStatus>>
> = {
  [ServiceOrderStatus.OPEN]: new Set([
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.WAITING,
    ServiceOrderStatus.FINISHED,
    ServiceOrderStatus.CANCELLED,
  ]),
  [ServiceOrderStatus.IN_PROGRESS]: new Set([
    ServiceOrderStatus.WAITING,
    ServiceOrderStatus.FINISHED,
    ServiceOrderStatus.CANCELLED,
  ]),
  [ServiceOrderStatus.WAITING]: new Set([
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.FINISHED,
    ServiceOrderStatus.CANCELLED,
  ]),
  [ServiceOrderStatus.FINISHED]: new Set(),
  [ServiceOrderStatus.CANCELLED]: new Set(),
};

export function assertServiceOrderTransition(
  current: ServiceOrderStatus,
  next: ServiceOrderStatus,
): void {
  if (!allowedTransitions[current].has(next)) {
    throw new Error("Alteração de status não permitida.");
  }
}

export function parseServiceOrderServices(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    throw new Error("Lista de serviços inválida.");
  }
  if (!Array.isArray(parsed)) throw new Error("Lista de serviços inválida.");
  const services = [
    ...new Set(
      parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (
    services.length === 0 ||
    services.length > 9 ||
    services.some((item) => item.length > 80) ||
    services.join(", ").length > 300
  ) {
    throw new Error("Lista de serviços inválida.");
  }
  return services;
}

export function parseServiceOrderItems(raw: string): ServiceOrderInputItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    throw new Error("Lista de produtos inválida.");
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw new Error("Lista de produtos inválida.");
  }
  const merged = new Map<string, number>();
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("productId" in item) ||
      !("quantity" in item) ||
      typeof item.productId !== "string" ||
      !item.productId ||
      !Number.isInteger(item.quantity) ||
      Number(item.quantity) <= 0
    ) {
      throw new Error("Lista de produtos inválida.");
    }
    merged.set(
      item.productId,
      (merged.get(item.productId) ?? 0) + Number(item.quantity),
    );
  }
  return [...merged].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function assertNonNegativeMoney(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99) {
    throw new Error("Valor monetário inválido.");
  }
  return Math.round(value * 100) / 100;
}
