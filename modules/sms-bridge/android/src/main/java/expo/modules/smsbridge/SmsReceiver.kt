package expo.modules.smsbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Manifest-declared receiver for SMS_RECEIVED. Wakes even when the app is
 * killed; parses natively and notifies without booting React Native.
 *
 * Pipeline: sender passes monitoredSenderPatterns → body matches no
 * ignorePatterns → TemplateParser.parse() → hash → insert (skip if hash
 * exists) → rules → notify. Monitored-but-unparsed bodies are stored with
 * parsed_json NULL and produce no notification (JS lists them in
 * debug/unparsed). SMS bodies are never logged in release builds.
 */
class SmsReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "SmsReceiver"

    /** Shared pipeline; also used by debugInjectSms. Runs on the caller's thread. */
    fun handleSms(context: Context, sender: String, body: String, receivedAt: Long) {
      val app = context.applicationContext
      val store = ConfigStore(app)
      val config = store.loadConfig()
      if (config == null) {
        if (BuildConfig.DEBUG) Log.d(TAG, "no ParserConfig yet, skipping SMS from $sender")
        return
      }
      if (config.monitoredSenderPatterns.none { p ->
          try {
            p.matcher(sender).find()
          } catch (_: Exception) {
            false
          }
        }) {
        return
      }
      val db = InboxDb(app)
      when (val result = TemplateParser.parse(config, sender, body)) {
        is ParseResult.Ignored -> return // OTP/promo/etc: store nothing.
        is ParseResult.NoMatch -> {
          val hash = TemplateParser.sha256Hex(body)
          db.insert(hash, sender, body, receivedAt, null)
          SmsBridgeModule.emitInboxChanged()
        }
        is ParseResult.Parsed -> {
          val parsed = result.txn
          val hash = TemplateParser.sha256Hex(body)
          if (db.findByHash(hash) != null) return // duplicate delivery
          val rule = matchRule(config, parsed)
          if (rule != null && rule.autoConfirm) {
            val rowId = db.insert(hash, sender, body, receivedAt, parsed.toJson().toString(), InboxDb.STATE_AUTO_CONFIRMED, rule.categoryId)
            if (rowId != -1L) {
              TxnNotifier.showAutoConfirmation(app, config, rowId, parsed.amountMinor, categoryName(config, rule.categoryId))
              SmsBridgeModule.emitInboxChanged()
            }
          } else {
            val rowId = db.insert(hash, sender, body, receivedAt, parsed.toJson().toString())
            if (rowId != -1L) {
              val row = db.findById(rowId)
              if (row != null) TxnNotifier.showPrompt(app, config, row, parsed, rule)
              SmsBridgeModule.emitInboxChanged()
            }
          }
        }
      }
    }

    /** Rule match on normalized counterparty and/or description keys. */
    fun matchRule(config: ParserConfigData, parsed: ParsedTxn): NativeRule? {
      val candidates = mutableListOf<String>()
      parsed.counterparty?.let { candidates.add(TemplateParser.normalizeKey(it)) }
      parsed.description?.let { candidates.add(TemplateParser.normalizeKey(it)) }
      if (candidates.isEmpty()) return null
      return config.rules.firstOrNull { rule ->
        (rule.direction == "any" || rule.direction == parsed.direction) &&
          when (rule.match) {
            "exact" -> candidates.any { it == rule.key }
            "contains" -> candidates.any { rule.key in it }
            else -> false
          }
      }
    }

    fun categoryName(config: ParserConfigData, categoryId: Long): String? =
      (config.quickCategoriesDebit + config.quickCategoriesCredit)
        .firstOrNull { it.id == categoryId }?.name
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val pending = goAsync()
    Thread {
      try {
        val messages = try {
          Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (e: Exception) {
          if (BuildConfig.DEBUG) Log.w(TAG, "getMessagesFromIntent failed: ${e.message}")
          emptyArray()
        }
        if (messages.isEmpty()) return@Thread
        // Concatenate multipart messages from the same originating address.
        val bodies = linkedMapOf<String, StringBuilder>()
        val now = System.currentTimeMillis()
        for (m in messages) {
          val addr = m.originatingAddress ?: continue
          val part = m.messageBody ?: continue
          bodies.getOrPut(addr) { StringBuilder() }.append(part)
        }
        for ((sender, sb) in bodies) {
          try {
            handleSms(context, sender, sb.toString(), now)
          } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.w(TAG, "handleSms failed for $sender: ${e.message}")
          }
        }
      } finally {
        pending.finish()
      }
    }.apply { isDaemon = true }.start()
  }
}
