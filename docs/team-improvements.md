# Equipe, convites e rastreabilidade — 15/10/2026

## Implementado

- Equipe com nomes, papéis, paginação e e-mails visíveis somente ao próprio usuário ou à gestão.
- Convites por link, vinculados ao e-mail confirmado da conta, com validade de sete dias e revogação.
- Proprietário pode convidar administradores ou pessoas com acesso de consulta; administrador pode convidar pessoas com acesso de consulta.
- Mudança de papel e remoção de acesso com confirmação na interface e validação no banco.
- Proteção do proprietário e bloqueio de alteração do próprio papel/acesso.
- Convites expirados, revogados, usados por outra conta ou emitidos por alguém sem a permissão atual são rejeitados.
- Aceitação idempotente e seleção da organização recém-adicionada após atualizar as associações autorizadas.
- Retorno ao convite após login/cadastro, com restrição do destino a rotas locais válidas de convite.
- Página `/app/audit` para consultar alterações por área, com paginação e restrição a proprietários/administradores.
- Busca de produtos por nome ou SKU, mantendo o filtro de empresa e tratando caracteres especiais.
- Mensagens específicas para convite indisponível, e-mail não confirmado e pessoa já associada à empresa.

Convites são gerados para compartilhamento manual. Não há envio automático de e-mail pela aplicação. A confirmação de e-mail da conta continua sendo responsabilidade do Supabase Auth e da configuração SMTP do projeto.

## Estado do Supabase

Você informou que aplicou os scripts 001 a 005 e removeu os arquivos locais. Essa remoção foi preservada. A API pública reconhece `organization_invitations`, `audit_events`, `stockpro_team` e `stockpro_invitation`, e nega seu acesso anônimo com `42501`. Isso confirma a disponibilidade desses endpoints e a restrição anônima, não uma auditoria dos corpos SQL remotos ou um teste completo de RLS com contas reais.

O agente não aplicou SQL remoto, não criou contas de teste e não enviou convites a pessoas reais.

## Correção adicional 006

O arquivo `supabase/updates/202610150006_invitation_hardening.sql` deve ser aplicado após o 005 já instalado. Ele impede um administrador de substituir por um convite de consulta um convite de administrador criado pelo proprietário para o mesmo endereço. Atualiza somente a função de geração de convites e seus grants; não recria tabelas, não reaplica migrations antigas e não altera registros existentes.

Guarde os próximos SQLs e seus históricos no projeto, mesmo após aplicar no banco. Não reexecute scripts anteriores sem conferir o histórico.

## Configuração de retorno do Auth

O cadastro pelo link de convite usa `/invite/<uuid>` como destino da confirmação. Configure as URLs permitidas no Supabase Auth para os domínios em que executa o app. Em desenvolvimento, exemplos restritos a essa rota são `http://localhost:5173/invite/*` e `http://127.0.0.1:5173/invite/*`. Para produção, permita o caminho de convite no domínio efetivamente usado e mantenha a Site URL correta. O recurso de padrões e as diferenças entre `*` e `**` estão na [documentação oficial do Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Não use domínio localhost em links destinados a usuários de outras máquinas. Gere os convites no domínio compartilhável da aplicação. Valide a confirmação de e-mail e o retorno ao convite com o provedor real antes de liberar esse fluxo para clientes.

## Arquivos

Novos: `src/features/team/TeamPage.tsx`, `InvitationPage.tsx`, `AuditPage.tsx`, `team.ts`, `src/lib/authDestination.ts`, `supabase/updates/202610150006_invitation_hardening.sql`, `tests/team-database.mjs` e `tests/fixtures/team.sql`.

Alterados: rotas, sidebar, autenticação, contexto de organizações, página de conta sem o antigo componente de equipe, catálogo/busca, feedback, scripts de teste e documentação.

## Testes

`npm test` executa a nova suíte local de equipe e segurança. São 22 verificações, incluindo papel armazenado como enum, confirmação do e-mail, acesso cruzado, expiração, revogação, replay, privilégios do emissor, proteção do owner, auditoria e destino seguro de login.

A fixture é uma representação local do comportamento do módulo 005, não uma exportação do Supabase remoto. O teste também executa o SQL real da correção 006. Alterações efetuadas diretamente no banco podem divergir dessa representação.

A suíte histórica de 37 testes foi preservada em `tests/database.mjs`, acessível por `npm run test:legacy-db`, mas não pôde ser repetida nesta etapa porque depende dos quatro SQLs removidos. Para reproduzi-la, é necessária uma cópia arquivada desses scripts. Nenhum teste antigo foi declarado aprovado nesta etapa.

Os testes de navegador usam API e sessão simuladas e não enviam convites reais. Incluem a geração/revogação de convite, confirmação de mudança de papel, entrada na organização adicionada, bloqueio da página de auditoria para consulta e regressões dos módulos anteriores.

## Próximas etapas ainda não implementadas

Pedidos de venda com reserva de estoque, recebimento parcial, devoluções, importação de planilhas, seleção paginada de produtos, leitura de códigos de barras, cobrança e monitoramento de produção continuam fora desta etapa. Backups e testes de restauração dependem do ambiente de hospedagem e do Supabase. Esta entrega prioriza equipe, acesso, rastreabilidade e a busca do catálogo.

Resultado final da etapa: build, TypeScript e formatação aprovados; 22 testes locais de equipe/segurança passaram e 34 verificações de navegador com API simulada passaram. A suíte histórica não foi repetida, e os fluxos com contas/e-mails reais do Supabase ainda exigem homologação.
