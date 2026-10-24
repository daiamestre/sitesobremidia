# F-214 — tela de inicialização da ROM Sobre Mídia (1280x720), pedido do dono:
#   - logo Sobre Mídia em cima e, embaixo, "Sobre Mídia Player" MAIOR que a logo, ocupando 60% da largura;
#   - cores da Sobre Mídia (azul-noite → índigo, com brilho suave no centro);
#   - animação: um reflexo diagonal "/" passa PRIMEIRO na logo e DEPOIS no nome, como se estivesse carregando, e repete
#     até a launcher abrir. O reflexo só aparece dentro da logo e das letras (não vaza para o fundo).
# Saída (na pasta de -saida): tela.png e tela.bmp (a tela parada: 1ª imagem ao ligar, que não pode ser animada) e
# quadros\00000.jpg... (a animação do Android, 20 quadros por segundo).
#   powershell -File gerar-tela.ps1 -logo <logo.png do app> -saida <pasta>
param([string]$logo, [string]$saida)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -Language CSharp -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;

public static class TelaSobreMidia {
    const int W = 1280, H = 720;

    static Bitmap Fundo() {
        var b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(b)) {
            using (var f = new LinearGradientBrush(new Point(0, H), new Point(W, 0), Color.FromArgb(255, 5, 10, 31), Color.FromArgb(255, 20, 16, 90)))
                g.FillRectangle(f, 0, 0, W, H);
            using (var c = new GraphicsPath()) {
                c.AddEllipse(240, 60, 800, 560);
                using (var luz = new PathGradientBrush(c)) {
                    luz.CenterColor = Color.FromArgb(70, 79, 70, 229);
                    luz.SurroundColors = new[] { Color.FromArgb(0, 79, 70, 229) };
                    g.FillPath(luz, c);
                }
            }
        }
        return b;
    }

    // máscara (alfa 0..255) de onde o reflexo pode aparecer: a logo e as letras do nome
    static byte[] Alfa(Bitmap b) {
        var d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var px = new byte[W * H * 4]; Marshal.Copy(d.Scan0, px, 0, px.Length); b.UnlockBits(d);
        var a = new byte[W * H]; for (int i = 0; i < a.Length; i++) a[i] = px[i * 4 + 3];
        return a;
    }

    public static string Gerar(string logoPng, string saida) {
        Directory.CreateDirectory(saida);
        string pasta = Path.Combine(saida, "quadros"); Directory.CreateDirectory(pasta);
        foreach (var f in Directory.GetFiles(pasta)) File.Delete(f);
        string texto = "Sobre M" + (char)0xED + "dia Player";
        var fundo = Fundo();
        var logoImg = Image.FromFile(logoPng);
        int lh = 190, lw = logoImg.Width * lh / logoImg.Height;
        // tamanho da fonte para o nome ocupar 60% da largura
        float tam = 40f; SizeF medida;
        using (var tmp = Graphics.FromImage(fundo)) {
            tmp.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            while (true) {
                using (var fonte = new Font("Segoe UI", tam, FontStyle.Bold, GraphicsUnit.Pixel))
                    medida = tmp.MeasureString(texto, fonte, 4000, StringFormat.GenericTypographic);
                if (medida.Width >= W * 0.60f) break; tam += 1f;
            }
        }
        int y0 = (int)((H - (lh + 24 + medida.Height)) / 2);
        var rLogo = new Rectangle((W - lw) / 2, y0, lw, lh);
        float xt = (W - medida.Width) / 2, yt = y0 + lh + 24;

        // camadas: logo e nome (cada uma com a sua máscara)
        var camLogo = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(camLogo)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(logoImg, rLogo); }
        var camNome = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        // nome em índigo claro → índigo: o reflexo branco aparece bem quando passa
        using (var g = Graphics.FromImage(camNome)) {
            g.SmoothingMode = SmoothingMode.AntiAlias; g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            using (var fonte = new Font("Segoe UI", tam, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var cor = new LinearGradientBrush(new PointF(xt, 0), new PointF(xt + medida.Width, 0), Color.FromArgb(255, 199, 210, 254), Color.FromArgb(255, 129, 140, 248)))
                g.DrawString(texto, fonte, cor, xt, yt, StringFormat.GenericTypographic);
        }
        var aLogo = Alfa(camLogo); var aNome = Alfa(camNome);

        // tela parada (sem reflexo)
        var parada = new Bitmap(W, H, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(parada)) { g.DrawImage(fundo, 0, 0); g.DrawImage(camLogo, 0, 0); g.DrawImage(camNome, 0, 0); }
        parada.Save(Path.Combine(saida, "tela.png"), ImageFormat.Png);
        parada.Save(Path.Combine(saida, "tela.bmp"), ImageFormat.Bmp);

        var d0 = parada.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        int passo = d0.Stride; var base24 = new byte[passo * H]; Marshal.Copy(d0.Scan0, base24, 0, base24.Length); parada.UnlockBits(d0);

        var jpg = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
        var qualidade = new EncoderParameters(1); qualidade.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
        // 20 quadros/s: reflexo na logo (18), no nome (24), pausa (12) = 2,7 s por volta
        int qLogo = 18, qNome = 24, qPausa = 12, total = qLogo + qNome + qPausa;
        for (int q = 0; q < total; q++) {
            var px = (byte[])base24.Clone();
            if (q < qLogo) Reflexo(px, passo, aLogo, rLogo.Left, rLogo.Right, rLogo.Top, rLogo.Bottom, (q + 0.5f) / qLogo);
            else if (q < qLogo + qNome) Reflexo(px, passo, aNome, (int)xt, (int)(xt + medida.Width), (int)yt, (int)(yt + medida.Height), (q - qLogo + 0.5f) / qNome);
            var quadro = new Bitmap(W, H, PixelFormat.Format24bppRgb);
            var d = quadro.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            Marshal.Copy(px, 0, d.Scan0, px.Length); quadro.UnlockBits(d);
            quadro.Save(Path.Combine(pasta, q.ToString("00000") + ".jpg"), jpg, qualidade);
            quadro.Dispose();
        }
        return String.Format("fonte {0} px, nome {1:0} px (60% = {2:0}), logo {3}x{4}, {5} quadros", tam, medida.Width, W * 0.6f, lw, lh, total);
    }

    // faixa de luz diagonal "/" (inclinada para a direita em cima) que atravessa a área da esquerda para a direita
    static void Reflexo(byte[] px, int passo, byte[] alfa, int x0, int x1, int y0, int y1, float t) {
        float alt = y1 - y0, largura = Math.Max(34f, (x1 - x0) * 0.09f);
        float inicio = x0 - alt * 0.6f - largura * 2, fim = x1 + largura * 2;
        float cx = inicio + (fim - inicio) * t;
        for (int y = Math.Max(0, y0 - 4); y < Math.Min(H, y1 + 4); y++) {
            float meio = cx + (y1 - y) * 0.6f; // "/" : mais para a direita em cima
            for (int x = Math.Max(0, x0 - 4); x < Math.Min(W, x1 + 4); x++) {
                int a = alfa[y * W + x]; if (a == 0) continue;
                // faixa principal larga + um fio fino logo atrás (efeito de reflexo em vidro)
                float dd = (x - meio) / largura, d2 = (x - (meio - largura * 1.9f)) / (largura * 0.28f);
                float k = Math.Min(1f, (float)(Math.Exp(-dd * dd) * 0.95 + Math.Exp(-d2 * d2) * 0.6)) * a / 255f;
                if (k < 0.01f) continue;
                int i = y * passo + x * 3;
                for (int c = 0; c < 3; c++) px[i + c] = (byte)(px[i + c] + (255 - px[i + c]) * k);
            }
        }
    }
}
"@
[TelaSobreMidia]::Gerar($logo, $saida)
