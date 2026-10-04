# Alexandre Alvarás — Monitor de Licenças & Alvarás

Sistema para o escritório cadastrar empresas e acompanhar alvarás, licenças e registros (Alvará, Vigilância Sanitária, Bombeiros, Ambiental, Acessibilidade, CNES, OAB, CRMV…): validade, situação, consultas, alterações, documentos e vencimentos.

- Arquitetura, modelo de dados e fluxo das páginas: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
- Simulação de Licenciamento (motor de regras, base legal versionada, importação revisada CSV/XLSX): [docs/SIMULACAO.md](docs/SIMULACAO.md)
- Layout aprovado (referência oficial): [docs/referencia/layout-aprovado.png](docs/referencia/layout-aprovado.png)

## Rodar localmente

Requisitos: Node 22+ (testado com Node 24).

```bash
npm install
npm run dev          # http://localhost:5173
```

Sem configuração, o sistema abre em **modo demonstração**: dados fictícios (CNPJs com dígito verificador inválido de propósito), salvos só no navegador. O menu do usuário permite trocar o perfil (Administrador, Contador, Colaborador, Consulta) para testar as permissões. *Configurações → Dados de demonstração* restaura os dados iniciais.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção (PWA) |
| `npm test` | testes das regras de negócio, serviços e telas (Vitest + Testing Library) |
| `npm run lint` | análise estática (oxlint) |
| `npm run db:validate` | aplica as migrations num PostgreSQL em memória (PGlite) e testa RLS, imutabilidade do histórico, concorrência, auditoria e busca |
| `npm run check` | typecheck + lint + testes + validação do banco |
| `npm run db:seed:generate` | regenera `supabase/seed.sql` a partir de `src/data/catalog-seed.ts` |
| `npm run build:edge` | empacota a rotina de monitoramento para a Edge Function |
| `npm run assets:extract` | recria as imagens provisórias a partir da referência (requer Python + Pillow) |

## Conectar ao Supabase

1. Crie o projeto no Supabase e aplique o banco:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push            # aplica supabase/migrations
   ```
   Em seguida rode o conteúdo de `supabase/seed.sql` no SQL Editor (catálogo inicial: setores, licenças, CNAEs, fontes, configurações). Não há dados de clientes no seed.
2. Crie os usuários em *Authentication → Users*. Todo usuário novo entra com o perfil **Consulta** (somente leitura). Defina o primeiro administrador no SQL Editor:
   ```sql
   update public.profiles set role = 'administrador' where email = 'seu.email@escritorio.com.br';
   ```
   Depois disso, os perfis são alterados pela tela *Configurações → Usuários e perfis*.
3. Copie `.env.example` para `.env` e preencha **apenas** a URL e a *anon key*:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
   Nunca coloque a `service_role` key no frontend. A segurança é garantida pelas políticas RLS.

## Rotina automática (opcional)

A rotina reavalia vencimentos, gera alertas sem duplicar os abertos e registra notificações. Sem integrações oficiais, ela **não consulta nenhum órgão**.

```bash
npm run build:edge
npx supabase functions deploy monitor-licenses --no-verify-jwt
npx supabase secrets set CRON_SECRET=<segredo-longo>
# opcional (e-mail): RESEND_API_KEY, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO
```

Agendamento diário às 6h (Brasília), no SQL Editor, com as extensões `pg_cron` e `pg_net` habilitadas:

```sql
select cron.schedule('monitor-licencas', '0 9 * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/monitor-licenses',
    headers := jsonb_build_object('Authorization', 'Bearer <segredo-longo>')
  );
$$);
```

## Novas licenças

Em *Configurações → Tipos de licença* o administrador cadastra novas licenças (nome, órgão, esfera, fonte, se tem validade). Depois, inclua a licença no perfil dos setores (*Licenças por setor*) ou direto na empresa (aba *Editar*). Para refletir no banco de um ambiente novo, acrescente-a também em `src/data/catalog-seed.ts` e rode `npm run db:seed:generate`.

## Simulação de Licenciamento

Menu **Simulação**: informe CNAE(s), município e data de referência e o sistema responde, **somente com base nas regras cadastradas**, a classificação de risco, as licenças dispensadas/exigíveis/em análise, o CNAE que definiu o resultado e a fundamentação legal (norma, versão e vigência).

O sistema **não traz conteúdo legal inventado**. Em *Configurações → Legislação* o administrador mantém a base legal por município (normas, anexos, versões por vigência e decretos modificadores) e importa o conteúdo dos anexos por CSV/XLSX — com prévia, revisão obrigatória e confirmação antes de publicar. Sem regra cadastrada, o resultado é "Regra não cadastrada"; condição sem resposta gera "Enquadramento condicionado". A biblioteca [`legislacao/`](legislacao/README.md) guarda os PDFs oficiais do Diário Oficial de Teresina (LC nº 5.788/2022, LC nº 6.048/2023, Decreto nº 24.861/2023 e Decretos nº 25.363/2023 e nº 28.436/2025) e os dados extraídos deles (1.332 CNAEs, 85 CBOs, 78 alterações), que entram no simulador somente após a aprovação do administrador; cada regra guarda documento e página (**VER FONTE**). No modo demonstração há uma norma **fictícia** na localidade "Cidade Exemplo", identificada como "EXEMPLO FICTÍCIO", apenas para testar as telas. Detalhes em [docs/SIMULACAO.md](docs/SIMULACAO.md).

## Integrações com órgãos

Todas as fontes (SLIC, GOV.PI Empresas, CBMEPI, DIVISA, SEMARH, CNES, OAB, CRMV) estão como **INTEGRAÇÃO PENDENTE**. Nenhuma API foi presumida. Para integrar uma fonte com acesso oficial:

1. implemente o adapter seguindo `src/integrations/licensing/types.ts` (`consultLicense`, `getStatus`, `getExpirationDate`, `getDocument`, `getProtocol`);
2. execute-o no servidor (Edge Function) e registre-o em `IMPLEMENTED_ADAPTERS` (`src/integrations/licensing/providers.ts`);
3. ative a fonte em *Configurações → Integrações*.

O resultado entra no histórico como consulta AUTOMÁTICA, com a mesma comparação e os mesmos alertas das consultas manuais.

## Marca

A tela reproduz a logo "JR SISTEMA" e o mascote da referência. As imagens em `public/` são **provisórias** (recortes da referência). Para usar os arquivos oficiais, substitua-os ou ajuste `src/config/brand.ts`.
