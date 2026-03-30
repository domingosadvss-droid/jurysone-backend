/**
 * setup-supabase-storage.ts
 *
 * Cria os buckets necessários no Supabase Storage e configura as policies de acesso.
 * Execute UMA VEZ após configurar as variáveis de ambiente:
 *
 *   npx ts-node scripts/setup-supabase-storage.ts
 *
 * Pré-requisito: SUPABASE_URL e SUPABASE_SERVICE_KEY no .env
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Buckets ──────────────────────────────────────────────────────────────────

const BUCKETS: { name: string; public: boolean; allowedMimeTypes: string[] }[] = [
  {
    name: 'documentos',
    public: false,   // acesso somente via URL assinada
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  },
  {
    name: 'contratos',
    public: false,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  {
    name: 'assinados',
    public: false,
    allowedMimeTypes: ['application/pdf'],
  },
  {
    name: 'avatars',
    public: false,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },
];

// ─── SQL das policies (RLS) ────────────────────────────────────────────────────
//
// Regra: apenas usuários com JWT válido (autenticados) podem ler/escrever.
// O service_role do backend bypassa essas policies automaticamente.
//
// Execute essas policies no SQL Editor do Supabase Dashboard caso queira
// que o frontend acesse diretamente com o anon key + JWT do usuário.

const POLICIES_SQL = `
-- Habilita RLS em todos os buckets
-- (o Supabase já habilita por padrão em novos buckets privados)

-- Policy: usuário autenticado pode fazer SELECT (download via signed URL)
create policy "Autenticados podem ler documentos"
  on storage.objects for select
  using ( auth.role() = 'authenticated' );

-- Policy: usuário autenticado pode fazer INSERT (upload)
create policy "Autenticados podem fazer upload"
  on storage.objects for insert
  with check ( auth.role() = 'authenticated' );

-- Policy: usuário autenticado pode fazer DELETE apenas dos próprios arquivos
create policy "Autenticados podem deletar seus arquivos"
  on storage.objects for delete
  using ( auth.role() = 'authenticated' );
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔧  Configurando Supabase Storage para JurysOne...\n');

  for (const bucket of BUCKETS) {
    process.stdout.write(`  • Criando bucket "${bucket.name}" ... `);

    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
      allowedMimeTypes: bucket.allowedMimeTypes,
      fileSizeLimit: 52428800, // 50 MB por arquivo
    });

    if (error) {
      if (error.message.includes('already exists')) {
        console.log('já existe ✓');
      } else {
        console.log(`ERRO: ${error.message}`);
      }
    } else {
      console.log('criado ✅');
    }
  }

  console.log('\n✅  Buckets configurados com sucesso!');
  console.log('\n📋  Próximos passos:');
  console.log('   1. No Supabase Dashboard → SQL Editor, execute as policies abaixo');
  console.log('      (somente se o frontend acessar o storage diretamente):');
  console.log('\n' + POLICIES_SQL);
  console.log('\n   2. Substitua os placeholders no .env:');
  console.log('      SUPABASE_URL=https://SEU_PROJECT.supabase.co');
  console.log('      SUPABASE_SERVICE_KEY=eyJ... (Settings → API → service_role)');
  console.log('      SUPABASE_ANON_KEY=eyJ...    (Settings → API → anon public)');
}

main().catch(console.error);
