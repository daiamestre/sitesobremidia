plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("kotlin-kapt")
}

android {
    namespace = "com.antigravity.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.antigravity.player"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        
        // ABI ARCHITECTURE: Universal Binary (ARM + x86 for Emulators/Chromebooks/Tablets/TVs)
        ndk {
            abiFilters.addAll(listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64"))
        }
    }

    signingConfigs {
        create("hybrid") {
            // Standard Debug Keystore for now (Replace with real key for Production)
            storeFile = file("${System.getProperty("user.home")}/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            
            // UNIVERSAL COMPATIBILITY: Force V1 (JAR) + V2 (APK) + V3 (Key Rotation)
            // Critical for Android 5/6/7 TV Boxes (V1) and Modern Android 11+ / Fire TV (V2/V3)
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true 
            enableV4Signing = false 
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("hybrid")
        }
        debug {
            signingConfig = signingConfigs.getByName("hybrid")
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
    
    // ConstraintLayout (Layout Standard)
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    
    // Glide (Image Loading & Pre-caching)
    implementation("com.github.bumptech.glide:glide:4.16.0")
    kapt("com.github.bumptech.glide:compiler:4.16.0")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
