# Alpha Bot 2.0 — capacidade de banco e decisão mínima para corte
17/11/2026. Leitura de código e documentos existentes; sem chamadas SQL ou mudanças em infraestrutura.

## Decisão
O dono fará o reset dos jogadores. No PR, **não implementar migração/reset de carteiras**. Manter o mesmo código dos sistemas existentes; cortar collabs, manter Paladino/Necromante/Samurai/Berserker, aplicar a economia revisada.

A ideia de arquivar a V1 no Neon e dedicar o Aiven à V2 é viável apenas depois de comprovar um backup íntegro e restaurável, capacidade real e isolamento do backup. Os bancos `alpha_prod`, `alpha_prod_v2`, `alpha_homolog` e demais bancos estão no mesmo serviço Aiven de quota de 1 GiB e 20 conexões; criar outro banco no mesmo serviço não aumenta esses limites. O Neon histórico teve cota excedida/branches arquivadas e não está autorizado como destino de restore no momento.

## Restrições e controle já implementados em Git
1. Em V2, pool principal reduzido de cinco para até **três conexões por processo** no Aiven (ou de 10 para três no Neon). A V1 permanece inalterada; o runtime lock WhatsApp utiliza **uma conexão adicional**. Web e outros processos consomem pools próprios: `conexões possíveis = somatório por processo + locks + acesso administrativo`; nunca considerar apenas um pool.
2. Bingo V2 limita 64 cartelas por edição, uma por jogador e JID de até 128 caracteres, para não armazenar um estado ilimitado na coluna JSONB.
3. Estado ativo/calendário de eventos V2 limitado a **24 KiB por registro** no `trevo_settings`. O calendário já conserva no máximo 24 edições. Ao ultrapassar o limite a transação é revertida, sem débito do jogador.
4. Bingo e leilão reutilizam `trevo_settings`, `wallets`, `transactions` e `inventories`, **sem novas tabelas nem duplicação do banco**. A V2 não cria workers de banco ou cron externo quando desabilitada.
5. Oito bancos listados no serviço Aiven são histórico de uso, **não são oito capacidades independentes**. Nunca duplicar dados neles por conveniência.

## Antes de usar Aiven exclusivamente na V2
- Confirmar uso real de disco por database, crescimento dos últimos dias e conexões efetivas por aplicativo. Reservar margem de espaço para autovacuum, índices e picos do PostgreSQL.
- Criar **um** backup consistente e recuperável da V1 para armazenamento seguro fora do Aiven. Só considerar Neon depois de confirmar plano/cota e teste de restauração. Não transferir credenciais/WhatsApp para cópia de backup.
- Desligar totalmente V1, verificar que não existem Web/WhatsApp/cron concorrentes, registrar destino e SHA de código. O guard atual requer nome `alpha_reboot_*` e recusa `alpha_prod_v2`; no dia do corte é preciso aprovar e testar como resolver isso sem usar o banco da V1 durante o desenvolvimento.
- O dono efetua reset dos dados de jogo, preservando contas/identidades e grupos. Não tentar deduzir que tabelas de permissão devem ser apagadas.
- Habilitar V2 somente depois de verificar backup/restore, integridade, contagem de jogadores, menus e despesas/receitas. Em caso de falha, parar implantação e restaurar a V1; nunca sincronizar dois bancos via escrita simultânea.

## O que NÃO foi feito
Nenhum backup/restore, reset, SQL, alteração de plano, ativação do Neon, cópia de dados reais, deploy ou alteração de env. Os limites acima estão apenas no PR #387.
