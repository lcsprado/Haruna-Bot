# Backup externo seguro da V1 — execução manual assistida

17/11/2026 — PR #387. O backup ainda NÃO foi executado. O código não faz reset nem altera a produção.

Aiven: serviço `lcsh-3393/alphabot` RUNNING, 1 GiB de disco, 20 conexões máximas. Consulta SQL SOMENTE LEITURA encontrou `alpha_prod_v2` com **149.386.943 bytes (~142 MiB)**, e o painel indica uso de disco de aproximadamente **40,7%** do serviço. Backups automáticos do Aiven existentes de 08/11 a 17/11; eles são uma proteção adicional, NÃO o arquivo independente necessário à virada.

## O que já está preparado
- `scripts/reboot-backup-v1.mjs` pode gerar arquivo PostgreSQL em formato `custom`, conferir a lista de objetos com `pg_restore --list`, gerar SHA-256, gravar manifesto privado e validar o arquivo depois de uma cópia offline.
- Só funciona com `DATABASE_URL` do banco **alpha_prod_v2 em host .aivencloud.com** e `ALPHA_BACKUP_ACK=I_UNDERSTAND_READ_ONLY`. Rejeita CI, banco errado, destino dentro do GitHub e credenciais ausentes. Segredos não são escritos em arquivos do repositório ou nos argumentos do subprocesso.
- Por padrão, salva numa pasta particular `AlphaBot-Backups` na pasta pessoal do operador. Opcional `ALPHA_BACKUP_DIR` aponta para um disco externo. Requer `pg_dump` e `pg_restore` instalados no computador confiável com versão cliente compatível com Aiven.
- A execução real exige uma máquina/terminal com PostgreSQL Client, credenciais de produção em ambiente local seguro e conexão TLS. Não anexar banco nem senha ao chat ou GitHub.

## Protocolo do corte — nenhuma etapa automática
1. Antes do corte, criar o arquivo privado com `node scripts/reboot-backup-v1.mjs --create`, com as variáveis locais corretas. Transferir para disco privado, nunca para repositório, público, Render ou Vercel.
2. Executar `node scripts/reboot-backup-v1.mjs --verify /CAMINHO/DO/ARQUIVO.manifest.json` no local de cópia. Isso confirma SHA-256 e tamanho, mas NÃO prova que o PostgreSQL consegue restaurar todo o conteúdo.
3. Restaurar em banco **isolado e vazio** sob controle do operador, usando cliente `pg_restore` compatível; comparar esquema, número de tabelas, registros e consultas de integridade. Desligar qualquer WhatsApp, Web, scheduler ou worker no clone. Deixar o clone desativado em seguida.
4. No dia da virada, interromper serviços V1 e verificar ausência de outras instâncias. O dono fará o reset das quatro contas, preservando credenciais e grupos.
5. Confirmar manualmente os quatro JIDs/classes, economia V2, ausência de recompensas antigas. O código da V2 só aceitará `alpha_prod_v2` com **todas** as atestações de corte, além da proteção WhatsApp.
6. Até fechar verificações, manter backup V1 externo e Aiven inalterado. Se o backup não for restaurável, NÃO resetar nem ativar V2. O Neon é secundário e opcional, não é bloqueador de desenvolvimento.

### Limitações
- `pg_restore --list` e checksum NÃO substituem teste de restauração.
- Os parâmetros de ambiente que autorizam a virada são declarações do operador; o aplicativo não verifica sozinho que um backup existe ou que o serviço antigo realmente parou.
- A conexão ChatGPT/Aiven disponível suporta somente consultas SQL, não exportação `pg_dump` ou transferência integral de backup. Por isso, esta etapa é preparação para execução futura em máquina confiável, sem inventar um backup realizado.
