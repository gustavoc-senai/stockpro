# Ampliação de páginas — clientes, marcas e compras

Adicionadas sete telas ao sistema existente:

| Rota | Função |
| --- | --- |
| `/app/customers` | Cadastro, edição, busca, status e CSV dos contatos de clientes |
| `/app/brands` | Cadastro, edição, busca, status e CSV de marcas |
| `/app/purchases` | Lista paginada de compras, filtro de status e exportação da página |
| `/app/purchases/new` | Criação de rascunho com fornecedor, depósito e até 100 itens |
| `/app/purchases/:id` | Detalhes, edição de rascunho, confirmação, cancelamento e recebimento |
| `/app/products/:id` | Ficha do produto, categoria, marca, fornecedor, saldos e histórico paginado |
| `/app/suppliers/:id` | Contatos do fornecedor, produtos vinculados e histórico de pedidos paginado |

Clientes e marcas reaproveitam o módulo de catálogo, com formulários adequados a cada cadastro. A marca passou a integrar o formulário do produto. Os nomes dos produtos e fornecedores nas tabelas abrem suas fichas. Novos links foram integrados à sidebar; os cabeçalhos reconhecem as rotas de detalhes.

## Arquivos

Criados: `src/features/catalog/CatalogDetailsPage.tsx`, `src/features/purchases/PurchasesPage.tsx`, `src/features/purchases/PurchaseDetailsPage.tsx`, `src/services/purchases.ts`, `src/schemas/purchases.ts`, `supabase/migrations/202610150004_purchases_contacts.sql` e este registro.

Modificados: rotas, sidebar, catálogo/validações, serviço de movimentações para filtro por produto, estilos, testes de banco/navegador, README e instruções do Supabase.

## Regras

As novas tabelas usam RLS por empresa, FKs compostas e permissões de leitura ou gestão conforme o papel. Gravação de pedidos e itens é permitida apenas por RPC. As funções validam produtos, fornecedor e depósito da empresa, quantidades e preços, repetição de produtos e transições de status.

Pedidos confirmados não podem ser editados; recebimento gera todas as entradas na mesma transação e é idempotente. Cancelamento só é permitido antes do recebimento. Falhas em qualquer item revertem o recebimento completo. São usados locks por pedido e ordem determinística dos produtos durante o recebimento. Não foi executado teste concorrente com múltiplas sessões remotas.

A confirmação usa o rascunho salvo; alterações pendentes bloqueiam a confirmação até salvar. Não há envio de pedido por e-mail nem comunicação automática com fornecedores.

## Banco remoto

A migration 004 foi criada no projeto e precisa ser aplicada manualmente após conferir o histórico e as migrations anteriores. Nenhuma alteração SQL remota foi executada nesta etapa. Consulte `supabase/README.md`.

## Validação desta ampliação

- 37 testes de banco passaram em PostgreSQL/PGlite local, incluindo as regras de clientes, marcas, pedidos, status, isolamento, rollback e recebimento idempotente.
- 28 verificações de navegador passaram no Chrome headless, incluindo os novos cadastros, fichas de detalhes, criação/confirmação/recebimento de pedido e visualização móvel.
- As respostas autenticadas do navegador foram simuladas exclusivamente nos testes. Não foram criados registros nem contas de teste no Supabase remoto.
- TypeScript, lint e formatação passaram. Build de produção executado com sucesso.
