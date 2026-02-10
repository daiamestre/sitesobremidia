plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.antigravity.media"
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
    implementation("androidx.core:core-ktx:1.12.0")
    
    // Media3 (ExoPlayer) - Exported as API so :app can use PlayerView and ExoPlayer types
    api("androidx.media3:media3-exoplayer:1.2.0")
    api("androidx.media3:media3-ui:1.2.0")
    api("androidx.media3:media3-common:1.2.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
