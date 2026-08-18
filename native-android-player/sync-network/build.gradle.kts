plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.20"
}

android {
    namespace = "com.antigravity.sync"
    compileSdk = 34

    defaultConfig {
        minSdk = 23
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")

        // [SECURITY HARDENING] Credenciais injetadas via arquivo LOCAL
        // supabase.properties (gitignored). NUNCA hardcodar a chave anon no repo.
        // Valores placeholder: build compila, runtime falha com erro claro
        // atÃ© o operador criar o arquivo local (ver supabase.properties.example).
        val supabaseProps = java.util.Properties().apply {
            val f = rootProject.file("supabase.properties")
            if (f.exists()) f.inputStream().use { load(it) }
        }
        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${supabaseProps.getProperty("SUPABASE_URL", "https://CHANGE_ME.supabase.co")}\""
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"${supabaseProps.getProperty("SUPABASE_ANON_KEY", "CHANGE_ME_ANON_KEY")}\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs = listOf(
            "-opt-in=kotlinx.serialization.ExperimentalSerializationApi",
            "-opt-in=io.ktor.util.InternalAPI"
        )
    }
}

dependencies {
    implementation(project(":core-player"))
    
    // Supabase & Ktor (Network Stack) - Reverting to Stable 2.1.0
    // Supabase & Ktor (Network Stack)
    // Supabase & Ktor (Network Stack)
    val supabaseVersion = "2.6.1"
    api("io.github.jan-tennert.supabase:postgrest-kt:$supabaseVersion")
    api("io.github.jan-tennert.supabase:gotrue-kt:$supabaseVersion")
    api("io.github.jan-tennert.supabase:storage-kt:$supabaseVersion")
    api("io.github.jan-tennert.supabase:realtime-kt:$supabaseVersion")
    
    // Ktor
    implementation("io.ktor:ktor-client-okhttp:2.3.7")
    implementation("io.ktor:ktor-client-android:2.3.7")
    implementation("io.ktor:ktor-client-core:2.3.7")
    implementation("io.ktor:ktor-client-serialization:2.3.7")
    implementation("io.ktor:ktor-client-logging:2.3.7")
    
    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
    
    implementation("androidx.core:core-ktx:1.12.0")

    // [SECURITY HARDENING] Armazenamento criptografado de tokens (Android Keystore)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}

