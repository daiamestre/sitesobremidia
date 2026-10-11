package com.antigravity.sync.service

/**
 * F-182 — regras de "quem pode conectar em quê", sem depender de Android (testáveis na JVM).
 *
 * A regra do produto:
 *  - o MESMO login pode ser usado em quantos aparelhos o cliente quiser;
 *  - cada TELA fica conectada a um aparelho por vez (e cada aparelho a uma tela por vez);
 *  - o que o aparelho sabe de si é a identidade de hardware (hash). É ela que o servidor guarda em screens.bound_device_id.
 */
object PairingPolicy {

    enum class Disponibilidade {
        /** Nenhum aparelho conectado: qualquer aparelho do cliente pode conectar. */
        LIVRE,

        /** Já conectada a ESTE aparelho (voltar a ela é sempre permitido). */
        DESTE_APARELHO,

        /** Conectada a OUTRO aparelho: não pode ser tomada por este. */
        EM_USO,
    }

    /** Como esta tela aparece para este aparelho. `telaVinculadaA` é o screens.bound_device_id (identidade do aparelho). */
    fun disponibilidade(telaVinculadaA: String?, minhaIdentidade: String?): Disponibilidade {
        val vinculo = telaVinculadaA?.trim().orEmpty()
        if (vinculo.isEmpty()) return Disponibilidade.LIVRE
        val eu = minhaIdentidade?.trim().orEmpty()
        return if (eu.isNotEmpty() && vinculo.equals(eu, ignoreCase = true)) Disponibilidade.DESTE_APARELHO else Disponibilidade.EM_USO
    }

    /**
     * O comando recebido (ex.: "unpair") é para ESTE aparelho?
     *
     * O servidor grava em `payload.target_device_id` a IDENTIDADE (hash) do aparelho que estava conectado. O Player comparava
     * com o UUID do cadastro do aparelho (devices.id): nunca eram iguais, então o aparelho certo ignorava o comando e
     * aparelhos que ainda não tinham UUID o obedeciam. Agora vale a identidade; o UUID também é aceito.
     */
    fun comandoEhDesteAparelho(alvo: String?, minhaIdentidade: String?, meuCadastroUuid: String?): Boolean {
        val destino = alvo?.trim().orEmpty()
        if (destino.isEmpty()) return true // comando para a tela inteira
        val identidade = minhaIdentidade?.trim().orEmpty()
        val uuid = meuCadastroUuid?.trim().orEmpty()
        if (identidade.isEmpty() && uuid.isEmpty()) return true // sem como comparar: comportamento antigo
        return destino.equals(identidade, ignoreCase = true) || destino.equals(uuid, ignoreCase = true)
    }

    /** Entre as telas da lista, a que já está conectada a este aparelho (outra que não a escolhida), se houver. */
    fun telaAtualDoAparelho(telas: List<Pair<String, String?>>, minhaIdentidade: String?, exceto: String?): String? =
        telas.firstOrNull { (id, vinculo) ->
            id != exceto && disponibilidade(vinculo, minhaIdentidade) == Disponibilidade.DESTE_APARELHO
        }?.first
}
