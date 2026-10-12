package expo.modules.smsbridge

import android.content.Context

/**
 * Persists the last ParserConfig JSON in SharedPreferences so native
 * parsing/notification works when the JS runtime is not running.
 */
class ConfigStore(context: Context) {

  private val prefs = context.applicationContext
    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  companion object {
    private const val PREFS_NAME = "sms_bridge_config"
    private const val KEY_CONFIG_JSON = "parser_config_json"
    private const val KEY_CONFIG_VERSION = "parser_config_version"

    @Volatile
    private var cached: ParserConfigData? = null

    fun invalidateCache() {
      cached = null
    }
  }

  fun saveConfigJson(json: String) {
    val version = try {
      TemplateParser.parseConfigJson(json).version
    } catch (_: Exception) {
      -1
    }
    prefs.edit()
      .putString(KEY_CONFIG_JSON, json)
      .putInt(KEY_CONFIG_VERSION, version)
      .apply()
    invalidateCache()
  }

  fun loadConfigJson(): String? = prefs.getString(KEY_CONFIG_JSON, null)

  fun getVersion(): Int = prefs.getInt(KEY_CONFIG_VERSION, -1)

  fun hasConfig(): Boolean = loadConfigJson() != null

  /** Parsed config, memoized per process; null when nothing was configured yet. */
  fun loadConfig(): ParserConfigData? {
    cached?.let { return it }
    val json = loadConfigJson() ?: return null
    return try {
      TemplateParser.parseConfigJson(json).also { cached = it }
    } catch (_: Exception) {
      null
    }
  }

  fun getMonitoredSenderPatterns(): List<String> {
    // Raw JSON round-trip for JS-side introspection; native matching uses loadConfig().
    return try {
      val json = loadConfigJson() ?: return emptyList()
      val arr = org.json.JSONObject(json).optJSONArray("monitoredSenderPatterns")
        ?: return emptyList()
      (0 until arr.length()).map { arr.getString(it) }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun isPromptNotificationsEnabled(): Boolean =
    loadConfig()?.promptNotificationsEnabled ?: true

  fun isSilentConfirmationsEnabled(): Boolean =
    loadConfig()?.silentConfirmationsEnabled ?: true

  fun clear() {
    prefs.edit().clear().apply()
    invalidateCache()
  }
}
