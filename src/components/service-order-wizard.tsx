"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Customer = {
  id: string;
  name: string;
  phone: string;
  vehicleModel: string;
  licensePlate: string;
};
type Product = {
  id: string;
  name: string;
  size: string | null;
  internalCode: string;
  barcode: string | null;
  salePrice: number;
  stock: number;
  codes: string[];
};
type Line = Product & { quantity: number };

const services = [
  "Troca de pneu",
  "Conserto de pneu",
  "Alinhamento",
  "Balanceamento",
  "Rodízio",
  "Troca de válvula",
  "Montagem",
  "Serviço geral",
];
const serviceIcons = ["◉", "◆", "↔", "◎", "↻", "●", "▦", "✦"];
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function ServiceOrderWizard({
  customers,
  products,
  responsible,
  action,
  canFinalize,
}: {
  customers: Customer[];
  products: Product[];
  responsible: string;
  action: (data: FormData) => void | Promise<void>;
  canFinalize: boolean;
}) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [otherService, setOtherService] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [message, setMessage] = useState("Pronto para bipar");
  const [labor, setLabor] = useState(0);
  const scanner = useRef<HTMLInputElement>(null);
  const productSearch = useRef<HTMLInputElement>(null);

  const customer = customers.find((item) => item.id === customerId);
  const filteredCustomers =
    customerQuery.trim().length < 2
      ? customers.slice(0, 5)
      : customers
          .filter((item) =>
            `${item.name} ${item.phone} ${item.licensePlate}`
              .toLowerCase()
              .includes(customerQuery.trim().toLowerCase()),
          )
          .slice(0, 8);
  const lookup = useMemo(() => {
    const map = new Map<string, Product>();
    for (const product of products) {
      for (const item of [
        product.internalCode,
        product.barcode,
        ...product.codes,
      ].filter(Boolean) as string[]) {
        map.set(item.toUpperCase().replace(/\W/g, ""), product);
      }
    }
    return map;
  }, [products]);
  const visibleProducts = productQuery.trim()
    ? products
        .filter((product) =>
          `${product.name} ${product.size ?? ""} ${product.internalCode} ${product.barcode ?? ""}`
            .toLowerCase()
            .includes(productQuery.trim().toLowerCase()),
        )
        .slice(0, 12)
    : products.slice(0, 8);
  const effectiveServices = [
    ...selectedServices,
    ...(otherService.trim() ? [otherService.trim()] : []),
  ];

  function addProduct(product: Product) {
    setLines((current) => {
      const found = current.find((item) => item.id === product.id);
      if (found) {
        if (found.quantity >= product.stock) {
          setMessage("Quantidade máxima: saldo disponível.");
          return current;
        }
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      if (product.stock <= 0) {
        setMessage("Produto sem estoque.");
        return current;
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  function scan() {
    const product = lookup.get(code.toUpperCase().replace(/\W/g, ""));
    if (!product) setMessage("Produto não encontrado.");
    else {
      addProduct(product);
      setMessage(`Adicionado: ${product.name}`);
    }
    setCode("");
    scanner.current?.focus();
  }

  function changeQuantity(id: string, delta: number) {
    setLines((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(
                1,
                Math.min(item.stock, item.quantity + delta),
              ),
            }
          : item,
      ),
    );
  }

  const productsTotal = lines.reduce(
    (total, item) => total + item.salePrice * item.quantity,
    0,
  );
  const total = productsTotal + labor;
  const valid = Boolean(customer) && effectiveServices.length > 0 && labor >= 0;

  return (
    <form action={action} className="os-wizard">
      <input type="hidden" name="customerId" value={customerId} />
      <input
        type="hidden"
        name="services"
        value={JSON.stringify(effectiveServices)}
      />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          lines.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        )}
      />

      <section className="os-step os-step-blue">
        <header>
          <b>1</b>
          <div>
            <h2>Escolha o cliente ou veículo</h2>
            <p>Pesquise pelo nome, telefone ou placa.</p>
          </div>
        </header>
        <div className="os-search-row">
          <input
            value={customerQuery}
            onChange={(event) => setCustomerQuery(event.target.value)}
            placeholder="Nome, telefone ou placa"
            aria-label="Buscar cliente, telefone ou placa"
          />
          <button type="button" className="tireflow-btn blue">
            Buscar pela placa
          </button>
          <Link href="/clientes" className="tireflow-btn orange">
            + Novo cliente
          </Link>
        </div>
        <div className="os-customer-results">
          {filteredCustomers.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === customerId ? "selected" : ""}
              onClick={() => setCustomerId(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.vehicleModel} • {item.licensePlate}
              </span>
              <small>{item.phone}</small>
            </button>
          ))}
        </div>
        {customer ? (
          <div className="os-selected">
            <strong>Cliente selecionado: {customer.name}</strong>
            <span>
              {customer.vehicleModel} • {customer.licensePlate} •{" "}
              {customer.phone}
            </span>
          </div>
        ) : null}
      </section>

      <section className="os-step os-step-purple">
        <header>
          <b>2</b>
          <div>
            <h2>Escolha o serviço</h2>
            <p>Você pode selecionar mais de um.</p>
          </div>
        </header>
        <div className="os-service-grid">
          {services.map((service, index) => (
            <button
              type="button"
              key={service}
              className={selectedServices.includes(service) ? "selected" : ""}
              onClick={() =>
                setSelectedServices((current) =>
                  current.includes(service)
                    ? current.filter((item) => item !== service)
                    : [...current, service],
                )
              }
            >
              <span>{serviceIcons[index]}</span>
              {service}
            </button>
          ))}
        </div>
        <label className="os-other-service">
          Outro serviço
          <input
            value={otherService}
            onChange={(event) => setOtherService(event.target.value)}
            placeholder="Descreva somente quando necessário"
          />
        </label>
      </section>

      <section className="os-step os-step-green">
        <header>
          <b>3</b>
          <div>
            <h2>Adicione os produtos</h2>
            <p>Bipe o código ou escolha pela busca.</p>
          </div>
        </header>
        <div className="scanner-row">
          <input
            ref={scanner}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                scan();
              }
              if (event.key === "Escape") setCode("");
            }}
            placeholder="Bipe o código e pressione Enter"
            aria-label="Adicionar produto por código de barras"
          />
          <button
            type="button"
            className="tireflow-btn green"
            onClick={() => scanner.current?.focus()}
          >
            ▣ Bipar produto
          </button>
          <button
            type="button"
            className="tireflow-btn blue"
            onClick={() => productSearch.current?.focus()}
          >
            Buscar produto
          </button>
        </div>
        <label className="os-product-search">
          Buscar por nome, medida ou código
          <input
            ref={productSearch}
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Ex.: Pneu 175/70 ou PNEU-175"
          />
        </label>
        <p
          className={
            message.includes("não") || message.includes("sem")
              ? "scanner-error"
              : "scanner-ok"
          }
        >
          {message}
        </p>
        <div className="os-product-picks">
          {visibleProducts.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => addProduct(product)}
              disabled={product.stock === 0}
            >
              <strong>{product.name}</strong>
              <small>
                {product.size || product.internalCode} • saldo {product.stock}
              </small>
            </button>
          ))}
        </div>
        <div className="os-product-lines">
          {lines.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.size} • {item.internalCode}
                </span>
                <small>
                  Saldo {item.stock} • {money.format(item.salePrice)} cada
                </small>
              </div>
              <div className="qty-stepper">
                <button
                  type="button"
                  onClick={() => changeQuantity(item.id, -1)}
                  disabled={item.quantity <= 1}
                  aria-label={`Diminuir quantidade de ${item.name}`}
                >
                  −
                </button>
                <b>{item.quantity}</b>
                <button
                  type="button"
                  onClick={() => changeQuantity(item.id, 1)}
                  disabled={item.quantity >= item.stock}
                  aria-label={`Aumentar quantidade de ${item.name}`}
                >
                  +
                </button>
              </div>
              <strong>{money.format(item.salePrice * item.quantity)}</strong>
              <button
                type="button"
                className="remove"
                onClick={() =>
                  setLines((current) =>
                    current.filter((line) => line.id !== item.id),
                  )
                }
              >
                Remover
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="os-step os-step-summary">
        <header>
          <b>4</b>
          <div>
            <h2>Confira a ordem</h2>
            <p>Revise tudo antes de confirmar.</p>
          </div>
        </header>
        <div className="os-summary-grid">
          <div>
            <small>Cliente</small>
            <strong>{customer?.name || "Não selecionado"}</strong>
            <span>
              {customer
                ? `${customer.vehicleModel} • ${customer.licensePlate}`
                : "—"}
            </span>
          </div>
          <div>
            <small>Serviços</small>
            <strong>
              {effectiveServices.length
                ? effectiveServices.join(", ")
                : "Nenhum selecionado"}
            </strong>
          </div>
          <div>
            <label htmlFor="labor">Mão de obra</label>
            <input
              id="labor"
              name="laborAmount"
              type="number"
              min="0"
              step=".01"
              value={labor}
              onChange={(event) =>
                setLabor(Math.max(0, Number(event.target.value) || 0))
              }
            />
          </div>
          <div>
            <label htmlFor="notes">Observações</label>
            <textarea id="notes" name="notes" rows={3} />
          </div>
        </div>
        <div className="os-totals">
          <span>
            Produtos <b>{money.format(productsTotal)}</b>
          </span>
          <span>
            Mão de obra <b>{money.format(labor)}</b>
          </span>
          <strong>
            Total geral <b>{money.format(total)}</b>
          </strong>
          <small>Responsável: {responsible}</small>
        </div>
        <div className="os-final-actions">
          <button
            className="tireflow-btn"
            name="status"
            value="OPEN"
            disabled={!valid}
          >
            Salvar como aberta
          </button>
          <button
            className="tireflow-btn blue"
            name="status"
            value="IN_PROGRESS"
            disabled={!valid}
          >
            Iniciar serviço
          </button>
          <button
            className="tireflow-btn green"
            name="status"
            value="FINISHED"
            disabled={!valid || !canFinalize}
            onClick={(event) => {
              if (
                !window.confirm(
                  "Finalizar esta ordem e baixar os produtos do estoque?",
                )
              )
                event.preventDefault();
            }}
          >
            Finalizar serviço
          </button>
          <button
            type="button"
            className="tireflow-btn danger"
            onClick={() => {
              setCustomerQuery("");
              setCustomerId("");
              setSelectedServices([]);
              setOtherService("");
              setLines([]);
              setCode("");
              setProductQuery("");
              setLabor(0);
              setMessage("Ordem cancelada antes de salvar.");
            }}
          >
            Cancelar
          </button>
        </div>
        {!valid ? (
          <p className="scanner-error">
            Selecione cliente e pelo menos um serviço. Valores não podem ser
            negativos.
          </p>
        ) : null}
      </section>
    </form>
  );
}
