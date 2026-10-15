# Estrutura e interface

## Base visual

`src/index.css` importa a base Tailwind e os arquivos de estilo:

- `styles/theme.css`: tipografia, regras básicas e variáveis de cores, superfícies, bordas e espaçamentos.
- `styles/components.css`: estilos básicos de painéis, campos, tabelas e mensagens.
- `styles/layout.css`: estrutura do espaço de trabalho, cabeçalho e navegação.
- `styles/pages.css`: estilos específicos de autenticação, dashboard e demais telas, incluindo ajustes responsivos existentes.
- `styles/refinements.css`: apresentação compartilhada dos componentes novos e refinamentos responsivos. Carregado por último para compatibilidade com as telas existentes.

As telas mantêm a identidade escura com destaque azul. Cabeçalhos, campos, botões e estados usam uma hierarquia consistente; mensagens e estados incluem texto, além de cor. O movimento reduzido continua respeitado.

## Componentes compartilhados

Em `src/components/ui`: `Button`, `PageHeader`, `Pagination`, `StatusBadge`, `ConfirmationDialog`, `FormSection`, `FieldError`, `DataTable` e `useUnsavedChanges`.

O cabeçalho é utilizado em catálogo, locais, compras, estoque, inventário, relatórios, equipe, auditoria, importações, conta e configurações. A paginação compartilhada informa a faixa e o total, mantendo os tamanhos de página existentes. O diálogo usa o elemento nativo `dialog` para foco e Escape.

`DataTable` mantém a tabela no desktop e identifica cada célula pelo cabeçalho em telas pequenas. Usado em compras, estoque, movimentações, inventário, relatórios e locais. As cinco telas do catálogo possuem cartões dedicados no celular. A prévia de importação conserva rolagem horizontal para comparação de muitos campos.

## Navegação

A configuração está em `src/components/layout/navigation.ts`: visão geral, cadastros, estoque, compras, análises e administração. As permissões continuam filtrando importação e auditoria. A busca ignora diferenças de acento e caixa. Os grupos podem ser recolhidos.

Há caminho da página, atalho para pular ao conteúdo e controle de foco no menu móvel, com fechamento por Escape e retorno ao botão de abertura.

## Catálogo e formulários

Filtros de situação e ordenação por nome/SKU são enviados ao Supabase antes da paginação, com empresa e opções na chave do cache. Não filtram apenas os registros já carregados. Escolha de colunas afeta a tabela do desktop com preferência persistida por usuário e empresa neste navegador; cartões móveis mantêm os dados essenciais.

As ações de linha ficam em um menu; ativar e desativar exigem confirmação. Exportação continua exportando somente a página carregada, com essa indicação no botão. Produtos e contatos têm seções no formulário; erros do schema são associados aos campos do catálogo.

Catálogo, locais, conta, configurações, movimentações, inventário e pedidos usam aviso de alterações não salvas. A proteção cobre links, recarregamento/fechamento e troca de empresa/saída pelos controles do sistema. O roteador também bloqueia voltar/avançar e mudanças internas de rota quando há alterações. Não é um salvamento automático. No catálogo, cancelar permite manter ou descartar o formulário em um diálogo.

## Importação

Quatro etapas: arquivo, colunas, correções e confirmação. A leitura leva às colunas; a conferência leva às correções. Somente uma prévia sem erros e com novos cadastros permite avançar à confirmação. O checkbox explícito continua obrigatório. Editar invalida a prévia e impede a gravação até uma nova conferência. Trocar o arquivo retorna à primeira etapa durante o processamento, inclusive em caso de falha.

## Validação

TypeScript, lint, formatação e build de produção. `npm run test:browser` verifica fluxos existentes e novos: grupos/busca, filtro e ordenação, escolha de colunas, cartões móveis, confirmação de status, proteção de formulário e importação em etapas. As respostas autenticadas são simuladas; isso não valida o banco remoto.

`npm run test:import-improvements` mantém os testes PostgreSQL da atualização 008. As suítes antigas dependem de 006/007, removidos pelo usuário. Esta etapa de interface não precisa de novo SQL; os recursos de importação dependem das atualizações previamente entregues.
