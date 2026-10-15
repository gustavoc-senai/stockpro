# Atualização 008 — modelos de importação

## Atualização 009 — status para membros da empresa

Execute somente `202610150009_catalog_status.sql` para permitir que qualquer membro (incluindo Consulta) ative/desative produtos, categorias, marcas, fornecedores e clientes. A RPC altera exclusivamente `is_active`, verifica a empresa e registra auditoria. Permissões de edição completa, criação, movimentação de estoque, equipe, filiais e depósitos permanecem as anteriores. O papel Consulta é apresentado como **Consulta e status** na interface. Nenhum novo papel é criado.

Se 008 retornar `stockpro_valid_import_mapping already exists`, não o reexecute: isso indica que essa função já existe, embora o erro isoladamente não comprove que toda a atualização foi aplicada. A permissão de status pertence ao 009 e não depende de reaplicar o 008.

Execute `202610150008_import_mappings.sql` no SQL Editor do Supabase.
Requer a fundação multiempresa e a função `stockpro_owner` do script 005 já aplicadas.
A importação de cadastros continua dependendo do script 007 já aplicado.

Esta atualização adiciona modelos de associação de colunas, isolados por empresa e tipo de cadastro. Somente o proprietário pode ler, criar e excluir modelos. Não armazena linhas da planilha nem modifica cadastros existentes.

Os scripts anteriores removidos do projeto não foram recriados. O script 008 ainda precisa ser aplicado ao banco remoto.
