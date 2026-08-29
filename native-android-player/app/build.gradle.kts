import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

// [SECURITY HARDENING FASE K] Signing de produção via keystore.properties
// (GITIGNORED — nunca commitar keystore/senhas). Fallback: debug keystore
// local do desenvolvedor, apenas para builds locais de teste.
fun loadSigningProps(): Properties? {
    val f = rootProject.file("keystore.properties")
    if (!f.exists()) return null
    val props = Properties()
    f.inputStream().use { props.load(it) }
    return props
}

val signingProps = loadSigningProps()

// [P1 FIX] versionCode monotônico — o OTA (app_releases) usa version_code
// para anti-downgrade; o valor fixo 1 tornava a proteção inútil.
// Prioridade: env VERSION_CODE (CI) -> contagem de commits git -> época
// em segundos desde 2024-01-01 (sempre crescente no tempo).
fun loadVersionCode(): Int {
    System.getenv("VERSION_CODE")?.toIntOrNull()?.let { return it }
    return try {
        val proc = ProcessBuilder("git", "-C", rootProject.projectDir.absolutePath, "rev-list", "--count", "HEAD")
            .redirectErrorStream(true)
            .start()
        val count = proc.inputStream.bufferedReader().readText().trim().toIntOrNull()
        if (count != null && count > 0) count else fallbackVersionCode()
    } catch (e: Exception) {
        fallbackVersionCode()
    }
}

fun fallbackVersionCode(): Int {
    val epochMillis = 1704067200000L // 2024-01-01T00:00:00Z
    return ((System.currentTimeMillis() - epochMillis) / 1000).toInt().coerceAtLeast(1)
}

android {
    namespace = "com.antigravity.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.antigravity.player"
        minSdk = 23
        targetSdk = 34
        versionCode = loadVersionCode()
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        
        // ABI ARCHITECTURE: Universal Binary (ARM + x86 for Emulators/Chromebooks/Tablets/TVs)
        ndk {
            abiFilters.addAll(listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64"))
        }

        // [SECURITY FASE F] Pin do certificado de assinatura do release APK
        // (SHA-256 do cert, 64 hex). Configurado no keystore.properties
        // (GITIGNORED). Se vazio, a verificação de assinatura é ignorada —
        // a integridade SHA-256 do arquivo continua OBRIGATÓRIA.
        buildConfigField(
            "String",
            "OTA_RELEASE_CERT_SHA256",
            "\"${signingProps?.getProperty("OTA_RELEASE_CERT_SHA256") ?: ""}\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("production") {
            if (signingProps == null) {
                // Não jogar exception direta aqui senão quebra o Gradle Sync até para builds de debug!
                System.err.println("WARNING: [SECURITY] keystore.properties ausente. Crie-o para assinar o APK de PRODUÇÃO.")
            } else {
                val certSha = signingProps.getProperty("OTA_RELEASE_CERT_SHA256", "")
                val keyAliasVal = signingProps.getProperty("KEY_ALIAS", "")
                val storeFileObj = file(signingProps.getProperty("STORE_FILE"))
                val storePass = signingProps.getProperty("STORE_PASSWORD")

                storeFile = storeFileObj
                storePassword = storePass
                keyAlias = keyAliasVal
                keyPassword = signingProps.getProperty("KEY_PASSWORD")
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = false

                // [SECURITY HARDENING] Validar evidência criptográfica real no momento da compilação de release
                gradle.taskGraph.whenReady {
                    val taskGraph = this
                    if (taskGraph.hasTask(":app:assembleRelease") || taskGraph.hasTask(":app:bundleRelease")) {
                        if (keyAliasVal.contains("dev", ignoreCase=true) || keyAliasVal.contains("temp", ignoreCase=true) || keyAliasVal == "release-alias") {
                            throw GradleException("SECURITY BLOCK: Alias de desenvolvimento ($keyAliasVal) detectado. Chave de produção oficial exigida.")
                        }
                        if (certSha.isEmpty()) {
                            throw GradleException("SECURITY BLOCK: OTA_RELEASE_CERT_SHA256 não configurado. OTA exige SHA-256 do certificado.")
                        }

                        // Executar keytool para validar o Subject e Issuer
                        try {
                            val proc = ProcessBuilder("keytool", "-list", "-v", "-keystore", storeFileObj.absolutePath, "-alias", keyAliasVal, "-storepass", storePass)
                                .redirectErrorStream(true)
                                .start()
                            val output = proc.inputStream.bufferedReader().readText()
                            if (output.contains("OU=Dev") || output.contains("O=Dev")) {
                                throw GradleException("SECURITY BLOCK: Certificado de desenvolvimento detectado (OU=Dev). Proibido assinar Release com esta chave.")
                            }
                        } catch (e: Exception) {
                            if (e is GradleException) throw e
                            println("WARNING: Nao foi possivel executar o keytool para verificacao profunda. Certifique-se que o keytool esta no PATH.")
                        }
                    }
                }
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // [SECURITY FASE K] Release NUNCA assina com debug keystore:
            // sem keystore.properties o build de release falha na configuração.
            signingConfig = signingConfigs.getByName("production")
        }
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs = listOf("-opt-in=androidx.media3.common.util.UnstableApi")
    }
}

dependencies {
    implementation(project(":core-player"))
    implementation(project(":sync-network"))
    implementation(project(":media-engine"))
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    
    // Lifecycle & Coroutines
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Media3 (Explicitly added to resolve visibility issues)
    implementation("androidx.media3:media3-exoplayer:1.2.0")
    implementation("androidx.media3:media3-ui:1.2.0")
    implementation("androidx.media3:media3-common:1.2.0")
    
    // Cache Manager
    implementation(project(":cache-manager"))
    
    // WorkManager (for HeartbeatWorker, LogSyncWorker)
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    
    // OkHttp (Explicitly added for UploadWorker)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // ConstraintLayout (Layout Standard)
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    
    // Glide (Image Loading & Pre-caching)
    implementation("com.github.bumptech.glide:glide:4.16.0")
    ksp("com.github.bumptech.glide:ksp:4.16.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}

