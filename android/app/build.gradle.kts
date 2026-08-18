plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

// [SECURITY FASE F] Signing de release via keystore.properties (GITIGNORED).
// Sem o arquivo, o build de RELEASE falha na configuração (fail-closed):
// nunca publicar APK assinado com a debug keystore.
fun loadSigningProps(): java.util.Properties? {
    val f = rootProject.file("keystore.properties")
    if (!f.exists()) return null
    return java.util.Properties().apply { f.inputStream().use { load(it) } }
}

val signingProps = loadSigningProps()

android {
    namespace = "com.sobremidia.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sobremidia.player"
        minSdk = 24 // Android 7.0 (Nougat) - Better support for older TV boxes
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // [SECURITY FASE F] Release NUNCA assina com debug keystore
            signingConfig = signingConfigs.getByName("production")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        viewBinding = true
    }
}

// Task to copy React build to Android assets
tasks.register<Copy>("copyWebAssets") {
    description = "Copies the React build artifacts to Android assets"
    
    // Path to the React project 'dist' folder (relative to this file: ../../dist)
    from(file("../../dist")) {
        include("**/*")
    }
    
    // Target path in the Android project
    into(file("src/main/assets/public"))
    
    // Ensure this runs before preBuild
    // Note: User must run 'npm run build' manually or we can trigger it. 
    // For now, we assume dist exists or will be created.
}

// Hook into the build process
tasks.named("preBuild") {
    dependsOn("copyWebAssets")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.work.runtime.ktx) // WorkManager for background tasks
}
