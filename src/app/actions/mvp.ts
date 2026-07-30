"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProductType, ServiceOrderStatus, StockMovementType } from "@/generated/prisma/client";
import { requirePermission, requireStorePermission } from "@/lib/auth/authorization";
import { readSessionToken } from "@/lib/auth/web-session";
import { prisma } from "@/lib/db/prisma";
import { normalizeSearch } from "@/lib/search/normalize";
import {
  assertNonNegativeMoney,
  assertServiceOrderTransition,
  parseServiceOrderItems,
  parseServiceOrderServices,
} from "@/lib/service-orders/rules";

async function context(permission: "records.create"|"records.update"|"inventory.entry.create"|"inventory.exit.create") {
  const token = await readSessionToken();
  if (!token) redirect("/entrar");
  return requireStorePermission(token, permission);
}
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const num=(f:FormData,k:string)=>Number(f.get(k)??0);
const refresh=()=>{["/","/produtos","/estoque","/movimentacoes","/clientes","/servicos"].forEach(path=>revalidatePath(path))};

export async function createProduct(form:FormData){
  const c=await context("records.create");
  const internalCode=text(form,"internalCode"),barcode=text(form,"barcode")||null;
  await prisma.$transaction(async tx=>{const p=await tx.product.create({data:{organizationId:c.organization.id,type:text(form,"type") as ProductType,category:text(form,"category"),name:text(form,"name"),brand:text(form,"brand")||null,model:text(form,"model")||null,size:text(form,"size")||null,rim:num(form,"rim")||null,internalCode,barcode,purchasePrice:num(form,"purchasePrice"),salePrice:num(form,"salePrice"),minimumStock:num(form,"minimumStock")}});await tx.productCode.create({data:{organizationId:c.organization.id,productId:p.id,type:"INTERNAL",value:internalCode,normalizedValue:normalizeSearch(internalCode)}});if(barcode)await tx.productCode.create({data:{organizationId:c.organization.id,productId:p.id,type:"BARCODE",value:barcode,normalizedValue:normalizeSearch(barcode),isPrimary:true}})});
  refresh(); redirect("/produtos?sucesso=Produto cadastrado");
}
export async function createCustomer(form:FormData){
  const c=await context("records.create");
  await prisma.customer.create({data:{organizationId:c.organization.id,name:text(form,"name"),taxId:text(form,"taxId")||null,phone:text(form,"phone"),whatsapp:text(form,"whatsapp"),email:text(form,"email")||null,licensePlate:text(form,"licensePlate").toUpperCase(),vehicleModel:text(form,"vehicleModel"),notes:text(form,"notes")||null}});
  refresh(); redirect("/clientes?sucesso=Cliente cadastrado");
}
async function move(form:FormData,type:StockMovementType){
  const c=await context(type===StockMovementType.ENTRY?"inventory.entry.create":"inventory.exit.create");
  const productId=text(form,"productId"), quantity=num(form,"quantity");
  if(!Number.isInteger(quantity)||quantity<=0) throw new Error("Quantidade inválida.");
  await prisma.$transaction(async tx=>{
    const product=await tx.product.findFirst({where:{id:productId,organizationId:c.organization.id,active:true}});
    if(!product) throw new Error("Produto inválido.");
    const key={organizationId_storeId_productId:{organizationId:c.organization.id,storeId:c.store.id,productId}};
    const current=await tx.stockBalance.upsert({where:key,create:{organizationId:c.organization.id,storeId:c.store.id,productId,quantity:0},update:{}});
    const next=type===StockMovementType.ENTRY?current.quantity+quantity:current.quantity-quantity;
    if(next<0) throw new Error("Saldo insuficiente.");
    const updated=await tx.stockBalance.updateMany({where:{id:current.id,quantity:current.quantity},data:{quantity:next}});
    if(updated.count!==1) throw new Error("Estoque alterado por outra operação. Tente novamente.");
    await tx.stockMovement.create({data:{organizationId:c.organization.id,storeId:c.store.id,productId,userId:c.user.id,type,quantity,previousBalance:current.quantity,resultingBalance:next,unitCost:type===StockMovementType.ENTRY?num(form,"unitCost"):null,reason:text(form,"reason")||null,supplier:text(form,"supplier")||null,document:text(form,"document")||null,notes:text(form,"notes")||null}});
  });
  refresh(); redirect("/movimentacoes?sucesso=Movimentação registrada");
}
export async function stockEntry(f:FormData){return move(f,StockMovementType.ENTRY)}
export async function stockExit(f:FormData){return move(f,StockMovementType.EXIT)}

async function batchMove(form:FormData,type:StockMovementType){
  const c=await context(type===StockMovementType.ENTRY?"inventory.entry.create":"inventory.exit.create");
  const raw=JSON.parse(text(form,"items")) as Array<{productId:string;quantity:number;unitCost?:number}>;
  if(!Array.isArray(raw)||raw.length===0||raw.length>100)throw new Error("Lista inválida.");
  const merged=new Map<string,{quantity:number;unitCost:number}>();for(const x of raw){if(!x.productId||!Number.isInteger(x.quantity)||x.quantity<=0)throw new Error("Item inválido.");const old=merged.get(x.productId);merged.set(x.productId,{quantity:(old?.quantity||0)+x.quantity,unitCost:Number(x.unitCost||0)})}
  await prisma.$transaction(async tx=>{for(const [productId,item] of merged){const product=await tx.product.findFirst({where:{id:productId,organizationId:c.organization.id,active:true}});if(!product)throw new Error("Produto inválido.");const key={organizationId_storeId_productId:{organizationId:c.organization.id,storeId:c.store.id,productId}},balance=await tx.stockBalance.upsert({where:key,create:{organizationId:c.organization.id,storeId:c.store.id,productId,quantity:0},update:{}}),next=type==="ENTRY"?balance.quantity+item.quantity:balance.quantity-item.quantity;if(next<0)throw new Error(`Saldo insuficiente para ${product.name}.`);const changed=await tx.stockBalance.updateMany({where:{id:balance.id,quantity:balance.quantity},data:{quantity:next}});if(changed.count!==1)throw new Error("Conflito de estoque.");await tx.stockMovement.create({data:{organizationId:c.organization.id,storeId:c.store.id,productId,userId:c.user.id,type,quantity:item.quantity,previousBalance:balance.quantity,resultingBalance:next,unitCost:type==="ENTRY"?item.unitCost:null,reason:type==="EXIT"?text(form,"reason")||"venda":"entrada rápida"}})}});
  refresh();redirect("/movimentacoes?sucesso=Operação rápida concluída");
}
export async function quickStockEntry(f:FormData){return batchMove(f,StockMovementType.ENTRY)}
export async function quickStockExit(f:FormData){return batchMove(f,StockMovementType.EXIT)}

export async function createServiceOrder(form:FormData){
  const c=await context("records.create");
  const customerId=text(form,"customerId");
  const laborAmount=assertNonNegativeMoney(num(form,"laborAmount"));
  const services=parseServiceOrderServices(text(form,"services"));
  const products=parseServiceOrderItems(text(form,"items"));
  const requestedStatus=text(form,"status");
  if(!customerId)throw new Error("Confira cliente, serviço e valores.");
  if(requestedStatus==="FINISHED")requirePermission(c,"inventory.exit.create");
  await prisma.$transaction(async tx=>{
    const customer=await tx.customer.findFirstOrThrow({where:{id:customerId,organizationId:c.organization.id}});
    const last=await tx.serviceOrder.aggregate({where:{organizationId:c.organization.id,storeId:c.store.id},_max:{number:true}});
    const status=requestedStatus==="IN_PROGRESS"?ServiceOrderStatus.IN_PROGRESS:requestedStatus==="FINISHED"?ServiceOrderStatus.FINISHED:ServiceOrderStatus.OPEN;
    const order=await tx.serviceOrder.create({data:{organizationId:c.organization.id,storeId:c.store.id,customerId,responsibleUserId:c.user.id,number:(last._max.number??0)+1,vehicleModel:customer.vehicleModel,licensePlate:customer.licensePlate,description:services.join(", "),notes:text(form,"notes")||null,laborAmount,status}});
    let productsAmount=0;
    for(const item of products){if(!item.productId||!Number.isInteger(item.quantity)||item.quantity<=0)throw new Error("Quantidade inválida.");const p=await tx.product.findFirstOrThrow({where:{id:item.productId,organizationId:c.organization.id,active:true}});const balance=await tx.stockBalance.findUnique({where:{organizationId_storeId_productId:{organizationId:c.organization.id,storeId:c.store.id,productId:p.id}}});if(!balance||item.quantity>balance.quantity)throw new Error(`Saldo insuficiente para ${p.name}.`);const total=Number(p.salePrice)*item.quantity;productsAmount+=total;await tx.serviceOrderItem.create({data:{organizationId:c.organization.id,serviceOrderId:order.id,productId:p.id,quantity:item.quantity,unitPrice:p.salePrice,totalPrice:total}})}
    if(status===ServiceOrderStatus.FINISHED){for(const item of products){const balance=await tx.stockBalance.findUnique({where:{organizationId_storeId_productId:{organizationId:c.organization.id,storeId:c.store.id,productId:item.productId}}});if(!balance||balance.quantity<item.quantity)throw new Error("Estoque insuficiente.");const next=balance.quantity-item.quantity;const changed=await tx.stockBalance.updateMany({where:{id:balance.id,quantity:balance.quantity},data:{quantity:next}});if(changed.count!==1)throw new Error("Concorrência de estoque.");await tx.stockMovement.create({data:{organizationId:c.organization.id,storeId:c.store.id,productId:item.productId,userId:c.user.id,serviceOrderId:order.id,type:StockMovementType.EXIT,quantity:item.quantity,previousBalance:balance.quantity,resultingBalance:next,reason:"uso em serviço"}})}}
    await tx.serviceOrder.update({where:{id:order.id},data:{productsAmount,totalAmount:productsAmount+laborAmount,finishedAt:status===ServiceOrderStatus.FINISHED?new Date():null,inventoryPostedAt:status===ServiceOrderStatus.FINISHED?new Date():null}});
  });
  refresh();redirect("/servicos?sucesso=Ordem criada");
}
export async function changeServiceOrderStatus(form:FormData){
  const c=await context("records.update"),id=text(form,"id"),status=text(form,"status");
  if(!["IN_PROGRESS","WAITING","CANCELLED"].includes(status))throw new Error("Status inválido.");
  const order=await prisma.serviceOrder.findFirst({where:{id,organizationId:c.organization.id,storeId:c.store.id}});
  if(!order)throw new Error("Ordem não pode ser alterada.");
  const next=status as ServiceOrderStatus;
  assertServiceOrderTransition(order.status,next);
  const changed=await prisma.serviceOrder.updateMany({where:{id,organizationId:c.organization.id,storeId:c.store.id,status:order.status},data:{status:next}});
  if(changed.count!==1)throw new Error("A ordem foi alterada por outra operação. Atualize a página.");
  refresh();redirect("/servicos");
}
export async function finishServiceOrder(form:FormData){
  const c=await context("inventory.exit.create"); const id=text(form,"id");
  await prisma.$transaction(async tx=>{
    const order=await tx.serviceOrder.findFirst({where:{id,organizationId:c.organization.id,storeId:c.store.id},include:{items:true}});
    if(!order||order.inventoryPostedAt) throw new Error("Ordem inválida ou já finalizada.");
    assertServiceOrderTransition(order.status,ServiceOrderStatus.FINISHED);
    const now=new Date();
    const claimed=await tx.serviceOrder.updateMany({where:{id,organizationId:c.organization.id,storeId:c.store.id,status:order.status,inventoryPostedAt:null},data:{status:ServiceOrderStatus.FINISHED,finishedAt:now,inventoryPostedAt:now}});
    if(claimed.count!==1)throw new Error("Ordem inválida ou já finalizada.");
    for(const item of order.items){
      const balance=await tx.stockBalance.findUnique({where:{organizationId_storeId_productId:{organizationId:c.organization.id,storeId:c.store.id,productId:item.productId}}});
      if(!balance||balance.quantity<item.quantity) throw new Error("Estoque insuficiente.");
      const next=balance.quantity-item.quantity;
      const changed=await tx.stockBalance.updateMany({where:{id:balance.id,quantity:balance.quantity},data:{quantity:next}});
      if(changed.count!==1) throw new Error("Concorrência de estoque.");
      await tx.stockMovement.create({data:{organizationId:c.organization.id,storeId:c.store.id,productId:item.productId,userId:c.user.id,serviceOrderId:order.id,type:StockMovementType.EXIT,quantity:item.quantity,previousBalance:balance.quantity,resultingBalance:next,reason:"uso em serviço"}});
    }
  });refresh();redirect("/servicos?sucesso=Ordem finalizada");
}
