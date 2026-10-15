# Importação de catálogo por Excel e CSV

Aba: **Organização → Importar planilha**, rota `/app/imports`. Disponível somente ao proprietário da empresa, tanto na interface quanto nas funções do banco.

## Ativar no Supabase

Aplique `supabase/updates/202610150007_catalog_import.sql` no SQL Editor do mesmo projeto. Ele pressupõe as tabelas e funções das etapas 001 a 005 já instaladas, conforme informado pelo proprietário. Não é necessário reaplicar os SQLs antigos. A correção 006 trata dos convites e é independente da importação.

O script 007 cria o histórico `catalog_imports`, seus índices/política RLS e duas funções: `stockpro_preview_import` e `stockpro_commit_import`. Não exclui tabelas nem registros existentes. O agente não aplicou SQL remoto nem importou dados de usuários no banco remoto.

Guarde o script após executá-lo para preservar o histórico e permitir repetir os testes.

## Usar

1. Selecione a empresa correta no menu lateral e abra **Importar planilha**.
2. Escolha Produtos, Categorias, Marcas, Fornecedores ou Clientes.
3. Baixe um modelo Excel ou CSV. Os modelos contêm somente cabeçalhos, sem dados fictícios.
4. Preencha suas linhas mantendo os cabeçalhos. Você também pode usar uma planilha existente.
5. Selecione o arquivo, escolha a aba e confira a correspondência entre os campos e as colunas.
6. Clique em **Conferir dados antes de importar**. Nada é gravado nessa etapa.
7. Revise os valores normalizados, as linhas com erro e os cadastros existentes. Baixe o relatório CSV se precisar corrigir o arquivo.
8. Sem erros, marque a confirmação da empresa/dados e confirme a importação.
9. Consulte o resumo, o histórico de importações e os cadastros adicionados.

Categorias, marcas e fornecedores mencionados pelos produtos precisam existir antes. Importe esses cadastros primeiro. Os vínculos são resolvidos pelo nome dentro da empresa ativa. Referências ausentes, inativas ou ambíguas bloqueiam o lote.

## Colunas

| Tipo | Obrigatórias | Opcionais |
| --- | --- | --- |
| Produtos | Nome, SKU | Unidade, Categoria, Marca, Fornecedor, Estoque mínimo |
| Categorias | Nome | Descrição |
| Marcas | Nome | Descrição |
| Fornecedores | Nome | E-mail, Telefone, CPF / CNPJ |
| Clientes | Nome | E-mail, Telefone, CPF / CNPJ |

Os cabeçalhos reconhecem variações comuns em português e inglês, ignorando diferenças de acentuação e separadores. Quando houver mais de uma coluna candidata ou um cabeçalho desconhecido, a associação deve ser escolhida manualmente. O sistema não adivinha conteúdo sem correspondência confiável. Colunas não associadas não são importadas.

Produtos sem unidade usam `UN`; sem mínimo usam zero. Unidades aceitas: `UN`, `KG`, `G`, `L`, `ML`, `M`, `CX`. Não há importação de saldo inicial, movimentações, pedidos ou preços de venda. Estoques são registrados pelos fluxos existentes de movimentação e inventário.

Use SKU, telefone e CPF/CNPJ como **texto** no Excel, principalmente quando houver zeros à esquerda ou códigos longos. Um número que o próprio Excel já arredondou ou removeu zeros não pode ser recuperado automaticamente.

Estoque mínimo aceita valores numéricos do Excel ou texto como `2,5`, `2.5` e `1.234,5`. Um ponto sem vírgula é interpretado como separador decimal, portanto `1.234` significa 1,234 unidade, não 1.234 unidades inteiras. Confira o valor normalizado na prévia.

## Validação e duplicidades

A conferência é realizada no banco e repetida na confirmação. O lote é transacional: qualquer erro impede a gravação de todas as suas linhas, incluindo o histórico e os eventos associados.

- Produtos existentes são reconhecidos por SKU, desconsiderando caixa e espaços nas extremidades.
- Categorias, marcas e contatos existentes são reconhecidos pelo nome, com a mesma normalização.
- Registros existentes são preservados; suas descrições, vínculos e dados de contato não são sobrescritos ou reativados.
- Duplicidades dentro do próprio arquivo são erros e precisam ser corrigidas.
- A comparação não remove acentos dos nomes/SKUs dos registros. A tolerância a acentos aplica-se aos cabeçalhos.
- Uma mesma confirmação pode ser repetida após falha de rede sem duplicar a importação. Reutilizar seu identificador com dados diferentes é rejeitado.
- Os contadores finais refletem a validação repetida no instante da gravação; podem diferir da prévia se outro cadastro foi inserido nesse intervalo.
- O arquivo original não é armazenado. O servidor recebe apenas os campos associados e o número da linha. O histórico guarda tipo, contagens, responsável e data, sem cópia da planilha.

O relatório de conferência cobre todas as linhas, não só a página visível. O CSV de relatório neutraliza fórmulas ao abrir em planilhas. A tabela da prévia é paginada de 20 em 20 registros.

## Arquivos e limites

- Excel `.xlsx` e CSV `.csv`; salve arquivos antigos `.xls` como `.xlsx` antes de enviar.
- Até 5 MB por arquivo, 1.000 linhas de dados e 50 colunas por aba.
- Excel com até 20 abas; somente abas visíveis são apresentadas.
- A primeira linha preenchida é interpretada como cabeçalho.
- Excel com fórmulas, datas ou células com erro deve ser convertido para valores/texto antes da importação. Macros não são executadas.
- CSV aceita ponto e vírgula, vírgula ou tabulação, com aspas e campos multilinha. Há tratamento de UTF-8, UTF-16 com BOM e fallback Windows-1252.
- Leitura em Web Worker, com encerramento após 15 segundos e cancelamento ao sair da página.
- O diretório do arquivo ZIP/XLSX é conferido antes da descompactação: até 32 MB declarados no total e 16 MB por entrada. Isso é uma verificação preventiva, não uma garantia geral contra qualquer arquivo malformado.
- O payload de dados associado é limitado a 2 MB também no banco. Divida lotes maiores em arquivos menores.
- Formatação aplicada a milhares de linhas vazias pode fazer o Excel exceder os limites; remova essas áreas antes de enviar.

## Implementação e testes

### Melhorias de edição e modelos (008)

Use **Editar dados** para corrigir os campos sem refazer o arquivo Excel. A edição afeta somente a cópia temporária da importação. Qualquer alteração ou restauração cancela a prévia e a confirmação anterior; clique novamente em **Conferir dados antes de importar**. Trocar arquivo, aba, tipo ou associação de colunas descarta essas correções. Sair da página também descarta a cópia temporária.

Em **Modelos de colunas da empresa**, informe um nome e salve a associação atual. Ao abrir outro arquivo, selecione o modelo e clique em **Aplicar modelo**. A associação acompanha cabeçalhos reordenados, desconsiderando diferenças de acento e caixa. Cabeçalhos ausentes ou repetidos exigem associação manual. O modelo armazena apenas cabeçalhos e associações, sem linhas da planilha. Cada tipo de cadastro possui seus próprios modelos e nomes únicos por empresa.

Execute `supabase/updates/202610150008_import_mappings.sql` no SQL Editor para habilitar os modelos. Requer a função de proprietário da atualização 005. A edição temporária usa os RPCs já existentes da atualização 007. Somente proprietários podem ler, salvar e excluir modelos; a restrição existe também no banco com RLS e validação dos campos/índices.

Validação desta melhoria: `npm run test:import-improvements` executa 11 verificações locais de remapeamento e PostgreSQL/RLS com o SQL 008 real. A suíte de navegador inclui correção com invalidação da prévia, restauração, salvamento, aplicação em arquivo reordenado e exclusão de modelo, com API simulada. A suíte antiga `npm test` depende dos scripts 006/007 removidos pelo usuário e não pode ser repetida sem esses arquivos; eles não foram recriados nesta etapa.

Novos arquivos: `src/features/imports/ImportsPage.tsx`, `model.ts`, `parser.ts`, `spreadsheet.ts`, `spreadsheet.worker.ts`; `supabase/updates/202610150007_catalog_import.sql`; `tests/imports.mjs` e este documento.

Modificados: rotas, sidebar, atalhos do catálogo, eventos de auditoria, feedback, estilos, testes de navegador, scripts e dependências. ExcelJS é carregado no worker de importação, sem entrar no bundle inicial de navegação. A dependência UUID usada pelo ExcelJS foi fixada na versão corrigida; leitura/escrita e formatação condicional foram verificadas. A instalação/auditoria de dependências terminou sem avisos de vulnerabilidade conhecidos.

Resultados executados nesta etapa:

- TypeScript, build de produção, lint e formatação: aprovados.
- `npm run test:imports`: 27 verificações de parser, mapeamento e PostgreSQL local, executando o SQL real da atualização 007 sobre uma fixture.
- `npm test`: também executou os 22 testes existentes de equipe/segurança. Total: 49 verificações locais.
- Chrome headless sobre a versão de produção: 40 verificações, incluindo arquivos reais de teste CSV/XLSX, modelo Excel, fórmulas, erros, confirmação, duplicidades e restrição de acesso. Respostas autenticadas de API foram simuladas.
- Nenhuma importação autenticada real foi realizada no Supabase remoto nesta etapa.

Para repetir o teste de produção: rode `npm run build`, depois `npm run preview -- --host 127.0.0.1 --port 5174`. Em outro terminal PowerShell, defina `$env:STOCKPRO_TEST_URL='http://127.0.0.1:5174'` e rode `npm run test:browser`.

Consulta pública anterior ao projeto: `catalog_imports` e `stockpro_preview_import` ainda não estavam no cache da API (`PGRST205`/`PGRST202`). Portanto, a atualização 007 ainda precisa ser disponibilizada no projeto antes de usar a importação real. Essa checagem não criou nem modificou registros.
