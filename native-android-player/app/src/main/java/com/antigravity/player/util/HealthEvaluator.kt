package com.antigravity.player.util

import com.antigravity.core.util.Logger
import kotlin.math.roundToInt

/**
 * HealthEvaluator - Avalia o estado de saúde do dispositivo
 * 
 * Status possíveis:
 * - ONLINE: Heartbeat recente, sem problemas críticos
 * - OFFLINE: Heartbeat ultrapassou timeout (determinado pelo backend via cron)
 * - DEGRADED: Online mas com problemas (temp alta, storage cheio, memoria alta, erros playback)
 * - UNKNOWN: Sem informação suficiente
 * 
 * REGRA: O status OFFLINE é determinado PELO BACKEND (cron job baseado em last_seen).
 * Este evaluator roda no device e retorna ONLINE/DEGRADED/UNKNOWN.
 * O backend sobrescreve para OFFLINE se last_seen > 5 min.
 */
object HealthEvaluator {

    // Thresholds configuráveis
    private const val TEMP_CRITICAL_C = 85f
    private const val TEMP_HIGH_C = 75f
    private const val STORAGE_CRITICAL_PCT = 95f
    private const val STORAGE_WARNING_PCT = 85f
    private const val MEMORY_CRITICAL_PCT = 95f
    private const val MEMORY_WARNING_PCT = 85f
    private const val PLAYBACK_ERROR_CRITICAL = 10
    private const val PLAYBACK_ERROR_WARNING = 5
    private const val BATTERY_CRITICAL_PCT = 10
    private const val BATTERY_WARNING_PCT = 20
    private const val WIFI_CRITICAL_DBM = -85
    private const val WIFI_WARNING_DBM = -70

    enum class HealthStatus {
        ONLINE,       // Verde - tudo ok
        DEGRADED,     // Amarelo/Laranja - atenção necessária
        UNKNOWN       // Cinza - sem dados suficientes
        // OFFLINE é determinado pelo backend
    }

    data class HealthEvaluation(
        val status: HealthStatus,
        val issues: List<HealthIssue>,
        val metrics: HealthMetrics
    )

    data class HealthIssue(
        val severity: Severity,
        val code: String,
        val message: String,
        val value: Any?
    )

    enum class Severity {
        CRITICAL,   // 🔴 - Ação imediata
        WARNING,    // 🟡/🟠 - Atenção
        INFO        // 🟢 - Informativo
    }

    data class HealthMetrics(
        val temperatureCelsius: Float?,
        val storageUsagePercent: Float?,
        val memoryUsagePercent: Float?,
        val batteryLevel: Int?,
        val wifiSignalDbm: Int?,
        val playbackErrorCount: Int?,
        val thermalStatus: String?,
        val uptimeSeconds: Long?
    )

    /**
     * Avalia a saúde do dispositivo baseado nas métricas coletadas
     */
    fun evaluate(telemetry: TelemetryCollector.TelemetryData): HealthEvaluation {
        val issues = mutableListOf<HealthIssue>()
        var maxSeverity = Severity.INFO

        // ============================================================
        // TEMPERATURA
        // ============================================================
        telemetry.temperatureCelsius?.let { temp ->
            when {
                temp >= 85f -> {
                    issues.add(HealthIssue(Severity.CRITICAL, "TEMP_CRITICAL",
                        "Temperatura crítica: ${temp}°C", temp))
                    maxSeverity = Severity.CRITICAL
                }
                temp >= 75f -> {
                    issues.add(HealthIssue(Severity.WARNING, "TEMP_HIGH",
                        "Temperatura alta: ${temp}°C", temp))
                    if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                }
                temp >= 60f -> {
                    issues.add(HealthIssue(Severity.INFO, "TEMP_ELEVATED",
                        "Temperatura elevada: ${temp}°C", temp))
                }
            }
            Unit
        }

        // ============================================================
        // ARMAZENAMENTO
        // ============================================================
        telemetry.storageTotalMb?.let { total ->
            telemetry.storageUsedMb?.let { used ->
                val pct = (used.toFloat() / total.toFloat()) * 100
                when {
                    pct >= STORAGE_CRITICAL_PCT -> {
                        issues.add(HealthIssue(Severity.CRITICAL, "STORAGE_CRITICAL",
                            "Armazenamento crítico: ${pct.roundToInt()}% usado ($used/$total MB)", pct))
                        maxSeverity = Severity.CRITICAL
                    }
                    pct >= STORAGE_WARNING_PCT -> {
                        issues.add(HealthIssue(Severity.WARNING, "STORAGE_WARNING",
                            "Armazenamento alto: ${pct.roundToInt()}% usado ($used/$total MB)", pct))
                        if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                    }
                }
            }
            Unit
        }

        // ============================================================
        // MEMÓRIA
        // ============================================================
        telemetry.memoryTotalMb?.let { total ->
            telemetry.memoryUsedMb?.let { used ->
                val pct = (used.toFloat() / total.toFloat()) * 100
                when {
                    pct >= MEMORY_CRITICAL_PCT -> {
                        issues.add(HealthIssue(Severity.CRITICAL, "MEMORY_CRITICAL",
                            "Memória crítica: ${pct.roundToInt()}% usada ($used/$total MB)", pct))
                        maxSeverity = Severity.CRITICAL
                    }
                    pct >= MEMORY_WARNING_PCT -> {
                        issues.add(HealthIssue(Severity.WARNING, "MEMORY_WARNING",
                            "Memória alta: ${pct.roundToInt()}% usada ($used/$total MB)", pct))
                        if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                    }
                }
            }
            Unit
        }

        // ============================================================
        // BATERIA (apenas se dispositivo tiver bateria)
        // ============================================================
        telemetry.batteryLevel?.let { level ->
            when {
                level <= BATTERY_CRITICAL_PCT -> {
                    issues.add(HealthIssue(Severity.CRITICAL, "BATTERY_CRITICAL",
                        "Bateria crítica: ${level}%", level))
                    maxSeverity = Severity.CRITICAL
                }
                level <= BATTERY_WARNING_PCT -> {
                    issues.add(HealthIssue(Severity.WARNING, "BATTERY_WARNING",
                        "Bateria baixa: ${level}%", level))
                    if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                }
            }
            Unit
        }

        // ============================================================
        // WI-FI
        // ============================================================
        telemetry.wifiSignalDbm?.let { rssi ->
            when {
                rssi <= WIFI_CRITICAL_DBM -> {
                    issues.add(HealthIssue(Severity.CRITICAL, "WIFI_CRITICAL",
                        "Sinal Wi-Fi crítico: ${rssi} dBm", rssi))
                    maxSeverity = Severity.CRITICAL
                }
                rssi <= WIFI_WARNING_DBM -> {
                    issues.add(HealthIssue(Severity.WARNING, "WIFI_WARNING",
                        "Sinal Wi-Fi fraco: ${rssi} dBm", rssi))
                    if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                }
            }
            Unit
        }

        // ============================================================
        // ERROS DE PLAYBACK
        // ============================================================
        telemetry.playbackErrorCount?.let { count ->
            when {
                count >= PLAYBACK_ERROR_CRITICAL -> {
                    issues.add(HealthIssue(Severity.CRITICAL, "PLAYBACK_ERRORS_CRITICAL",
                        "Muitos erros de reprodução: $count", count))
                    maxSeverity = Severity.CRITICAL
                }
                count >= PLAYBACK_ERROR_WARNING -> {
                    issues.add(HealthIssue(Severity.WARNING, "PLAYBACK_ERRORS_WARNING",
                        "Erros de reprodução: $count", count))
                    if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                }
            }
            Unit
        }

        // ============================================================
        // THERMAL STATUS (já processado pelo device)
        // ============================================================
        telemetry.thermalStatus?.let { thermal ->
            when (thermal.uppercase()) {
                "CRITICAL" -> {
                    issues.add(HealthIssue(Severity.CRITICAL, "THERMAL_CRITICAL",
                        "Estado térmico crítico", thermal))
                    maxSeverity = Severity.CRITICAL
                }
                "HIGH" -> {
                    issues.add(HealthIssue(Severity.WARNING, "THERMAL_HIGH",
                        "Estado térmico alto", thermal))
                    if (maxSeverity == Severity.INFO) maxSeverity = Severity.WARNING
                }
            }
            Unit
        }

        // ============================================================
        // DETERMINA STATUS FINAL
        // ============================================================
        val status = when {
            issues.any { it.severity == Severity.CRITICAL } -> HealthStatus.DEGRADED
            issues.any { it.severity == Severity.WARNING } -> HealthStatus.DEGRADED
            issues.isEmpty() -> HealthStatus.ONLINE
            else -> HealthStatus.DEGRADED // Tem issues INFO
        }

        val metrics = HealthMetrics(
            temperatureCelsius = telemetry.temperatureCelsius,
            storageUsagePercent = telemetry.storageTotalMb?.let { total ->
                telemetry.storageUsedMb?.let { used -> (used.toFloat() / total.toFloat()) * 100 }
            },
            memoryUsagePercent = telemetry.memoryTotalMb?.let { total ->
                telemetry.memoryUsedMb?.let { used -> (used.toFloat() / total.toFloat()) * 100 }
            },
            batteryLevel = telemetry.batteryLevel,
            wifiSignalDbm = telemetry.wifiSignalDbm,
            playbackErrorCount = telemetry.playbackErrorCount,
            thermalStatus = telemetry.thermalStatus,
            uptimeSeconds = telemetry.uptimeSeconds
        )

        if (issues.isNotEmpty()) {
            Logger.d("HEALTH_EVAL", "Health evaluation: $status, issues=${issues.size}, maxSeverity=$maxSeverity")
            issues.forEach { Logger.d("HEALTH_EVAL", "  - ${it.severity}: ${it.code} = ${it.message}") }
        }

        return HealthEvaluation(status, issues, metrics)
    }

    /**
     * Converte para string legível para logging/debug
     */
    fun HealthEvaluation.toSummary(): String {
        val sb = StringBuilder()
        sb.append("Status: ${status.name}\n")
        sb.append("Issues: ${issues.size}\n")
        issues.groupBy { it.severity }.forEach { (severity, list) ->
            sb.append("  ${severity.name}: ${list.size}\n")
            list.forEach { sb.append("    - ${it.code}: ${it.message}\n") }
        }
        metrics.let { m ->
            sb.append("Metrics:\n")
            m.temperatureCelsius?.let { sb.append("  Temp: ${it}°C\n") }
            m.storageUsagePercent?.let { sb.append("  Storage: ${it.roundToInt()}%\n") }
            m.memoryUsagePercent?.let { sb.append("  Memory: ${it.roundToInt()}%\n") }
            m.batteryLevel?.let { sb.append("  Battery: ${it}%\n") }
            m.wifiSignalDbm?.let { sb.append("  WiFi: ${it} dBm\n") }
            m.playbackErrorCount?.let { sb.append("  Playback Errors: ${it}\n") }
            m.thermalStatus?.let { sb.append("  Thermal: ${it}\n") }
            m.uptimeSeconds?.let { sb.append("  Uptime: ${formatUptime(it)}\n") }
        }
        return sb.toString()
    }

    private fun formatUptime(seconds: Long): String {
        val days = seconds / 86400
        val hours = (seconds % 86400) / 3600
        val minutes = (seconds % 3600) / 60
        return when {
            days > 0 -> "${days}d ${hours}h ${minutes}m"
            hours > 0 -> "${hours}h ${minutes}m"
            else -> "${minutes}m"
        }
    }
}