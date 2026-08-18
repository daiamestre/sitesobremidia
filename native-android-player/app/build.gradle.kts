plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

// [SECURITY HARDENING FASE K] Signing de produção via keystore.properties
// (GITIGNORED — nunca commitar keystore/senhas). Fallback: debug keystore
// local do desenvolvedor, apenas para builds locais de teste.
fun loadSigningProps(): java.util.Properties? {
    val f = rootProject.file("keystore.properties")
    if (!f.exists()) return null
    return java.util.Properties().apply { f.inputStream().use { load(it) } }
}

val signingProps = loadSigningProps()

android {
    namespace = "com.antigravity.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.antigravity.player"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
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
                throw GradleException(
                    "[SECURITY] keystore.properties ausente. Crie-o a partir de " +
                    "keystore.properties.example para assinar o APK de PRODUÇÃO. " +
                    "Nunca publique APK assinado com a debug keystore."
                )
            }
            storeFile = file(signingProps.getProperty("STORE_FILE"))
            storePassword = signingProps.getProperty("STORE_PASSWORD")
            keyAlias = signingProps.getProperty("KEY_ALIAS")
            keyPassword = signingProps.getProperty("KEY_PASSWORD")
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
            enableV4Signing = false
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

