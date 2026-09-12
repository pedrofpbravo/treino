# Funcionalidade: exercício substituto (IMPLEMENTADA no v7.3)

Status: implementada em 2026-09-11 com os ajustes decididos pelo Pedro sobre esta proposta: os similares são CADASTRADOS MANUALMENTE por exercício (campo `similarIds`, relação simétrica, seção "Similares" na aba Exercícios), em vez da sugestão automática por músculo principal descrita abaixo; trocar com séries marcadas descarta as séries do original (sem transferência, original não gera log). O restante do desenho abaixo foi implementado como proposto e o documento fica como registro da decisão.

## Resumo da recomendação

Adicionar uma ação "Substituir hoje" na sheet ⚙ de cada exercício do dia. Ela abre uma lista de exercícios com o mesmo músculo principal (com busca para fugir do filtro), e a escolha vale somente para o treino de hoje: o card passa a mostrar o substituto, o prefill usa a referência do substituto, e o "Finalizar treino" grava o log no id do substituto. O template do dia no Firestore não muda em nada. A substituição vive no rascunho local (`gym:drafts`), então segue as mesmas regras do rascunho: dura só o dia e nunca toca o banco antes de finalizar.

## Como funciona (fluxo do usuário)

1. Pendulum ocupado. Você abre a sheet ⚙ do "Agachamento pendulum" no dia.
2. Nova linha "Substituir hoje" mostra um dropdown/lista: exercícios do catálogo com o mesmo `primaryMuscleId` (quadríceps), excluindo os que já estão no dia. Um campo de busca permite escolher qualquer outro exercício do catálogo se a sugestão automática não servir.
3. Você escolhe "Agachamento smith". A sheet fecha. O card do dia agora mostra "Agachamento smith" com uma linha discreta "no lugar de: Agachamento pendulum". Meta de séries e reps continuam as do entry do dia (3×10); o peso pré-preenchido vem da referência do smith, não do pendulum.
4. Você treina normalmente: séries, timer, tudo igual.
5. "Finalizar treino" grava o log como `log-<data>-<dayId>-<idDoSmith>`, com snapshot de nome do smith. O histórico, o Progresso e a aba Séries enxergam o smith, que é o que aconteceu de fato.
6. Amanhã (ou no próximo ciclo) o dia volta a mostrar o pendulum, porque o template nunca mudou.

Desfazer: enquanto o treino não foi finalizado, a mesma linha da sheet vira "Voltar ao original". Se já houver séries marcadas no substituto, desfazer pede confirmação e descarta essas séries (não faz sentido transferir séries de smith para pendulum).

## Modelo de dados proposto

Nenhuma coleção nova. A substituição é estado local do rascunho:

- `gym:drafts` hoje: `{"date|dayId": {exerciseId: sets[]}}`. Proposta: acrescentar uma chave reservada `__subs` dentro do objeto do dia: `{"__subs": {originalId: substituteId}}`.
- O rascunho de séries fica chaveado pelo id ORIGINAL do entry (estável em relação ao dia); o mapa `__subs` redireciona nome, referência e o id usado na gravação do log. Isso evita colisão se o substituto também aparecer em outro entry do dia.
- Poda automática: `__subs` morre junto com o rascunho do dia (regra atual de datas anteriores), então não existe substituição "esquecida" atravessando dias.

Regras de gravação no Finalizar:

- Entry com substituição e ≥1 série marcada: log com id determinístico do SUBSTITUTO. Refinalizar sobrescreve o mesmo doc (mesma idempotência de hoje).
- O original não gera log nesse dia.
- `sessions` não muda: o dia finalizado continua sendo o mesmo dia do programa.

## Decisões que tomei e por quê

- **Sheet ⚙, não o card.** O card acabou de ser descongestionado (v7.2); um dropdown nele reintroduziria ruído e toque acidental. A sheet já é o lugar de "detalhes deste exercício hoje".
- **Similaridade = mesmo músculo principal, com busca como escape.** Alternativas consideradas: grupos de similaridade curados (nova coleção, mais manutenção, você teria que cadastrar) e sugestão por histórico (complexo, pouco ganho para 33 exercícios). Mesmo músculo principal cobre o caso real ("máquina ocupada, quero outro quadríceps") com zero cadastro novo.
- **Log no id do substituto, não do original.** O histórico deve registrar o que você fez. Progresso por exercício e contagem de séries por músculo só ficam corretos assim.
- **Meta (séries×reps) do entry original, peso do substituto.** A meta é do slot do treino; a carga é do exercício. Misturar a carga do original produziria prefill errado (pendulum 25kg vs smith sem referência).

## Pontos em aberto para você decidir amanhã

1. **Substituto já presente no dia.** Proposta: bloquear a escolha de um exercício que já é entry do dia (evita dois cards gravando no mesmo log id). Alternativa: permitir e somar séries no mesmo log, mais confuso.
2. **Trocar com séries já marcadas no original.** Proposta: permitir, mantendo as séries do original como rascunho dele (se ≥1 marcada, o original TAMBÉM vira log no Finalizar). Isso cobre o caso "fiz 2 séries, a máquina quebrou, terminei em outra". Alternativa mais simples: bloquear substituição depois da primeira série marcada.
3. **Indicação visual.** Uma linha "no lugar de: X" no card basta? Ou também um badge "sub" ao lado do nome?
4. **Cardio e dias sem treino**: fora de escopo, substituição só para exercícios de força do dia.

## Riscos conhecidos

- Estado invisível: substituição ativa é fácil de esquecer. Mitigação: a linha "no lugar de" no card e o reset diário automático.
- Se o substituto for deletado do catálogo antes do Finalizar, o card cai no fallback "(exercício removido)" e o Finalizar deve pular o entry com aviso. O brief de implementação precisa cobrir esse caso.
- Backup/import: nada muda (substituição nunca chega ao Firestore antes de virar log comum).

## Esforço estimado

Um brief único para o Codex: mudanças concentradas em `js/main.js` (sheet ⚙, card, prefill, Finalizar) e `js/logic.js` (helper puro para resolver entry -> exercício efetivo), sem tocar db.js além de nada. Sem migração, sem mudança de modelo no Firestore.
