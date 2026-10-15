# StockPro

Aplicação React + TypeScript + Vite com Supabase Auth/PostgreSQL/RLS, TanStack Query, Zod e Tailwind CSS. O projeto existente foi preservado e dividido por funcionalidades.

## Executar

1. `npm install`
2. Copie `.env.example` para `.env.local`, **na raiz**, e configure a URL e a chave pública do seu Supabase. O Vite não lê `src/.env` por padrão.
3. Inspecione o esquema e configure o banco seguindo [supabase/README.md](supabase/README.md).
4. `npm run dev`

Reinicie o Vite quando alterar variáveis de ambiente. Chaves `service_role`, secret keys, senhas do banco e tokens de administração nunca devem ser colocados em variáveis `VITE_*`.

## Páginas

| Rota | Conteúdo |
| --- | --- |
| `/login` | Login por e-mail e senha |
| `/signup` | Cadastro com confirmação de e-mail conforme configuração do Supabase |
| `/reset-password` | Recuperação de acesso e alteração de senha |
| `/onboarding` | Criação transacional da primeira empresa, filial e depósito opcionais |
| `/app/dashboard` | Indicadores reais, atividade de sete dias e últimas movimentações |
| `/app/products` | Produtos, SKU, unidade, categoria, fornecedor e mínimo |
| `/app/categories` | Categorias e descrição |
| `/app/suppliers` | Fornecedores e contatos |
| `/app/stock` | Saldo por produto e depósito |
| `/app/movements` | Entradas, saídas e transferências |
| `/app/inventory` | Contagem física, ajuste e histórico auditável |
| `/app/reports` | Saldos consolidados, busca, filtros e CSV |
| `/app/alerts` | Produtos abaixo do mínimo |
| `/app/branches` | Filiais, edição e ativação/desativação |
| `/app/warehouses` | Depósitos vinculados a filiais e filtro por filial |
| `/app/team` | Consulta dos membros e papéis |
| `/app/settings` | Nome e estrutura da empresa |
| `/app/account` | Nome pessoal e acesso à troca de senha |
| `/help`, `/app/help` | Guia de uso |

O seletor de empresa valida a preferência salva contra as associações autorizadas retornadas pelo Supabase. As consultas usam `organization_id`; as políticas RLS e chaves estrangeiras compostas aplicam o isolamento no banco. O cache é limpo no logout e separado por empresa.

## Regras operacionais

- `owner` e `admin` gerenciam cadastros, movimentações e inventário; os demais membros consultam os dados da empresa.
- Não há exclusão definitiva de cadastros na interface. Use ativação/desativação para preservar os vínculos históricos.
- Entradas aumentam saldo; saídas e transferências exigem saldo suficiente. Quantidades têm até três casas decimais.
- Estoque não pode ser editado diretamente pelo cliente. As RPCs alteram saldo e histórico na mesma transação.
- A contagem física usa o saldo **no instante da confirmação**, registra a diferença e gera entrada ou saída quando necessário. Diferença zero também gera registro de contagem.
- Os mínimos são avaliados pelo saldo total por produto na empresa. Unidades diferentes não são somadas em uma métrica única.
- Desativar um produto ou local não apaga seu saldo. Reative o local/produto para movimentá-lo novamente.
- Exportações CSV incluem **a página atual**, com proteção contra interpretação de fórmulas em planilhas.
- Dashboard agrupa os dias no fuso `America/Sao_Paulo`. Os horários individuais são exibidos conforme o navegador.

## Verificar

```text
npm run typecheck
npm run build
npm run lint
npm run format:check
npm test
npm run test:browser
```

`npm test` executa PostgreSQL local em memória via PGlite com um esquema de teste para as tabelas já existentes. Testa migrations, RLS, integridade, permissões, idempotência, movimentações, contagens e relatórios. Não é uma auditoria do esquema remoto.

`npm run test:browser` exige o Vite em `http://127.0.0.1:5173` e Chrome instalado. O navegador usa respostas de API interceptadas e sessões de teste, sem criar contas ou registros remotos. Capturas ficam em `.tmp/`. Para usar outro navegador, ajuste `channel` no teste. Um teste real com e-mail, duas contas e duas empresas ainda deve ser executado no Supabase de homologação.

## Estrutura

- `src/App.tsx`: rotas e carregamento dos módulos sob demanda.
- `src/components/`: layout e feedback compartilhados.
- `src/features/`: autenticação, organizações, locais, catálogo, estoque, relatórios e conta.
- `src/services/`: consultas, persistência e exportação.
- `src/schemas/`: validações dos formulários.
- `supabase/migrations/`: migrations SQL versionadas.
- `tests/`: verificações de banco e navegador.

## Identidade visual

Interface grafite e azul, navegação lateral, formulários e tabelas consistentes, estados vazios e layout móvel. `public/images/warehouse-editorial.png` é uma imagem gerada com a ferramenta integrada de geração de imagens. O prompt está em [docs/image-prompt.md](docs/image-prompt.md).

## Limites desta entrega

O código dos fluxos está implementado, mas liberar para clientes exige validar o banco remoto e as contas reais. Ainda não há convites de equipe, edição de papéis, cobrança/assinaturas, gestão de planos, pedidos de venda, anexos, códigos de barras ou monitoramento de produção. A página de equipe é de consulta. Listas de referência dos formulários carregam até 1.000 registros; para catálogos maiores, implemente seleção pesquisável no servidor. Filiais e depósitos também precisam de paginação para grandes volumes.

Consulte [docs/implementation-report.md](docs/implementation-report.md) para o registro da entrega, validações e pendências de homologação.

## Novas páginas: contatos e compras

| Rota | Conteúdo |
| --- | --- |
| `/app/customers` | Clientes, contatos, edição e status |
| `/app/brands` | Marcas associadas aos produtos |
| `/app/purchases` | Pedidos de compra com filtro e exportação |
| `/app/purchases/new` | Novo pedido com fornecedor, depósito e itens |
| `/app/purchases/:id` | Conferência, confirmação, cancelamento e recebimento |
| `/app/products/:id` | Ficha do produto com saldos e histórico |
| `/app/suppliers/:id` | Perfil do fornecedor com produtos e compras |

A migration `202610150004_purchases_contacts.sql` adiciona clientes, marcas, vínculo de marca ao produto e pedidos de compra. Aplique-a após conferir as migrations anteriores. Não houve execução de SQL remoto nesta etapa.

Um pedido nasce como rascunho editável. A confirmação bloqueia alterações nos itens; o recebimento integral gera entradas de estoque para todos os itens na mesma transação. Uma falha reverte o recebimento inteiro. Repetir a confirmação de recebimento não duplica saldo. Pedidos recebidos não podem ser cancelados; pedidos cancelados não podem ser recebidos. Não há recebimento parcial, impostos, frete, emissão fiscal ou contas a pagar. Os valores são unitários em BRL. Clientes são contatos comerciais e não geram vendas nesta etapa.

Esta ampliação foi validada com 37 testes locais de banco e 28 verificações de navegador com API simulada. Detalhes em [docs/pages-expansion.md](docs/pages-expansion.md).

## Atualização: equipe e auditoria

A página de equipe agora gerencia convites por link, papéis e remoção de acesso. Também estão disponíveis `/invite/:id` para aceitar convites e `/app/audit` para o histórico de alterações da empresa. Produtos podem ser pesquisados por nome ou SKU.

Você informou ter aplicado os SQLs 001 a 005 e removido suas cópias locais. As remoções foram preservadas. Para a nova correção de privilégios em convites, use somente `supabase/updates/202610150006_invitation_hardening.sql` sobre o 005 já instalado. Os caminhos históricos das migrations mencionados acima descrevem as entregas anteriores.

`npm test` agora executa `tests/team-database.mjs`, com 22 testes novos de equipe e segurança e fixture independente. A suíte anterior de 37 testes foi preservada em `npm run test:legacy-db`, mas exige os SQLs removidos e não foi reexecutada nesta etapa. Os resultados anteriores não devem ser confundidos com uma nova aprovação da suíte histórica.

Configuração, limitações e registro desta etapa: [docs/team-improvements.md](docs/team-improvements.md). Convites não são enviados por e-mail automaticamente; compartilhe o link gerado com o endereço convidado.

## Importação de planilhas — atualização 007

Nova aba exclusiva do proprietário: **Organização → Importar planilha** (`/app/imports`). Aceita Excel `.xlsx` e CSV para produtos, categorias, marcas, fornecedores e clientes, com modelos, associação de colunas, prévia, relatório de erros e confirmação transacional. Cadastros existentes são preservados.

Para ativar no banco, aplique `supabase/updates/202610150007_catalog_import.sql` sobre o esquema já instalado. Não há aplicação remota pelo agente.

Veja [docs/catalog-import.md](docs/catalog-import.md) para colunas, limites, critérios de duplicidade, testes e passo a passo. `npm test` agora executa os 22 testes de equipe mais as 27 verificações novas do importador; a suíte histórica de 37 testes continua separada e exige seus SQLs arquivados.
