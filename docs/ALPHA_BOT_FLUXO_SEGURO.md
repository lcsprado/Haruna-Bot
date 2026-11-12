# Alpha Bot — fluxo seguro de investigação, testes e homologação

Estado: PROPOSTA EM PR DRAFT — NÃO MESCLAR SEM APROVAÇÃO EXPLÍCITA.
Escopo: procedimento de engenharia. Este arquivo não autoriza mudanças em produção, saldos, banco, deploy, chaves ou mensagens aos jogadores.

## 0. Topologia constatada em 12/11/2026 (somente leitura)
- Repositório: lcsprado/Haruna-Bot (público); branch padrão master.
- Render WhatsApp principal: alpha-bot-whatsapp, branch whatsapp-only, deploy automático ligado.
- Render legado: Haruna-Bot, branch neon-migration, deploy automático ligado. Não presumir que está desativado apenas por ser antigo.
- Render API de validação: alpha-web-api-beta, deploy automático desligado. NÃO presumir isolamento do banco sem verificar conexão e efeitos externos.
- Vercel Web: alpha-web-rpg, últimos deploys associados à branch fix/cerco-preflight-group-access-20261107.
- Vercel domínio alphabot.lcsprado.com.br: projeto alphabot-rpg-oficial; confirmar qual frontend/alias é autoritativo antes de testes.
- Aiven: projeto lcsh-3393, PostgreSQL alphabot RUNNING; bases alpha_prod_v2 (produção) e alpha_homolog (homologação), ambas acessíveis por leitura.
- Aiven: termination_protection=false na inspeção. Backups existentes não constituem prova de restauração testada.
- A master e a whatsapp-only estão significativamente divergentes. NÃO fazer merge entre elas como atalho.
- Verificar continuamente a topologia porque deploys e configurações mudam.

## 1. Regras obrigatórias
1. Produção por padrão somente leitura. Para Aiven, usar exclusivamente SELECT/EXPLAIN durante investigação.
2. Nenhum teste com alteração de saldo, item, jogador, negócio, Raid, Boss, leilão, sessão, WhatsApp ou carteira real.
3. Nunca imprimir ou registrar tokens, números de telefone, segredos, DATABASE_URL, conteúdo de .env ou dados pessoais em logs/PR.
4. Não usar cópia de dados reais para testar sem anonimização e autorização. Preferir fixtures sintéticas.
5. Uma mudança por PR, com problema reproduzível, impacto, testes, plano de reversão e evidências.
6. Nunca editar diretamente whatsapp-only, neon-migration ou branch atualmente publicada na Web para investigar. Criar branch de trabalho a partir do commit/branch correto do componente.
7. PR não equivale a aprovação de produção. Manter PR como DRAFT enquanto critérios não cumpridos.
8. Não realizar deploy, merge, migração, alteração de variável ou mudança de configuração de produção sem autorização explícita do responsável.

## 2. Etapas e responsáveis
A. TRIAGEM (Work): reproduzir sintoma com horários, saída esperada/real, canais afetados, versão e IDs técnicos não sensíveis. Atribuir AB-XX ou número de incidente.
B. BASELINE (GitHub, Render, Vercel, Aiven somente leitura): confirmar SHA realmente implantado em cada serviço, branch, estado de deploy, últimos erros, backup disponível e atividades em andamento.
C. ISOLAMENTO: criar branch de correção não publicada. Preparar ambiente descartável ou homologação com banco separado, identidades sintéticas e envio de WhatsApp desabilitado. Confirmar DB de conexão por leitura ANTES de escrever.
D. REPRODUÇÃO (Codex): teste que falhe ANTES da correção, demonstrando a causa. Evitar alterações colaterais.
E. IMPLEMENTAÇÃO (Codex): menor patch possível, com tratamento transacional/idempotência quando houver economia, saldo ou recompensa.
F. CI: lint/sintaxe; testes unitários; regressão focada; teste de integração SQL em PostgreSQL descartável; segurança; verificar status de TODOS os checks. Não assumir sucesso geral se algum job estiver QUEUED/PENDING.
G. HOMOLOGAÇÃO: validar Web e WhatsApp com fixtures, concorrência, restart e rollback de dados sintéticos. Confirmar que a homologação NÃO usa alpha_prod_v2 nem notifica jogadores.
H. REVISÃO: apresentar PR, diffs, evidências, risco, SHAs, plano de deploy/rollback e pedir aprovação explícita; PR DRAFT até concluir.
I. RELEASE: somente após aprovação, janela operacional segura e checagem de partidas/Raids/Boss em andamento. Merge controlado na branch que realmente implanta o componente, com observabilidade.
J. PÓS-RELEASE: observar logs/erros, validar função sem mutar conta real, documentar resultado; rollback somente com autorização e avaliação de alterações no esquema/dados.

## 3. GATES — pare se qualquer condição for verdadeira
- Não se sabe qual SHA está ativo, ou há discrepância entre projeto Web, domínio e API.
- CI falhou, não concluiu ou nenhum teste específico foi executado.
- Ambiente de teste pode apontar para alpha_prod_v2 ou enviar ações reais.
- Há Raid/Boss em andamento afetado pela mudança, ou manutenção não aprovada.
- Não existe plano de rollback e backup adequado ao tipo de mudança.
- O PR inclui recursos não relacionados ou conflitos com proposta concorrente.
- Não houve aprovação explícita para alterar produção.

## 4. Matriz mínima de testes
- Carteiras ADMIN: resolução de identidade WhatsApp, @lid, rejeição de destinatário ambíguo, idempotência, atomicidade, sem saldo fantasma.
- Economia e negócios: cobrança/coleta sem duplicação, concorrência e extrato auditável.
- Mercado/empréstimos: bloqueios consistentes, deadlock/retry e não permitir saldo negativo indevido.
- Raid/Boss/Raid Lote: sessões isoladas, chaves, cotas, custo, recompensa, derrota, restart, nenhuma dupla liquidação, paridade Web/WhatsApp.
- PvP/heróis/pets/escudos: dano real, cooldown, resistência crítica e preservação de equipamento.
- Web: autenticação isolada por jogador e autorização de operações administrativas.
- Mudanças SQL: atomicidade, rollback de transações e compatibilidade retroativa.

## 5. Casos pendentes observados em 12/11/2026
- PR #316 aberto para destinatário ADMIN via @lid; a descrição afirma reconciliação prévia de dinheiro. NÃO repetir crédito sem reconciliação independente e aprovação.
- PRs #288 e #289: duas propostas abertas de Raid Lote; escolher uma fonte de verdade e evitar merge cruzado.
- Release Web alpha-web-rpg observado a partir de branch funcional específica, e domínio alphabot.lcsprado.com.br associado a outro projeto Vercel: mapear a rota de publicação.
- GitHub Actions da revisão #316 tinham vários checks concluídos, porém pelo menos um estava QUEUED no instante da consulta. Revalidar no momento da aprovação.
- O repositório é público: auditar segredos e permissões sem publicar valores.
- Reforçar protection/required checks/review nas branches de deploy via configurações GitHub após aprovação. Este documento NÃO aplica essas proteções automaticamente.

## 6. Template de evidência para cada correção
ID / comportamento esperado / observado / causa raiz / SHAs e ambientes / diff resumido / testes (com URL e status) / prova de isolamento / risco operacional / migração (sim/não) / backup e rollback / aprovação explícita / resultado pós-release.

## 7. Uso das ferramentas
- ChatGPT Work: coordenação de etapas, trilha de auditoria, comparação de fontes e relatório.
- Codex: patch mínimo, testes e PR não publicado.
- GitHub: rastreabilidade, revisão e checks; merges e branch rules exigem aprovação explícita.
- Aiven: inspeção somente leitura na produção; escrita apenas em base de homologação isolada e autorizada.
- Render: observar deploys/logs; não usar trigger_deploy em produção nesta etapa.
- Vercel: analisar deploys, branches e previews; não promover nem reatribuir domínios nesta etapa.

Regra final: sem prova de isolamento, sem testes completos e sem aprovação explícita, NÃO PUBLICAR.
