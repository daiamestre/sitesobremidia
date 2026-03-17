# Configuração do Pipeline de Vídeo (GitHub Actions + Supabase)

Para que o sistema de conversão de vídeo funcione 100% de forma automatizada e invisível, precisamos conectar o Supabase (seu painel) ao GitHub (que vai agir como nosso servidor de processamento gratuito). Siga os passos abaixo:

---

## Parte 1: Adicionando Secrets no Supabase
O seu painel precisa de autorização para mandar o GitHub começar a trabalhar.

1. Acesse o **GitHub** e vá em `Settings` (Configurações do seu perfil, não do repositório) > `Developer settings` > `Personal access tokens` > `Tokens (classic)`.
2. Clique em **Generate new token (classic)**.
   - Nome: `Supabase Transcoding Trigger`
   - Expire em: `No expiration` (ou o máximo que puder)
   - Escopos (Scopes): Marque apenas a caixinha **`repo`** (Full control of private repositories).
3. Gere o token e copie o código `ghp_...`.
4. Agora vá no seu painel do **Supabase**.
5. Acesse `Project Settings` (ícone de engrenagem) > `Edge Functions`.
6. Adicione dois novos Secrets (variáveis de ambiente):
   - **Nome:** `GITHUB_TOKEN` | **Valor:** `(O token ghp_... que você acabou de copiar)`
   - **Nome:** `GITHUB_REPO` | **Valor:** `(SeuUsuarioDoGithub/sobremidiadesigner)` *(Exemplo: JairanSantos/sobremidiadesigner)*

---

## Parte 2: Adicionando Secrets no GitHub
Agora o GitHub precisa de autorização para baixar/enviar vídeos do Cloudflare R2 e para avisar o Supabase quando terminar.

1. Acesse o repositório do seu projeto no **GitHub**.
2. Vá na aba `Settings` > `Secrets and variables` > `Actions`.
3. Clique em **New repository secret** e adicione os seguintes 6 secrets um por um:

| Nome do Secret | O que colocar no Valor |
| :--- | :--- |
| `R2_ACCOUNT_ID` | O Account ID do seu Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Sua Access Key do Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Sua Secret Key do Cloudflare R2 |
| `R2_BUCKET` | O nome do seu bucket (ex: `sitecodigomidia`) |
| `SUPABASE_URL` | A URL do seu projeto Supabase (ex: `https://abcd.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | A Service Role Key do Supabase (Atenção: É a `service_role`, não a `anon key`) |

**Opcional:**
Se você estiver utilizando um domínio personalizado para o R2, adicione também:
- **Nome:** `R2_PUBLIC_DOMAIN` | **Valor:** `cdn.seusite.com.br` (Sem o https:// na frente)

---

## Parte 3: Como vai funcionar daqui pra frente?
1. Você envia um vídeo de 1GB pelo painel. Ele vai pro Cloudflare para a pasta `temp/`.
2. A tela fecha e o vídeo aparece na sua galeria com uma ampulheta e o texto **"Processando Vídeo..."**.
3. O painel envia o comando pro GitHub via Edge Function.
4. O GitHub inicia um computador virtual, instala o FFmpeg, baixa seu vídeo de 1GB da pasta temp, converte ele comprimido (provavelmente vai cair pra < 150MB sem perder quase nada de qualidade visual graças ao codec H.265 slow), e joga na pasta correta definitiva do Cloudflare R2.
5. O GitHub deleta o original pesado de 1GB lá do temporário.
6. O GitHub avisa o Supabase que terminou, e a foto/ampulheta na sua galeria pisca e vira o vídeo real pronto pra uso nas playlists.

Sucesso total! 🚀
