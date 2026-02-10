plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.20"
}

android {
    namespace = "com.antigravity.sync"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation(project(":core-player"))
    
    // Supabase & Ktor (Network Stack) - Reverting to Stable 2.1.0
    // Supabase & Ktor (Network Stack)
    // Supabase & Ktor (Network Stack)
    val supabaseVersion = "2.5.0"
    implementation("io.github.jan-tennert.supabase:postgrest-kt:$supabaseVersion")
    // implementation("io.github.jan-tennert.supabase:gotrue-kt:$supabaseVersion") // REMOVED to fix build
    implementation("io.github.jan-tennert.supabase:storage-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:realtime-kt:$supabaseVersion")
    
    // Ktor
    implementation("io.ktor:ktor-client-android:2.3.7")
    implementation("io.ktor:ktor-client-core:2.3.7")
    implementation("io.ktor:ktor-client-serialization:2.3.7")
    
    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
    
    implementation("androidx.core:core-ktx:1.12.0")
}
