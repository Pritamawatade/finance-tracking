package expo.modules.smsbridge

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.lang.ref.WeakReference

class SmsBridgeModule : Module() {

  companion object {
    @Volatile
    private var weakRef: WeakReference<SmsBridgeModule>? = null

    /** Emits onInboxChanged if the JS runtime is alive; no-op otherwise. */
    fun emitInboxChanged() {
      try {
        weakRef?.get()?.sendEvent("onInboxChanged", emptyMap<String, Any>())
      } catch (_: Exception) {
        // Runtime not alive — JS will drain on next foreground.
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SmsBridge")

    Events("onInboxChanged")

    OnCreate {
      weakRef = WeakReference(this@SmsBridgeModule)
    }

    OnDestroy {
      if (weakRef?.get() === this@SmsBridgeModule) weakRef = null
    }

    AsyncFunction("configure") { configJson: String ->
      // Validate before persisting so a bad push never breaks killed-state parsing.
      TemplateParser.parseConfigJson(configJson)
      ConfigStore(appContext.reactContext ?: return@AsyncFunction).saveConfigJson(configJson)
    }

    AsyncFunction("drainInbox") {
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      val db = InboxDb(ctx)
      db.purge()
      return@AsyncFunction db.drainUnacked().map { row ->
        val parsed: Map<String, Any?>? = row.parsedJson?.let { json ->
          try {
            jsonToMap(JSONObject(json))
          } catch (_: Exception) {
            null
          }
        }
        mapOf(
          "id" to row.id,
          "smsHash" to row.smsHash,
          "sender" to row.sender,
          "body" to row.body,
          "receivedAt" to row.receivedAt,
          "parsed" to parsed,
          "state" to row.state,
          "categoryId" to row.categoryId
        )
      }
    }

    AsyncFunction("ackInbox") { ids: List<Int> ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      InboxDb(ctx).ack(ids.map { it.toLong() })
      InboxDb(ctx).purge()
    }

    AsyncFunction("readSmsInbox") { sinceEpochMs: Long, limit: Int ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      try {
        SmsInboxReader.read(ctx, sinceEpochMs, limit).map { sms ->
          mapOf<String, Any?>(
            "smsHash" to sms.smsHash,
            "sender" to sms.sender,
            "body" to sms.body,
            "receivedAt" to sms.receivedAt
          )
        }
      } catch (e: SecurityException) {
        throw CodedException("E_SMS_PERMISSION", "READ_SMS not granted", e)
      }
    }

    AsyncFunction("cancelNotification") { smsHash: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      TxnNotifier.cancelForHash(ctx, smsHash)
    }

    AsyncFunction("getSystemState") {
      val ctx = appContext.reactContext ?: return@AsyncFunction mapOf(
        "receiveSms" to false,
        "readSms" to false,
        "notifications" to false,
        "batteryOptimizationIgnored" to false
      )
      val receiveSms = ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.RECEIVE_SMS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      val readSms = ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.READ_SMS) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
      val notifications = if (Build.VERSION.SDK_INT >= 33) {
        ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) ==
          android.content.pm.PackageManager.PERMISSION_GRANTED
      } else {
        NotificationManagerCompat.from(ctx).areNotificationsEnabled()
      }
      val pm = ctx.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
      val batteryOk = try {
        pm.isIgnoringBatteryOptimizations(ctx.packageName)
      } catch (_: Exception) {
        false
      }
      return@AsyncFunction mapOf(
        "receiveSms" to receiveSms,
        "readSms" to readSms,
        "notifications" to notifications,
        "batteryOptimizationIgnored" to batteryOk
      )
    }

    Function("openAppSettings") {
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", ctx.packageName, null)
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      ctx.startActivity(intent)
    }

    Function("openBatteryOptimizationSettings") {
      val ctx = appContext.reactContext ?: return@Function null
      try {
        val intent = Intent(
          Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          Uri.parse("package:${ctx.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        ctx.startActivity(intent)
      } catch (_: Exception) {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
          .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        ctx.startActivity(fallback)
      }
    }

    AsyncFunction("debugInjectSms") { sender: String, body: String ->
      if (!BuildConfig.DEBUG) {
        throw CodedException("E_RELEASE_BUILD", "debugInjectSms is only available in debug builds", null)
      }
      val ctx = appContext.reactContext ?: return@AsyncFunction
      SmsReceiver.handleSms(ctx, sender, body, System.currentTimeMillis())
    }
  }

  private fun jsonToMap(obj: JSONObject): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>()
    val keys = obj.keys()
    while (keys.hasNext()) {
      val k = keys.next()
      map[k] = when {
        obj.isNull(k) -> null
        else -> when (val v = obj.get(k)) {
          is JSONObject -> jsonToMap(v)
          is org.json.JSONArray -> (0 until v.length()).map { i ->
            val e = v.get(i)
            if (e is JSONObject) jsonToMap(e) else if (e == JSONObject.NULL) null else e
          }
          JSONObject.NULL -> null
          is Int -> v.toLong()
          else -> v
        }
      }
    }
    return map
  }
}
