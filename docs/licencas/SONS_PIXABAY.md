# Efeitos sonoros dos vídeos de impacto (F-320): gratuitos, do Pixabay, mais os nossos

Baixados em 16/11/2026 com autorização do dono. A licença é a **Pixabay Content License**:
- uso comercial em vídeos, sem pagar e sem obrigação de dar crédito;
- é proibido revender ou distribuir o som sozinho.

No SOBRE MÍDIA ele só entra misturado no vídeo do cliente.

## Gravações usadas nas batidas (`public/studio/sons/impacto.mp3` e `concreto.mp3`)
| Gravação (página no Pixabay) | Em qual som |
|---|---|
| https://pixabay.com/sound-effects/horror-explosion-with-debris-494320/ | impacto (logo) e concreto |
| https://pixabay.com/sound-effects/film-special-effects-large-break-363165/ | impacto (logo) e concreto |
| https://pixabay.com/sound-effects/film-special-effects-hitting-wall-85571/ | impacto (logo) |
| https://pixabay.com/sound-effects/film-special-effects-cinematic-boom-04-414570/ | concreto |

O grave por baixo das duas batidas é **nosso**, sintetizado em `scripts/studio/sintetizar-sons.mjs`, e a montagem fica em `scripts/studio/montar-sons-de-batida.mjs`.

## Sons 100% nossos (sintetizados, sem gravação de terceiros)
- **sirene.mp3:** um único "uóóó-uuu", de 600 a 2.230 e de volta a 620 Hz, em 3,5 s.
- **subida.mp3:** o riser da logo caindo.
- **whoosh.mp3:** a troca de cena.

Os sons do concorrente **nunca** são copiados. Eles só foram medidos para chegar ao mesmo tipo de som (ver `docs/SONS_DO_CONCORRENTE.md`).
