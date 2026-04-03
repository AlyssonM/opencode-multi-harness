<p align="center">
  <img src="./assets/banner_opencode.png" alt="OpenCode Multi-Team Harness" width="100%" />
</p>

[![](https://img.shields.io/badge/%F0%9F%87%BA%F0%9F%87%B8-English%20README-1f6feb?style=flat)](README.md)

# OpenCode Multi-Team Harness

Esta branch contém um scaffold multi-team nativo do OpenCode, focado em delegação hierárquica:

- `orchestrator`
- `team leads`
- `workers`

O objetivo é executar um fluxo multi-agent controlado no OpenCode, com fronteiras de tarefa explícitas, expertise durável e integração MCP opcional.

## Estrutura do Repositório

- [`.opencode/crew/dev/multi-team.yaml`](./.opencode/crew/dev/multi-team.yaml)  
  Topologia canônica da crew de dev (perfil de codificação agentic).
- [`.opencode/crew/marketing/multi-team.yaml`](./.opencode/crew/marketing/multi-team.yaml)  
  Topologia canônica da crew de marketing.
- [`.opencode/opencode.json`](./.opencode/opencode.json)  
  Config do OpenCode (permissões, servidores MCP).
- [`opencode.example.json`](./opencode.example.json)  
  Template de config do OpenCode para bootstrap de MCP/permissões.
- [`.opencode/agents/`](./.opencode/agents)  
  Agentes ativos de runtime (materializados por `use:crew`, ignorados no git exceto `.gitkeep`).
- [`.opencode/crew/dev/agents/`](./.opencode/crew/dev/agents)  
  Agentes canônicos da crew de dev.
- [`.opencode/skills/`](./.opencode/skills)  
  Skills reutilizáveis (`SKILL.md`) para delegação e disciplina de mental model.
- [`.opencode/tools/`](./.opencode/tools)  
  Ferramentas customizáveis chamáveis pelo modelo (atualmente `update-mental-model`).
- [`.opencode/plugins/`](./.opencode/plugins)  
  Hooks de runtime do OpenCode (incluindo exportação opcional de sessão).
- [`.opencode/crew/dev/expertise/`](./.opencode/crew/dev/expertise)  
  Arquivos canônicos de expertise da crew de dev.
- [`.opencode/scripts/validate-multi-team.mjs`](./.opencode/scripts/validate-multi-team.mjs)  
  Validador de topologia/referências para config da crew ativa (`--config`, `OPENCODE_MULTI_CREW_CONFIG`, `OPENCODE_MULTI_CONFIG` ou metadata da crew ativa).
- [specs/opencode-multi-team-plan.md](./specs/opencode-multi-team-plan.md)  
  Plano de implementação e fases de rollout.

## Topologia de Agentes

Primário:

- `orchestrator`

Leads:

- `planning-lead`
- `engineering-lead`
- `validation-lead`

Workers:

- Planning: `repo-analyst`, `solution-architect`
- Engineering: `frontend-dev`, `backend-dev`
- Validation: `qa-reviewer`, `security-reviewer`

A delegação de tarefas é restringida por regras `permission.task` no frontmatter de cada agente.

## Ferramenta Custom

Ferramenta custom atual:

- [update-mental-model.ts](./.opencode/tools/update-mental-model.ts)

Ela adiciona notas duráveis no arquivo de expertise declarado por cada agente (normalmente `.opencode/crew/<crew>/expertise/<agent>-mental-model.yaml`), com suporte a categorias e corte por limite de linhas.
Ordem de resolução de path: config da crew ativa (`.opencode/.active-crew.json`) -> prompt do agente ativo (`.opencode/agents/<agent>.md`) -> fallback legado (`.opencode/expertise/<agent>-mental-model.yaml`).

## MCP

Configurado em [`.opencode/opencode.json`](./.opencode/opencode.json):

- `context7`
- `brave-search`
- `firecrawl`

O Brave Search MCP usa o pacote oficial `@brave/brave-search-mcp-server`.

## Instalação

```bash
git clone https://github.com/AlyssonM/multi-agents.git
cd multi-agents
npm --prefix .opencode install
npm --prefix .opencode run ocmh:install
```

Setup opcional de ambiente:

```bash
cp .env.sample .env
# depois preencha os valores necessários no .env (ex.: CONTEXT7_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY)
```

Verifique se o CLI do OpenCode está disponível:

```bash
if command -v opencode >/dev/null 2>&1; then
  opencode --version
else
  echo "OpenCode CLI não encontrado. Instale primeiro: https://opencode.ai/"
fi
```

## Primeiros Passos

Sincronizar agentes gerados a partir da topologia canônica:

```bash
ocmh sync
```

Validar topologia e referências:

```bash
ocmh validate
```

Verificar drift (CI-friendly, sem escrita):

```bash
ocmh check:sync
```

Executar diagnóstico do ambiente:

```bash
ocmh doctor
```

Listar crews disponíveis do harness:

```bash
ocmh list:crews
```

Ativar uma crew (exemplo: `marketing`):

```bash
ocmh use marketing
```

Limpar seleção da crew ativa (desprovisionar agentes de runtime):

```bash
ocmh clear
```

Iniciar OpenCode:

```bash
opencode
```

Habilitar exportação opcional de sessão no estilo Pi:

```bash
OPENCODE_MULTI_SESSION_EXPORT=1 opencode
```

Path customizado opcional para exportação:

```bash
OPENCODE_MULTI_SESSION_EXPORT=1 \
OPENCODE_MULTI_SESSION_DIR=.opencode/crew/dev/sessions \
opencode
```

Workflow sugerido:

1. Troque para `@orchestrator`.
2. Solicite uma tarefa que precise de Planning -> Engineering -> Validation.
3. Confirme se o caminho de delegação respeita `permission.task`.
4. Peça para um agente persistir um insight durável via `update-mental-model`.

## Troubleshooting Rápido

Mostrar help da CLI:

```bash
ocmh --help
```

Executar o diagnóstico do runtime:

```bash
ocmh doctor
```

Validar sem materializar mudanças de runtime:

```bash
ocmh validate --config .opencode/crew/dev/multi-team.yaml
```

## Notas

- Configs source of truth vivem por crew (`.opencode/crew/<crew>/multi-team.yaml`), não na raiz de `.opencode/`.
- A raiz `.opencode/agents` ainda é necessária como ponto de montagem do runtime ativo para a crew selecionada.
- O provisionamento de agentes em `.opencode/agents` é feito por cópia (`cpSync`), não por symlink (`ln -s`).
- O plugin opcional de exportação de sessão (`.opencode/plugins/session-export.ts`) escreve:
  - padrão por crew ativa: `.opencode/crew/<crew>/sessions/<session-id>/...`
  - child: `.opencode/crew/<crew>/sessions/<root-session-id>/children/<child-session-id>/...`
  - pode ser sobrescrito com `OPENCODE_MULTI_SESSION_DIR`
- A exportação é desabilitada por padrão e só roda com `OPENCODE_MULTI_SESSION_EXPORT=1`.
- Seleção multi-crew do harness:
  - pastas de crew suportadas em `.opencode/crew/<crew>/`
  - ative via `ocmh use <crew>`
  - `sync`/`validate` podem mirar config custom via `--config`, `OPENCODE_MULTI_CREW_CONFIG` ou `OPENCODE_MULTI_CONFIG`
- Estratégia de autoria:
  - trate `.opencode/crew/<crew>/multi-team.yaml` como source-of-truth
  - ative a crew alvo com `ocmh use <crew>`
  - execute `ocmh sync` após mudanças de topologia
  - execute `ocmh check:sync` em CI/pre-commit para evitar drift
  - valide com `ocmh validate`
- mantenha `.opencode/opencode.json` alinhado com as necessidades de runtime

## Checks de Contribuição

Validar arquivos do runtime:

```bash
ocmh check:runtime
```

Executar smoke tests:

```bash
ocmh test:smoke
```

## Support & Sponsoring

<p align="center">
  <img src="./assets/buymeacoffee.png" alt="Buy Me a Coffee" width="100%" />
</p>

Se este projeto te ajuda, considere apoiar:

- Buy Me a Coffee: https://buymeacoffee.com/alyssonm
