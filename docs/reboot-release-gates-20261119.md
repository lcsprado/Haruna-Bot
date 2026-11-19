# Alpha Bot 2.0 — gates finais de liberação
19/11/2026 · PR #387 draft · branch feature/reboot-classes-only-20261117
Este documento não autoriza lançamento nem comprova backup real.

## Evidências automatizadas
- HEAD 837a1ff: 68/68 workflows aprovados, inclusive regressão estendida e Chromium/PostgreSQL descartável.
- Raid10, Raid70, PvP, Dungeon, pets, XP, concorrência, login, isolamento entre contas e restauração sintética homologados nos cenários registrados em STATUS_V2.md.
- PWA: teste adicional com service worker real, limpeza de cache legado, API autenticada sem cache, recusa de API offline e logout persistente. Aguardando CI neste checkpoint. Não equivale a instalação nativa em Android/iOS.

## Gate operacional — bloqueado
1. Conferir quotas no painel Vercel/Neon/Render/GitHub antes da janela. Aiven 1 GB; nenhuma cópia adicional da base dentro do mesmo serviço por padrão.
2. Identificar por evidência o worker WhatsApp ativo, API principal e consumidores de tarefas. Confirmar a versão e a origem de dados de TODOS os endpoints. Atenção: web/vercel.json roteia Cerco para alpha-web-api-beta e demais APIs para alpha-bot-whatsapp-m3lc. Não presumir que o beta está atualizado ou aponta ao banco correto. O Cerco V5/V6 deve continuar funcional; qualquer troca de roteamento exige homologação própria, não remover às cegas.
3. Backup externo completo da V1 em E:\AlphaBot-Backups, com arquivo custom, TOC, SHA-256 e restauração em ambiente isolado autorizado. Backup interno/restore sintético não substitui arquivo real. Proteger credenciais e dados de autenticação. Não carregar dump no GitHub.
4. Definir janela de manutenção com aprovação humana explícita. Parar todos os escritores V1 e schedulers, confirmar ausência de segundo consumidor. Se houver escrita depois do backup, gerar backup final e verificar restore do mesmo arquivo antes do reset.
5. Dono executa reset manual, preservando identidades, permissões, credenciais WhatsApp/Web, licenças e grupos. Conferir estado inicial e ausência de recompensas/eventos antigos. Não executar reset por script automático.
6. Somente depois: configuração de cutover conforme reboot-classes-policy.js, incluindo SHA-256 do backup final validado; aprovar merge/deploy da versão exata. Conferir serviços e configurações sem expor valores de segredos.
7. Smoke test controlado: identidade do proprietário e autorização, sessão WhatsApp única, login de dois jogadores e contas isoladas, menus/classe/Lv1, inventário/saldo, PvP Lv20/21, Raid, Cerco, Web/PWA atualizado, tempo de resposta e memória. Liberar jogadores somente após aceite.
8. Rollback antes de qualquer escrita V2: parar V2, restaurar backup final validado em alvo explicitamente autorizado, repor versão/configuração V1 e restabelecer sessão única. Após escrita real V2, avaliar conciliação e perda de progresso; não fazer rollback automático.

## Decisões de segurança
- Nenhum serviço novo, plano pago, compute Neon ativo ou segundo WhatsApp para homologação.
- Não substituir evidência por flags. Não reutilizar banco produtivo para testes.
- Status obrigatório antes da liberação: READY somente após TODOS os gates acima. Atualmente NO-GO.
