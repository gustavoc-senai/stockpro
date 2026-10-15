import { z } from "zod";
const name = z
  .string()
  .trim()
  .min(2, "Informe ao menos 2 caracteres.")
  .max(120, "Use até 120 caracteres.");
const optionalId = z
  .union([z.uuid(), z.literal("")])
  .transform((value) => value || null);
export const categorySchema = z.object({
  name,
  description: z.string().trim().max(1000),
});
export const supplierSchema = z.object({
  name,
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().trim().max(40),
  document: z.string().trim().max(30),
});
export const productSchema = z.object({
  name,
  sku: z.string().trim().min(1, "Informe o código SKU.").max(60),
  unit: z.enum(["UN", "KG", "G", "L", "ML", "M", "CX"]),
  category_id: optionalId,
  brand_id: optionalId,
  supplier_id: optionalId,
  minimum_stock: z.coerce
    .number()
    .finite()
    .min(0)
    .max(999999999999.999)
    .multipleOf(0.001),
});
export const movementSchema = z
  .object({
    product_id: z.uuid("Selecione um produto."),
    warehouse_id: z.uuid("Selecione um depósito."),
    destination_id: optionalId,
    kind: z.enum(["in", "out", "transfer"]),
    quantity: z.coerce
      .number()
      .finite()
      .positive("Informe uma quantidade maior que zero.")
      .max(999999999999.999)
      .multipleOf(0.001),
    note: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === "transfer" &&
      (!value.destination_id || value.destination_id === value.warehouse_id)
    )
      ctx.addIssue({
        code: "custom",
        path: ["destination_id"],
        message: "Selecione um depósito de destino diferente da origem.",
      });
  });
