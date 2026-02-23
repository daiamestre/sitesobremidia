package com.antigravity.player.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class NetworkMonitor(context: Context) {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _isConnected = MutableStateFlow(false)
    val isConnected = _isConnected.asStateFlow()

    // Callback para disparar ações externas (como o Flush de logs)
    var onNetworkRestored: (() -> Unit)? = null

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isConnected.value = true
            com.antigravity.core.util.Logger.i("NETWORK", "Conectividade restabelecida (onAvailable)")
            // Dispara o evento de restauração para o BufferManager
            onNetworkRestored?.invoke()
        }

        override fun onLost(network: Network) {
            _isConnected.value = false
            com.antigravity.core.util.Logger.w("NETWORK", "Conectividade perdida (onLost)")
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            val hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            val wasConnected = _isConnected.value
            _isConnected.value = hasInternet
            
            if (hasInternet && !wasConnected) {
                com.antigravity.core.util.Logger.i("NETWORK", "Internet validada (onCapabilitiesChanged)")
                onNetworkRestored?.invoke()
            }
        }
    }

    fun startMonitoring() {
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            connectivityManager.registerNetworkCallback(request, networkCallback)
            
            // Verificação inicial
            _isConnected.value = checkInitialConnection()
            com.antigravity.core.util.Logger.i("NETWORK", "Sentinela de rede ativado. Estado inicial: ${_isConnected.value}")
        } catch (e: Exception) {
            com.antigravity.core.util.Logger.e("NETWORK", "Erro ao iniciar monitoramento: ${e.message}")
        }
    }

    fun stopMonitoring() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (e: Exception) {
            // Ignorar erros na parada
        }
    }

    private fun checkInitialConnection(): Boolean {
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
