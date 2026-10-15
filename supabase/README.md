# Configuração do Supabase

Nenhum SQL remoto foi executado pelo agente. A chave pública permite consultar a API, mas não inspecionar o catálogo SQL, corpos de funções, triggers, grants nem políticas.

## Antes de aplicar

No projeto correto do Supabase, abra **SQL Editor**, crie uma consulta e execute o conteúdo de `supabase/inspect.sql`. Revise o resultado antes de aplicar migrations. O arquivo é somente leitura.

A fundação pressupõe:

- `organizations(id uuid, name text)`;
- `organization_members(organization_id uuid, user_id uuid, role)`, com associação única por empresa/usuário;
- `profiles(id uuid)`, identificando `auth.users.id`;
- `branches(id uuid, organization_id uuid, name text, is_active boolean)`;
- `warehouses(id uuid, organization_id uuid, branch_id uuid, name text, is_active boolean)`;
- IDs com geração padrão e FKs existentes para empresas;
- `create_organization(text)` que recebe o nome, devolve UUID ou registro com `id`/`organization_id` e atribui o papel `owner` a `auth.uid()`.

A migration aborta se a assinatura de criação for diferente. Não troque a função existente às cegas: adapte a chamada em `stockpro_onboard` após inspecionar a definição. Registros inválidos preexistentes podem impedir a criação de constraints; não remova dados para contornar o erro. Corrija os vínculos com análise do administrador e repita a migration que sofreu rollback.

## Ordem

1. `migrations/202610150001_foundation.sql` — políticas restritivas adicionais às existentes, grants por coluna, relação composta depósito/filial, helpers e onboarding transacional/idempotente que chama a RPC existente.
2. `migrations/202610150002_inventory.sql` — categorias, fornecedores, produtos, saldo, histórico, RPC transacional de movimentação e resumo do dashboard.
3. `migrations/202610150003_inventory_reports.sql` — inventário físico auditável e relatório consolidado com filtros e paginação.

Cada arquivo possui `begin/commit`; aplique o conteúdo completo em uma consulta separada no SQL Editor. Os arquivos não devem ser executados novamente se já foram aplicados. Se você já usa Supabase CLI e o histórico de migrations está sincronizado, aplique as pendentes por `supabase db push`; não misture os dois métodos sem reconciliar o histórico.

Na última consulta pública, a API reconheceu as cinco tabelas originais, as tabelas de catálogo/estoque e `stockpro_dashboard`, retornando `42501` para acesso anônimo. Isso é consistente com privilégios revogados para `anon`, mas **não comprova que os arquivos locais foram aplicados integralmente**. `stock_counts` e `stockpro_product_balances` ainda não eram encontrados no cache da API. Confira o histórico do projeto antes de aplicar; se 001 e 002 já estiverem aplicadas integralmente, aplique somente 003.

Não há exclusão de tabelas ou registros nas migrations. Existem alterações intencionais de permissões: clientes deixam de alterar owner, papéis e organização de registros; criação direta pela RPC antiga deixa de ser acessível a `authenticated`. A criação é permitida pelo wrapper, na mesma transação, após validar a sessão.

As antigas funções `is_org_member`, `is_org_admin`, `can_manage_org` e seus corpos não foram obtidos pela API pública. Inspecione `SECURITY DEFINER`, `search_path`, owner e grants dessas funções e de qualquer outra RPC existente. As novas funções usam nomes qualificados e `search_path` vazio; o corpo da função de criação antiga deve ser revisado separadamente. Políticas antigas são preservadas e combinadas com as restrições novas nas tabelas originais.

## Auth

Em **Authentication → URL Configuration**:

- Defina Site URL para a origem de produção.
- Permita redirects de desenvolvimento para `http://localhost:5173/app/dashboard`, `http://localhost:5173/reset-password`, `http://127.0.0.1:5173/app/dashboard` e `http://127.0.0.1:5173/reset-password`.
- Permita os mesmos caminhos no domínio de produção.
- Habilite login por e-mail e ajuste a confirmação de cadastro conforme sua política.
- Configure SMTP e teste o recebimento dos e-mails antes de abrir para clientes.

Cadastros sem sessão exibem instrução para confirmação do e-mail. A recuperação usa `resetPasswordForEmail`; o link volta a `/reset-password`, onde a sessão permite atualizar a senha.

## Homologação remota obrigatória

Use duas contas de teste de sua propriedade, cada uma com uma empresa:

1. Crie/valide cada conta e faça o onboarding com filial e depósito.
2. Cadastre produtos e verifique atualização após recarregar a página.
3. Faça entrada, saída, transferência e contagem; confirme saldos e histórico.
4. Tente uma saída acima do saldo e confira que nenhuma alteração foi persistida.
5. Com o token do usuário B, tente ler e alterar IDs conhecidos da empresa A diretamente pela API. Deve retornar vazio ou erro, nunca dados de A.
6. Verifique que um membro de consulta não insere/edita/movimenta.
7. Valide recuperação de senha, logout, sessões expiradas, redirects e acesso direto a URLs privadas.
8. Verifique constraints/FKs, policies, grants e RPCs pelo SQL Editor, incluindo funções antigas.

Não use `service_role` nos testes de isolamento: esse papel contorna RLS.

## Publicação

Configure as mesmas variáveis públicas no provedor de hospedagem. O hosting precisa redirecionar URLs de navegação para `index.html` para suportar BrowserRouter. Não inclua `.env.local` nem os arquivos `.tmp` no controle de versão. Aplique migrations e configure Auth antes de publicar. Não há implantação remota feita nesta entrega.

## Migration 004 — contatos e compras

Aplique `migrations/202610150004_purchases_contacts.sql` após conferir que 001, 002 e 003 foram aplicadas integralmente. O arquivo adiciona clientes, marcas e vínculo ao produto; pedidos de compra e itens; salvamento transacional e recebimento integral com entrada no estoque. Não houve aplicação remota pelo agente.

Após aplicar 004, cadastre clientes e marcas, vincule a marca a um produto e confira o isolamento com a segunda conta. Cadastre um pedido com fornecedor e depósito da empresa ativa, inclua itens com quantidade e valor unitário, salve e confirme. Só receba após conferir fisicamente os itens. Verifique que o recebimento gera entradas e repetir a requisição não duplica saldo. Teste um produto desativado no pedido: o recebimento deve falhar sem qualquer entrada parcial. Um membro de consulta deve conseguir ler pedidos e ser impedido de salvar, confirmar, receber ou cancelar.

## Estado atual informado pelo proprietário

Os scripts 001 a 005 já foram aplicados no projeto e suas cópias locais foram removidas pelo proprietário. As instruções de criação acima são histórico da implantação; não reexecute esses scripts para instalar as melhorias de equipe.

Para esta atualização, confira `updates/README.md` e aplique somente `updates/202610150006_invitation_hardening.sql`. Também configure as URLs de confirmação das contas usadas em convites conforme `docs/team-improvements.md`.

## Importação por Excel/CSV

O módulo de importação utiliza o script pendente `updates/202610150007_catalog_import.sql`. Consulte `docs/catalog-import.md`. A importação é exclusiva do owner e precisa das tabelas e funções 001 a 005 que já foram aplicadas pelo proprietário. Não reexecute os scripts anteriores para habilitá-la.
