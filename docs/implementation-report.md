# Registro da implementação — 15/10/2026

## Entrega

Preservado React/TypeScript/Vite/Supabase. `App.tsx` passou a organizar as rotas com carregamento sob demanda, reduzindo o bundle inicial e removendo o aviso de chunk grande do build. O dashboard usa resumo e histórico reais quando o banco está configurado; não há seed ou métricas inventadas na aplicação.

Implementados login, cadastro e recuperação em rotas próprias; sessão persistente; onboarding; contexto e seletor de empresas; filiais e depósitos; catálogo de produtos, categorias e fornecedores; saldos; movimentações; inventário físico; relatórios; alertas; exportação CSV; conta; configurações; consulta de equipe; ajuda e página 404.

Interface revista com tema grafite/azul, imagem editorial própria, estados de carregamento/erro/vazio, menus móveis, indicação da empresa, formulários, tabelas e foco de teclado. Os módulos possuem um padrão visual compartilhado em `src/index.css`.

## Arquivos criados

- `src/components/layout/AppLayout.tsx`
- `src/components/feedback/Feedback.tsx`
- `src/features/organizations/OrganizationContext.tsx`
- `src/features/organizations/Onboarding.tsx`
- `src/features/locations/LocationsPage.tsx`
- `src/features/catalog/CatalogPage.tsx`
- `src/features/dashboard/Dashboard.tsx`
- `src/features/stock/StockPage.tsx`
- `src/features/stock/InventoryPage.tsx`
- `src/features/stock/ReportsPage.tsx`
- `src/features/account/AccountPages.tsx`
- `src/features/auth/PasswordPage.tsx`
- `src/services/catalog.ts`, `locations.ts`, `stock.ts`, `export.ts`
- `src/schemas/catalog.ts`
- `supabase/migrations/202610150001_foundation.sql`
- `supabase/migrations/202610150002_inventory.sql`
- `supabase/migrations/202610150003_inventory_reports.sql`
- `supabase/inspect.sql` e `supabase/README.md`
- `tests/database.mjs` e `tests/browser.mjs`
- `public/images/warehouse-editorial.png`
- `.env.example` e `.env.local` local/ignorado
- `docs/image-prompt.md` e este registro

## Arquivos modificados

`src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/features/auth/AuthPage.tsx`, `src/features/auth/AuthContext.tsx`, `src/lib/supabase.ts`, `index.html`, `package.json`, `package-lock.json`, `.gitignore`, `.oxlintrc.json`, `README.md`. `src/App.css` foi apenas formatado e permanece sem ser importado. Os assets antigos foram preservados.

## Problemas corrigidos

- `.env` estava em `src`; criada configuração na raiz sem exibir as credenciais.
- Usuário sem empresa não é tratado como owner de uma empresa fictícia.
- Seletor de empresa substitui o bloco estático e valida as associações autorizadas.
- Cache separado por organização e limpo no logout.
- Concorrência da carga inicial da sessão não sobrescreve eventos posteriores de autenticação.
- Criações e movimentações têm proteção de clique duplo e chaves de idempotência no banco.
- Constraints compostas bloqueiam filial/categoria/fornecedor/depósito de outra empresa.
- Clientes não recebem permissões para alterar owner, papéis, organização dos registros, saldos ou histórico diretamente.
- RPCs usam transação, verificação de associação, `search_path` vazio e grants explícitos; a função de criação preexistente continua exigindo auditoria do corpo remoto.
- Saídas acima do saldo são rejeitadas; transferências alteram os dois depósitos atomicamente.
- Contagens físicas registram saldo anterior e diferença e preservam o histórico.
- CSV tem escaping de aspas e neutralização de fórmulas.
- Removida a concentração de layout/dashboard/rotas em um único arquivo.

## Verificações executadas

- TypeScript: passou, também executado pelo build.
- Build de produção: passou, sem aviso de chunk acima de 500 kB após divisão por rotas.
- Oxlint: passou sem avisos.
- Prettier: passou.
- Banco: **25 testes passaram**, usando PostgreSQL/PGlite em memória com fixture do esquema original. Incluem RLS, duas empresas, leitura restrita, coluna de organização imutável, FK composta, idempotência, saldo insuficiente, transferência, contagem auditável e relatório consolidado.
- Navegador Chrome/headless: **22 verificações passaram**, incluindo rotas privadas, login/cadastro/recovery na navegação, dashboard, cadastros, movimento, contagem, relatório, download CSV, páginas de conta/configurações/equipe/ajuda, troca de empresa, mobile, onboarding e logout. As respostas autenticadas foram interceptadas com fixtures exclusivamente no teste.
- Consulta remota da API pública: tabelas originais e de catálogo/estoque e função `stockpro_dashboard` reconhecidas; acesso anônimo negado (`42501`). A tabela de contagens e função de relatórios não estavam disponíveis na última checagem.
- Não foram criadas contas nem dados fictícios no banco remoto. Não houve SQL remoto executado, deploy, teste de entrega de e-mail ou fluxo autenticado remoto completo.
- Não há repositório Git neste diretório; `git status` não pode produzir uma relação de alterações.

## Pendências para disponibilizar a terceiros

1. Conferir o esquema e as funções antigas usando `supabase/inspect.sql` no SQL Editor.
2. Conferir quais migrations já foram aplicadas; aplicar as pendentes, em especial `202610150003_inventory_reports.sql` se 001/002 já estiverem completas. Não reaplicar os arquivos anteriores.
3. Configurar Site URL, redirects, confirmação de e-mail e SMTP no Supabase.
4. Validar duas contas reais em homologação, persistência, recuperação de senha e tentativas diretas de acesso cruzado por API.
5. Configurar o domínio de produção, fallback de navegação, monitoramento e política de backups.

Ainda não há convites, edição de papéis, cobrança ou gestão de planos. Seletores de referência carregam até 1.000 registros e precisam de busca paginada para volumes maiores. Esses limites impedem tratar esta entrega como um SaaS comercial já homologado. As instruções detalhadas estão em `supabase/README.md`.


## Atualização posterior

Clientes, marcas, pedidos de compra, criação/detalhes de pedido e fichas de produto/fornecedor foram adicionados em uma ampliação posterior. O registro e os resultados atuais (37 testes locais de banco e 28 verificações de navegador) estão em [pages-expansion.md](pages-expansion.md). A migration 004 é necessária para os novos módulos. Os limites sobre pedidos de compra descritos no registro original acima foram superados nesta ampliação.
