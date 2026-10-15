import { z } from "zod";
export const purchaseSchema = z
  .object({
    supplier_id: z.uuid("Selecione um fornecedor."),
    warehouse_id: z.uuid("Selecione um depósito."),
    notes: z.string().trim().max(1000),
    items: z
      .array(
        z.object({
          product_id: z.uuid("Selecione todos os produtos."),
          quantity: z.coerce
            .number()
            .finite()
            .positive("Informe uma quantidade maior que zero.")
            .max(999999999999.999)
            .multipleOf(0.001),
          unit_price: z.coerce
            .number()
            .finite()
            .min(0)
            .max(999999999999.99)
            .multipleOf(0.01),
        }),
      )
      .min(1, "Inclua ao menos um item.")
      .max(100, "Use até 100 itens por pedido."),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.items.map((i) => i.product_id)).size !== value.items.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Cada produto deve aparecer uma única vez no pedido.",
      });
  });
