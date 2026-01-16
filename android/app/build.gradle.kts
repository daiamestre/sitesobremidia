plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

android {
    namespace = "com.sobremidia.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sobremidia.player"
        minSdk = 26 // Android 8.0 (Oreo) - Good baseline for modern TV boxes
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
    into(file("src/main/assets/www"))
    
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
