package com.antigravity.sync.dto

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * `days_of_week` chega do RPC como string ("1,2,3") OU como array JSON ([1,2,3], o tipo real da coluna `days integer[]`).
 * O DTO só aceitava string: um único item com dias definidos derrubava a sincronização INTEIRA
 * ("Expected beginning of the string, but got [") e o Player caía no cache offline sem receber mais nada.
 * Sempre normaliza para "1,2,3" (o formato que o SchedulingEngine já lê); vazio/nulo = sem restrição de dias.
 */
object FlexibleDaysSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexibleDays", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString()
        return when (element) {
            is JsonNull -> null
            is JsonArray -> element.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { s -> s.isNotEmpty() } }
                .joinToString(",").ifEmpty { null }
            is JsonPrimitive -> element.contentOrNull?.trim()?.ifEmpty { null }
            else -> null
        }
    }

    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}
