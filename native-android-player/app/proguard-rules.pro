# ProGuard / R8 Rules for Sobre Mídia Player

# Keep Android Core & Annotations
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable

# Kotlin Coroutines & Flow
-keepclassmembers class kotlinx.coroutines.** { *; }
-keepclassmembers class kotlinx.coroutines.android.** { *; }

# AndroidX Media3 / ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
-keepclassmembers class androidx.media3.** { *; }

# Room Database Entities & DAOs
-keep class com.antigravity.cache.entity.** { *; }
-keep class com.antigravity.cache.dao.** { *; }
-keep class com.antigravity.cache.db.** { *; }
-dontwarn androidx.room.**

# Core Domain Models & DTOs
-keep class com.antigravity.core.domain.model.** { *; }
-keep class com.antigravity.sync.dto.** { *; }

# Supabase & kotlinx.serialization
-keepattributes *Annotation*,ElementValue
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
    @kotlinx.serialization.Serializable <fields>;
}
-keep class kotlinx.serialization.** { *; }
-dontwarn io.github.jan.supabase.**
-dontwarn org.slf4j.**
-dontwarn io.ktor.**
-dontwarn org.apache.http.**

# Glide Image Loading
-keep class com.bumptech.glide.** { *; }
-dontwarn com.bumptech.glide.**
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public class * extends com.bumptech.glide.module.LibraryGlideModule

# Keep Native Widgets Engine
-keep class com.antigravity.player.util.NativeWidgetEngine { *; }
