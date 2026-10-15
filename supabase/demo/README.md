# Empresa de demonstração

## Empresa de tecnologia

Use `stockpro_tecnologia_demo.sql` para criar **Nexora Tecnologia · Demonstração**, vinculada à conta `gustavo.h.monteiro@aluno.senai.br`. Essa conta precisa existir e estar confirmada no Supabase Auth antes da execução. O script inclui 36 produtos de informática, 8 categorias, 6 marcas, 6 fornecedores, 10 clientes, 2 filiais, 3 depósitos, movimentos, saldos e 12 inventários. Ele possui identificadores e controle de repetição independentes da demonstração de materiais, sem modificar essa empresa. Execute o arquivo inteiro no SQL Editor e depois selecione a nova empresa no sistema.

## Empresa de materiais

1. Crie uma conta pelo cadastro do StockPro e confirme o e-mail. Se já possui uma conta, pode usá-la: o script adiciona uma empresa separada.
2. Abra `stockpro_demo.sql` e substitua o valor de `v_email` pelo e-mail dessa conta.
3. Execute o arquivo inteiro no **SQL Editor** do projeto que contém os módulos 001 a 005 já aplicados.
4. Atualize o StockPro, entre com essa conta e selecione **Horizonte Materiais · Demonstração** no seletor de empresa.

O script cria o perfil público se ainda estiver ausente, mas não insere usuários diretamente em `auth.users`, não define senha, não confirma e-mails e não altera o perfil existente. O nome exibido no aplicativo continua sendo o informado no cadastro da conta.

Dados: 1 empresa, proprietário associado, 2 filiais, 3 depósitos, 8 categorias, 6 marcas, 6 fornecedores, 10 clientes, 36 produtos, entradas, saídas, transferências, saldos e 12 inventários físicos. Há exemplos com divergência, sem divergência e produtos abaixo do estoque mínimo. Contatos e marcas são fictícios; os e-mails usam o domínio reservado `.test`.

Os saldos e o histórico são criados pelas RPCs `stockpro_move` e `stockpro_count`, sem inserção direta nessas tabelas. Todo o script roda em uma transação. A marca de auditoria `demo_seed_completed` impede repetir o lote para a mesma conta; alterações feitas posteriormente na demonstração são preservadas. Não remova essa marca para tentar recriar o lote.

Se uma RPC ou coluna for diferente no seu projeto, a transação falha e deve ser revisada antes de tentar novamente. Não execute comandos parciais para contornar o erro. O script foi validado com contratos locais das RPCs; os corpos originais de 001 a 005 não estão mais no workspace, portanto não houve validação integral do esquema remoto nem execução remota do seed.

Teste local: `npm run test:demo`.
