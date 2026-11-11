"""
MOTOR DE VOZ do SOBRE MÍDIA (P-33 — locutor nos vídeos), no Modal (modal.com).

Dois modelos abertos, de uso comercial liberado, só ligam quando chega um pedido (parado não gasta):
- DESENHISTA (Qwen3-TTS VoiceDesign, Apache-2.0): INVENTA uma voz a partir de uma descrição em texto — as "vozes da casa",
  que não são de ninguém (sem locutor convidado, sem autorização de terceiros).
- LOCUTOR (Chatterbox Multilingual pt-BR, MIT): fala qualquer frase em português do Brasil COM a voz de uma amostra de
  referência (a voz da casa guardada no SOBRE MÍDIA). Todo áudio sai com a marca d'água invisível "voz gerada por IA".

Os arquivos dos modelos ficam no volume `sobremidia-voz-modelos` (baixados uma vez).

Uso (no PC, com MODAL_TOKEN_ID/MODAL_TOKEN_SECRET do cofre no ambiente):
  modal run scripts/voz/motor_modal.py::teste --saida <pasta>     → cria as vozes de teste e grava os .wav na pasta
"""
import io
import json
import os
import pathlib

import modal

app = modal.App("sobremidia-voz")
volume = modal.Volume.from_name("sobremidia-voz-modelos", create_if_missing=True)
MODELOS = "/modelos"
HF = {"HF_HOME": f"{MODELOS}/hf", "HF_HUB_ENABLE_HF_TRANSFER": "1"}
# Placa de vídeo (GPU) só com cartão cadastrado no Modal. Sem ela (VOZ_GPU=nao), roda no processador: mais lento, mesmo resultado.
USA_GPU = os.environ.get("VOZ_GPU", "sim") != "nao"
GPU_DESENHO = "L4" if USA_GPU else None
GPU_FALA = "T4" if USA_GPU else None
CPU = None if USA_GPU else 8.0

# TRAVA DE GASTO (pedido do dono): o crédito grátis do Modal é US$ 30/mês. Antes de cada uso, confere o gasto do mês e
# PARA ao chegar em VOZ_TETO_USD (padrão 27), com folga para não passar dos 30.
TETO_USD = float(os.environ.get("VOZ_TETO_USD", "27"))


def _trava_de_gasto():
    import subprocess
    import sys
    modal_cli = pathlib.Path(sys.executable).with_name("modal.exe" if os.name == "nt" else "modal")
    try:
        saida = subprocess.run([str(modal_cli), "billing", "summary", "--json"], capture_output=True, text=True, timeout=60).stdout
        gasto = float(json.loads(saida[saida.index("{"):])["metered_cost"])
    except Exception as e:  # sem conseguir conferir, não arrisca
        raise SystemExit(f"TRAVA DE GASTO: não consegui conferir o gasto do mês no Modal ({e}). Nada foi executado.")
    print(f"gasto do mês no Modal: US$ {gasto:.2f} de US$ {TETO_USD:.2f} (teto)")
    if gasto >= TETO_USD:
        raise SystemExit(f"TRAVA DE GASTO: o mês já usou US$ {gasto:.2f} (teto US$ {TETO_USD:.2f}). Nada foi executado.")

imagem_locutor = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.8.0", "torchaudio==2.8.0", extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .pip_install(
        "numpy==1.26.0", "resampy==0.4.3", "librosa==0.10.0", "s3tokenizer", "transformers==4.46.3", "diffusers==0.29.0",
        "omegaconf==2.3.0", "resemble-perth==1.0.1", "silero-vad==5.1.2", "conformer==0.3.2", "safetensors",
        "huggingface_hub[hf_transfer]", "soundfile",
    )
    # o código do Chatterbox pt-BR (o mesmo do Space oficial da Resemble AI, que carrega o T3 treinado em pt-BR)
    .run_commands("git clone --depth 1 https://huggingface.co/spaces/ResembleAI/Chatterbox-Multilingual-TTS-pt-br /opt/cbx")
    .env({**HF, "PYTHONPATH": "/opt/cbx/chatterbox/src"})
)

imagem_desenhista = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "sox")
    .pip_install("qwen-tts", "soundfile", "huggingface_hub[hf_transfer]")
    .env(HF)
)


def _wav(audio, sr) -> bytes:
    import numpy as np
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, np.asarray(audio, dtype="float32").reshape(-1), sr, format="WAV")
    return buf.getvalue()


@app.cls(image=imagem_desenhista, gpu=GPU_DESENHO, cpu=CPU, memory=16384, volumes={MODELOS: volume}, timeout=1800, scaledown_window=60)
class Desenhista:
    @modal.enter()
    def carregar(self):
        import torch
        from qwen_tts import Qwen3TTSModel
        gpu = torch.cuda.is_available()
        self.modelo = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="cuda:0" if gpu else "cpu",
            dtype=torch.bfloat16 if gpu else torch.float32, attn_implementation="sdpa",
        )
        volume.commit()

    @modal.method()
    def criar(self, descricao: str, texto: str) -> bytes:
        wavs, sr = self.modelo.generate_voice_design(text=texto, language="Portuguese", instruct=descricao)
        return _wav(wavs[0], sr)


@app.cls(image=imagem_locutor, gpu=GPU_FALA, cpu=CPU, memory=16384, volumes={MODELOS: volume}, timeout=1800, scaledown_window=60)
class Locutor:
    @modal.enter()
    def carregar(self):
        import torch
        from chatterbox.tts import ChatterboxTTS
        self.modelo = ChatterboxTTS.from_pretrained("cuda" if torch.cuda.is_available() else "cpu")
        volume.commit()

    @modal.method()
    def falar(self, texto: str, referencia_wav: bytes, exagero: float = 0.6, cfg: float = 0.4, temperatura: float = 0.8) -> bytes:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(referencia_wav)
            ref = f.name
        wav = self.modelo.generate(texto, audio_prompt_path=ref, exaggeration=exagero, cfg_weight=cfg, temperature=temperatura, language_id="pt")
        return _wav(wav.squeeze(0).cpu().numpy(), self.modelo.sr)


# ---------------------------------------------------------------------------------------------------------------------
# TESTE: as primeiras vozes da casa (o dono ouve e escolhe)
# ---------------------------------------------------------------------------------------------------------------------
FRASE_DA_AMOSTRA = (
    "Venha conhecer as ofertas do Supermercado Bom Preço! Arroz Camil, um quilo, por apenas quatro e setenta e cinco! "
    "Aproveite, é só nesta semana!"
)
FRASE_DO_LOCUTOR = (
    "Atenção, cliente! Filé de salmão, por apenas dezenove e noventa o quilo! Café Pilão, quinhentos gramas, por apenas "
    "dezesseis e noventa! Corre que é por tempo limitado!"
)
VOZES_DA_CASA = [
    ("locutor-animado", "Energetic Brazilian male supermarket radio announcer, about 35 years old, deep and powerful voice, fast and excited delivery, big smile in the voice, Brazilian Portuguese accent."),
    ("locutor-grave", "Brazilian male radio presenter, about 45 years old, very deep warm bass voice, confident and persuasive, clear diction, Brazilian Portuguese accent."),
    ("locutora-alegre", "Cheerful young Brazilian female announcer, about 28 years old, bright friendly voice, upbeat and enthusiastic, Brazilian Portuguese accent."),
    ("locutora-calma", "Calm and trustworthy Brazilian female voice, about 40 years old, soft warm tone, reassuring like a pharmacy commercial, Brazilian Portuguese accent."),
    ("locutor-jovem", "Young Brazilian male voice, about 22 years old, casual and fun social media style, energetic, Brazilian Portuguese accent."),
    ("locutor-suspense", "Dramatic Brazilian male announcer, about 40 years old, deep voice, building suspense and excitement like a big sale countdown, Brazilian Portuguese accent."),
]


@app.local_entrypoint()
def teste(saida: str = "vozes-teste", so: str = ""):
    _trava_de_gasto()
    pasta = pathlib.Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    escolhidas = [v for v in VOZES_DA_CASA if not so or v[0] in so.split(",")]
    desenhista, locutor = Desenhista(), Locutor()
    relatorio = []
    for nome, descricao in escolhidas:
        amostra = desenhista.criar.remote(descricao, FRASE_DA_AMOSTRA)
        (pasta / f"{nome}-A-desenhada.wav").write_bytes(amostra)
        falada = locutor.falar.remote(FRASE_DO_LOCUTOR, amostra)
        (pasta / f"{nome}-B-locutor-ptbr.wav").write_bytes(falada)
        relatorio.append({"voz": nome, "descricao": descricao})
        print("pronta:", nome)
    (pasta / "vozes.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------------------------------------------------
# LOCUTOR CONVIDADO (voz de uma pessoa real, SÓ com autorização por escrito dela): limpa a amostra (tira música e ruído,
# fica só a voz) e gera a PRÉVIA para o dono aprovar antes de entrar no sistema.
# ---------------------------------------------------------------------------------------------------------------------
imagem_limpeza = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch==2.5.1", "torchaudio==2.5.1", extra_index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("demucs==4.0.1", "soundfile", "numpy<2")
    .env({"TORCH_HOME": f"{MODELOS}/torch"})
)


@app.function(image=imagem_limpeza, cpu=8.0, memory=8192, volumes={MODELOS: volume}, timeout=1200)
def limpar(audio: bytes, extensao: str = "mp3") -> dict:
    """Separa a VOZ do resto (música, ruído) e devolve a voz em WAV 24 kHz mono, com a medida de quanto fundo havia."""
    import subprocess
    import tempfile
    import numpy as np
    import soundfile as sf
    d = pathlib.Path(tempfile.mkdtemp())
    (d / f"entrada.{extensao}").write_bytes(audio)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / f"entrada.{extensao}"), "-ac", "2", "-ar", "44100", str(d / "entrada.wav")], check=True)
    subprocess.run(["python", "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs", "-o", str(d / "sep"), str(d / "entrada.wav")], check=True)
    voz, sr = sf.read(str(d / "sep" / "htdemucs" / "entrada" / "vocals.wav"))
    fundo, _ = sf.read(str(d / "sep" / "htdemucs" / "entrada" / "no_vocals.wav"))
    volume.commit()
    rms = lambda x: float(np.sqrt(np.mean(np.square(x))) + 1e-9)
    sf.write(str(d / "voz.wav"), voz.mean(axis=1) if voz.ndim > 1 else voz, sr)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "voz.wav"), "-ac", "1", "-ar", "24000", "-af", "loudnorm", str(d / "voz24.wav")], check=True)
    return {"voz_wav": (d / "voz24.wav").read_bytes(), "segundos": round(len(voz) / sr, 1), "fundo_sobre_voz": round(rms(fundo) / rms(voz), 3)}


@app.local_entrypoint()
def convidado(arquivos: str, nome: str = "convidado", saida: str = "vozes-convidado"):
    """Prévia de um locutor convidado: limpa cada amostra e faz a voz dele falar uma oferta."""
    _trava_de_gasto()
    pasta = pathlib.Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    locutor = Locutor()
    relatorio = []
    for i, caminho in enumerate([a for a in arquivos.split("|") if a.strip()], start=1):
        p = pathlib.Path(caminho.strip())
        r = limpar.remote(p.read_bytes(), p.suffix.lstrip(".") or "mp3")
        (pasta / f"{nome}-{i}-amostra-limpa.wav").write_bytes(r["voz_wav"])
        falada = locutor.falar.remote(FRASE_DO_LOCUTOR, r["voz_wav"])
        (pasta / f"{nome}-{i}-falando-oferta.wav").write_bytes(falada)
        relatorio.append({"amostra": p.name, "segundos": r["segundos"], "fundo_sobre_voz": r["fundo_sobre_voz"]})
        print("pronta:", i, relatorio[-1])
    (pasta / "relatorio.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding="utf-8")


@app.local_entrypoint()
def so_limpar(arquivos: str, nome: str = "voz", saida: str = "vozes-limpas"):
    """Só tira a música/ruído de fundo de cada áudio e grava a voz limpa (material para o treino da voz)."""
    _trava_de_gasto()
    pasta = pathlib.Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    for i, caminho in enumerate([a for a in arquivos.split("|") if a.strip()], start=1):
        p = pathlib.Path(caminho.strip())
        r = limpar.remote(p.read_bytes(), p.suffix.lstrip(".") or "mp3")
        (pasta / f"{nome}-{i}-limpa.wav").write_bytes(r["voz_wav"])
        print("limpa:", i, p.name, r["segundos"], "s", "fundo/voz", r["fundo_sobre_voz"])


# ---------------------------------------------------------------------------------------------------------------------
# MATERIAL DE TREINO: de cada áudio (com vinheta cantada e música), fica SÓ a fala do locutor. Tira a música (Demucs),
# corta em frases (Silero VAD) e compara cada frase com a voz de referência do locutor (ECAPA, SpeechBrain): canto da
# vinheta, coro e outras vozes saem.
# ---------------------------------------------------------------------------------------------------------------------
imagem_treino = imagem_limpeza.pip_install("speechbrain==1.0.3", "silero-vad==5.1.2", "huggingface_hub<0.26", "requests")


@app.function(image=imagem_treino, cpu=8.0, memory=16384, volumes={MODELOS: volume}, timeout=3600)
def separar_falas(audio: bytes, extensao: str, referencias: list, nome: str, limiar: float = 0.35) -> dict:
    import subprocess
    import tempfile
    import numpy as np
    import soundfile as sf
    import torch
    from silero_vad import get_speech_timestamps, load_silero_vad
    from speechbrain.inference.speaker import EncoderClassifier

    d = pathlib.Path(tempfile.mkdtemp())
    (d / f"e.{extensao}").write_bytes(audio)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / f"e.{extensao}"), "-ac", "2", "-ar", "44100", str(d / "e.wav")], check=True)
    subprocess.run(["python", "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs", "-o", str(d / "sep"), str(d / "e.wav")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "sep/htdemucs/e/vocals.wav"), "-ac", "1", "-ar", "16000", str(d / "v16.wav")], check=True)
    voz, sr = sf.read(str(d / "v16.wav"), dtype="float32")

    vad = load_silero_vad()
    marcas = get_speech_timestamps(torch.from_numpy(voz), vad, sampling_rate=sr, min_silence_duration_ms=350, speech_pad_ms=120)
    # junta pedaços próximos em frases de 2 a 12 s
    frases, atual = [], None
    for m in marcas:
        if atual and m["start"] - atual["end"] < 0.25 * sr and (m["end"] - atual["start"]) < 12 * sr:
            atual["end"] = m["end"]
        else:
            if atual: frases.append(atual)
            atual = {"start": m["start"], "end": m["end"]}
    if atual: frases.append(atual)
    # trechos longos (fala colada na vinheta, sem pausa): corta em pedaços de até 8 s para comparar a voz pedaço a pedaço
    picadas = []
    for f in frases:
        n = max(1, int(np.ceil((f["end"] - f["start"]) / (8 * sr))))
        passo = (f["end"] - f["start"]) / n
        picadas += [{"start": int(f["start"] + k * passo), "end": int(f["start"] + (k + 1) * passo)} for k in range(n)]
    frases = picadas

    enc = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir=f"{MODELOS}/ecapa", run_opts={"device": "cpu"})
    emb = lambda x: torch.nn.functional.normalize(enc.encode_batch(torch.from_numpy(x).unsqueeze(0)).squeeze(), dim=0)
    refs = []
    for i, r in enumerate(referencias):
        (d / f"r{i}.wav").write_bytes(r)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / f"r{i}.wav"), "-ac", "1", "-ar", "16000", str(d / f"r{i}16.wav")], check=True)
        x, _ = sf.read(str(d / f"r{i}16.wav"), dtype="float32")
        for k in range(0, max(1, len(x) - 3 * sr), 4 * sr):
            refs.append(emb(x[k:k + 6 * sr]))
    centro = torch.nn.functional.normalize(torch.stack(refs).mean(0), dim=0)

    # o MESMO corte na voz em 44,1 kHz (qualidade cheia para o treino)
    alta, sra = sf.read(str(d / "sep/htdemucs/e/vocals.wav"), dtype="float32")
    alta = alta.mean(axis=1) if alta.ndim > 1 else alta
    saida = pathlib.Path(MODELOS) / "treino" / nome
    saida.mkdir(parents=True, exist_ok=True)
    ficou, lista = [], []
    for j, f in enumerate(frases):
        dur = (f["end"] - f["start"]) / sr
        if dur < 1.2:
            lista.append({"i": j, "ini": round(f["start"] / sr, 2), "seg": round(dur, 2), "sim": None, "fica": False, "motivo": "curta"})
            continue
        sim = float(torch.dot(emb(voz[f["start"]:f["end"]]), centro))
        fica = sim >= limiar
        lista.append({"i": j, "ini": round(f["start"] / sr, 2), "seg": round(dur, 2), "sim": round(sim, 3), "fica": fica})
        if fica:
            pedaco = alta[int(f["start"] / sr * sra):int(f["end"] / sr * sra)]
            sf.write(str(saida / f"{j:03d}.wav"), pedaco, sra)
            ficou.append(pedaco)
            ficou.append(np.zeros(int(0.4 * sra), dtype="float32"))
    volume.commit()
    junto = np.concatenate(ficou) if ficou else np.zeros(sra, dtype="float32")
    sf.write(str(d / "junto.wav"), junto, sra)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / "junto.wav"), "-ac", "1", "-b:a", "160k", str(d / "junto.mp3")], check=True)
    return {"so_voz_mp3": (d / "junto.mp3").read_bytes(), "frases": lista, "segundos_fala": round(sum(x["seg"] for x in lista if x["fica"]), 1), "segundos_total": round(len(voz) / sr, 1)}


@app.local_entrypoint()
def material_de_treino(arquivos: str, referencias: str, locutor: str = "dono", saida: str = "treino", prefixo: str = ""):
    _trava_de_gasto()
    pasta = pathlib.Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    refs = [pathlib.Path(r.strip()).read_bytes() for r in referencias.split("|") if r.strip()]
    entradas = [pathlib.Path(a.strip()) for a in arquivos.split("|") if a.strip()]
    chamadas = [separar_falas.spawn(p.read_bytes(), p.suffix.lstrip(".") or "mp3", refs, f"{locutor}/{prefixo}{i:02d}") for i, p in enumerate(entradas, start=1)]
    resumo = []
    for i, (p, c) in enumerate(zip(entradas, chamadas), start=1):
        r = c.get()
        (pasta / f"{locutor}-{prefixo}{i:02d}-so-a-voz.mp3").write_bytes(r["so_voz_mp3"])
        (pasta / f"{locutor}-{prefixo}{i:02d}-frases.json").write_text(json.dumps(r["frases"], ensure_ascii=False, indent=1), encoding="utf-8")
        resumo.append({"arquivo": p.name[:70], "total_s": r["segundos_total"], "fala_do_locutor_s": r["segundos_fala"], "frases_ficaram": sum(1 for x in r["frases"] if x["fica"]), "frases_sairam": sum(1 for x in r["frases"] if not x["fica"])})
        print("pronto:", resumo[-1])
    print("TOTAL de fala do locutor:", round(sum(x["fala_do_locutor_s"] for x in resumo), 1), "s")


# ---------------------------------------------------------------------------------------------------------------------
# TREINO DA VOZ DO LOCUTOR (Qwen3-TTS 1.7B Base, ajuste fino OFICIAL de um locutor só — QwenLM/Qwen3-TTS/finetuning,
# Apache-2.0). Entrada: as frases limpas em /modelos/treino/<locutor>/**.wav (separar_falas). Saída: o modelo da voz em
# /modelos/vozes/<locutor>/checkpoint-epoch-N, que fala qualquer texto com a voz do locutor (generate_custom_voice).
# ---------------------------------------------------------------------------------------------------------------------
imagem_treino_voz = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "ffmpeg", "libsndfile1", "sox")
    .pip_install("qwen-tts", "accelerate", "tensorboard", "librosa", "soundfile", "num2words", "huggingface_hub[hf_transfer]")
    .run_commands(
        "git clone --depth 1 https://github.com/QwenLM/Qwen3-TTS /opt/qwen3tts",
        # sem FlashAttention (opcional no projeto): atenção padrão do PyTorch
        "sed -i s/flash_attention_2/sdpa/g /opt/qwen3tts/finetuning/sft_12hz.py",
    )
    .env(HF)
)


def _por_extenso(texto: str) -> str:
    """Números como o locutor FALA: '4,99' vira 'quatro e noventa e nove'; '5kg' vira 'cinco quilos'."""
    import re
    from num2words import num2words
    w = lambda n: num2words(int(n), lang="pt_BR")
    t = texto.replace("R$", " ").replace("%", " por cento")
    t = re.sub(r"(\d+)[,.](\d{2})\b", lambda m: f"{w(m.group(1))} e {w(m.group(2))}" if int(m.group(2)) else w(m.group(1)), t)
    t = re.sub(r"(\d+)\s?kg\b", lambda m: f"{w(m.group(1))} {'quilo' if m.group(1) == '1' else 'quilos'}", t, flags=re.I)
    unidades = {"ml": "mililitros", "g": "gramas", "l": "litros"}
    t = re.sub(r"(\d+)\s?(ml|g|l)\b", lambda m: f"{w(m.group(1))} {unidades[m.group(2).lower()]}", t, flags=re.I)
    t = re.sub(r"\d+", lambda m: w(m.group(0)), t)
    return re.sub(r"\s+", " ", t).strip()


@app.function(image=imagem_treino_voz, gpu="A100-80GB", volumes={MODELOS: volume}, timeout=7200)
def treinar_voz(locutor: str, epocas: int = 6, lr: float = 1e-5, lote: int = 2) -> dict:
    import glob
    import subprocess
    import librosa
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from transformers import pipeline

    base = pathlib.Path(MODELOS)
    dados = pathlib.Path("/tmp/dados")
    dados.mkdir(parents=True, exist_ok=True)
    arquivos = sorted(glob.glob(str(base / "treino" / locutor / "**" / "*.wav"), recursive=True))

    # 1) 24 kHz mono, frases de 1,5 a 15 s
    frases = []
    for i, a in enumerate(arquivos):
        x, _ = librosa.load(a, sr=24000, mono=True)
        seg = len(x) / 24000
        if 1.5 <= seg <= 15:
            p = dados / f"{i:04d}.wav"
            sf.write(str(p), x, 24000)
            frases.append({"audio": str(p), "seg": round(seg, 2), "origem": a.replace(str(base), "")})

    # 2) transcrição (Whisper large-v3-turbo, português), números por extenso como o locutor fala
    asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", torch_dtype=torch.float16, device="cuda:0")
    for f in frases:
        x, _ = librosa.load(f["audio"], sr=16000, mono=True)
        r = asr({"raw": x, "sampling_rate": 16000}, generate_kwargs={"language": "portuguese", "task": "transcribe"})
        f["whisper"] = r["text"].strip()
        f["text"] = _por_extenso(f["whisper"])
    frases = [f for f in frases if len(f["text"]) >= 6]
    del asr
    torch.cuda.empty_cache()

    # 3) a referência: a frase do meio (em duração) entre 5 e 10 s, a MESMA para todas (como pede o projeto)
    boas = sorted([f for f in frases if 5 <= f["seg"] <= 10], key=lambda f: f["seg"]) or frases
    ref = boas[len(boas) // 2]["audio"]
    raw = dados / "train_raw.jsonl"
    linhas = [json.dumps({"audio": f["audio"], "text": f["text"], "ref_audio": ref, "language": "Portuguese"}, ensure_ascii=False) for f in frases]
    raw.write_text("\n".join(linhas) + "\n", encoding="utf-8")

    ft = "/opt/qwen3tts/finetuning"
    # o script oficial pede pasta de registro do tensorboard (não usamos): tira o registro
    sft = pathlib.Path(ft) / "sft_12hz.py"
    sft.write_text(sft.read_text().replace(', log_with="tensorboard"', "").replace("flash_attention_2", "sdpa"))
    subprocess.run(["python", "prepare_data.py", "--device", "cuda:0", "--tokenizer_model_path", "Qwen/Qwen3-TTS-Tokenizer-12Hz",
                    "--input_jsonl", str(raw), "--output_jsonl", str(dados / "train.jsonl")], cwd=ft, check=True)
    modelo_base = snapshot_download("Qwen/Qwen3-TTS-12Hz-1.7B-Base")
    saida = base / "vozes" / locutor
    if saida.exists():
        subprocess.run(["rm", "-rf", str(saida)], check=True)
    saida.mkdir(parents=True, exist_ok=True)
    log = subprocess.run(["python", "sft_12hz.py", "--init_model_path", modelo_base, "--output_model_path", str(saida),
                          "--train_jsonl", str(dados / "train.jsonl"), "--batch_size", str(lote), "--lr", str(lr),
                          "--num_epochs", str(epocas), "--speaker_name", locutor], cwd=ft, capture_output=True, text=True)
    (saida / "treino.log").write_text(log.stdout[-20000:] + "\n" + log.stderr[-20000:], encoding="utf-8")
    (saida / "frases.json").write_text(json.dumps(frases, ensure_ascii=False, indent=1), encoding="utf-8")
    volume.commit()
    if log.returncode != 0:
        raise RuntimeError("treino falhou: " + log.stderr[-3000:])
    perdas = [l for l in log.stdout.splitlines() if "Loss" in l]
    return {"frases": len(frases), "segundos": round(sum(f["seg"] for f in frases), 1), "referencia": ref, "perdas": perdas[-12:],
            "checkpoints": sorted(p.name for p in saida.glob("checkpoint-epoch-*")), "exemplos": [(f["whisper"], f["text"]) for f in frases[:8]]}


@app.function(image=imagem_treino_voz, gpu="L4", volumes={MODELOS: volume}, timeout=1800)
def falar_treinada(locutor: str, checkpoint: str, frases: list) -> list:
    import torch
    from qwen_tts import Qwen3TTSModel
    m = Qwen3TTSModel.from_pretrained(f"{MODELOS}/vozes/{locutor}/{checkpoint}", device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    saida = []
    for t in frases:
        wavs, sr = m.generate_custom_voice(text=t, speaker=locutor, language="Portuguese")
        saida.append(_wav(wavs[0], sr))
    return saida


FRASES_DA_PREVIA = [
    "Atenção, cliente! Filé de salmão, por apenas dezenove e noventa o quilo!",
    "Café Pilão, quinhentos gramas, por apenas dezesseis e noventa! Corre que é por tempo limitado!",
    "Venha conhecer as ofertas do Supermercado Bom Preço! Estamos te esperando!",
]


@app.local_entrypoint()
def treinar(locutor: str = "dono", epocas: int = 6, lr: float = 1e-5, saida: str = "previa-treinada"):
    _trava_de_gasto()
    r = treinar_voz.remote(locutor, epocas, lr)
    print(json.dumps({k: v for k, v in r.items() if k != "exemplos"}, ensure_ascii=False, indent=1))
    for w, t in r["exemplos"]:
        print("  whisper:", w)
        print("  texto  :", t)
    pasta = pathlib.Path(saida)
    pasta.mkdir(parents=True, exist_ok=True)
    alvo = {epocas // 3, (2 * epocas) // 3, epocas - 1}
    escolhidos = [c for c in r["checkpoints"] if int(c.rsplit("-", 1)[1]) in alvo]
    for c in escolhidos:
        for i, w in enumerate(falar_treinada.remote(locutor, c, FRASES_DA_PREVIA), start=1):
            (pasta / f"{locutor}-{c}-frase{i}.wav").write_bytes(w)
        print("prévia pronta:", c)


@app.function(image=imagem_treino_voz, gpu="L4", volumes={MODELOS: volume}, timeout=900)
def transcrever(audios: list) -> list:
    """Conferência automática: o que um ouvinte entende de cada áudio gerado (prévia ruim/cortada aparece aqui)."""
    import io as _io
    import librosa
    import soundfile as sf
    import torch
    from transformers import pipeline
    asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", torch_dtype=torch.float16, device="cuda:0")
    saida = []
    for a in audios:
        x, sr = sf.read(_io.BytesIO(a), dtype="float32")
        x = librosa.resample(x, orig_sr=sr, target_sr=16000) if sr != 16000 else x
        saida.append({"segundos": round(len(x) / 16000, 1), "texto": asr({"raw": x, "sampling_rate": 16000}, generate_kwargs={"language": "portuguese", "task": "transcribe"})["text"].strip()})
    return saida


@app.local_entrypoint()
def conferir(pasta: str):
    _trava_de_gasto()
    arquivos = sorted(pathlib.Path(pasta).glob("*.wav"))
    for p, r in zip(arquivos, transcrever.remote([p.read_bytes() for p in arquivos])):
        print(f"{p.name} | {r['segundos']} s | {r['texto']}")


@app.function(image=imagem_treino, cpu=4.0, memory=8192, volumes={MODELOS: volume}, timeout=900)
def semelhanca(candidatos: dict, referencias: list) -> dict:
    """Nota objetiva (0 a 1) de quanto cada áudio se parece com a voz de referência (ECAPA, a mesma do filtro de treino)."""
    import subprocess
    import tempfile
    import soundfile as sf
    import torch
    from speechbrain.inference.speaker import EncoderClassifier
    d = pathlib.Path(tempfile.mkdtemp())
    enc = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir=f"{MODELOS}/ecapa", run_opts={"device": "cpu"})

    def carregar(b, n):
        (d / f"{n}.bin").write_bytes(b)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(d / f"{n}.bin"), "-ac", "1", "-ar", "16000", str(d / f"{n}.wav")], check=True)
        return sf.read(str(d / f"{n}.wav"), dtype="float32")[0]

    emb = lambda x: torch.nn.functional.normalize(enc.encode_batch(torch.from_numpy(x).unsqueeze(0)).squeeze(), dim=0)
    refs = []
    for i, r in enumerate(referencias):
        x = carregar(r, f"r{i}")
        for k in range(0, max(1, len(x) - 3 * 16000), 4 * 16000):
            refs.append(emb(x[k:k + 6 * 16000]))
    centro = torch.nn.functional.normalize(torch.stack(refs).mean(0), dim=0)
    return {nome: round(float(torch.dot(emb(carregar(b, f"c{i}")), centro)), 3) for i, (nome, b) in enumerate(candidatos.items())}


@app.local_entrypoint()
def comparar(candidatos: str, referencias: str):
    _trava_de_gasto()
    c = {pathlib.Path(a.strip()).name: pathlib.Path(a.strip()).read_bytes() for a in candidatos.split("|") if a.strip()}
    r = [pathlib.Path(a.strip()).read_bytes() for a in referencias.split("|") if a.strip()]
    for nome, nota in sorted(semelhanca.remote(c, r).items(), key=lambda x: -x[1]):
        print(f"{nota:.3f}  {nome}")
