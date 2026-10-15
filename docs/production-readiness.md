# Confiabilidade e operação

## Melhorias implementadas

Os seletores de catálogo nos formulários de produtos, compras, movimentações e inventário fazem busca no Supabase em páginas de 20 opções. Produtos aceitam nome ou SKU. Uma consulta independente mantém o cadastro já selecionado mesmo fora da página atual, inclusive referências antigas inativas. O formulário fica inválido enquanto uma seleção existente não puder ser carregada. Busca de opções não marca o formulário como alterado.

Filtros, busca, ordenação e colunas do catálogo e grupos recolhidos do menu são mantidos neste navegador por usuário/empresa. Valores são validados antes do uso e o sistema funciona se o armazenamento estiver indisponível. **Restaurar preferências** limpa a seleção da tela. Não são armazenadas linhas do catálogo nem rascunhos de formulários.

O roteador passou a oferecer bloqueio de navegação: formulários com alterações podem impedir links internos, mudanças programáticas de rota e voltar/avançar. Recarregamento e fechamento usam o aviso nativo do navegador. Troca de empresa e saída pelo menu também pedem descarte. Formulários de compra desabilitam o bloqueio durante o salvamento para permitir o redirecionamento após sucesso.

O dashboard orienta gestores na criação de filial, depósito e catálogo. A tela de recuperação de erros de renderização evita uma tela vazia e gera um identificador. O evento `stockpro:diagnostic` contém apenas código, identificador e horário: ainda não há coleta remota, retenção de logs ou serviço externo de monitoramento configurado.

## Diagnóstico remoto sem gravações

`npm run check:supabase` usa a URL e a chave pública de `.env.local`; testa leitura anônima de tabelas e recusa de execução anônima das funções de equipe e conferência. Não imprime chaves nem conteúdo de registros. Negação de acesso não comprova a instalação integral de migrations ou a correção das políticas.

Para testar leituras autenticadas entre duas empresas separadas, configure localmente variáveis **sem prefixo VITE_**:

```text
STOCKPRO_TEST_OWNER_TOKEN=<access token de um proprietário de teste>
STOCKPRO_TEST_ORG_ID=<UUID da primeira empresa>
STOCKPRO_TEST_OTHER_TOKEN=<access token de outro proprietário de teste>
STOCKPRO_TEST_OTHER_ORG_ID=<UUID da segunda empresa>
```

Use duas contas que não compartilham essas empresas. Tokens expiram; não os envie por chat nem os versione. Execute `npm run check:supabase:auth`. O script verifica sessões distintas, associação de proprietário, leituras próprias/estrangeiras e prévias de importação, sem confirmar importação e sem alterar cadastros. Na ausência dessas configurações, termina explicitamente como não executado.

A homologação de escrita ainda exige ambiente separado e contas de administrador/leitor: verificar cadastros, movimentações, inventário, importação, repetição de requisições e rollback. Não use chave service_role para testar RLS.

## Itens que dependem da infraestrutura

- Escolher e configurar coleta remota de erros; vincular os identificadores de incidente e testar um alerta sem dados pessoais.
- Confirmar a política de backups do projeto; restaurar uma cópia em ambiente separado e conferir saldos, histórico e associações antes de considerar a recuperação validada.
- Arquivar os próximos scripts SQL junto ao código. As cópias anteriores removidas pelo proprietário não foram reconstruídas.
- Atualização seletiva, criação automática de referências e desfazer importações exigem uma atualização transacional com os corpos atuais das funções/tabelas. Não foram adicionados sobre suposições do esquema. O comportamento continua preservando cadastros existentes.

O seed de `supabase/demo/stockpro_demo.sql` prepara uma empresa separada para demonstração com uma conta existente; não substitui esses testes de produção.

## Resultado desta etapa

O diagnóstico remoto anônimo terminou com sete verificações aprovadas (cinco consultas e dois RPCs), todas negadas sem sessão. O verificador autenticado não foi executado por ausência das duas sessões/empresas configuradas. Build, TypeScript, lint e formatação aprovados; 49 verificações de navegador com API simulada, 11 verificações locais da atualização 008 e 6 verificações do seed com contratos locais. Nenhuma gravação remota foi feita.
