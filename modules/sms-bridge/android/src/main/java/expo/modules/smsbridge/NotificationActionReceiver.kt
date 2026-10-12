package expo.modules.smsbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject

/**
 * Handles notification action taps (no activity trampolines — Android 12+
 * forbids them). Updates the inbox row (state/category, acked=0),
 * replaces or cancels the notification, and emits onInboxChanged.
 */
class NotificationActionReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION_CONFIRM_CATEGORY = "expo.modules.smsbridge.CONFIRM_CATEGORY"
    const val ACTION_IGNORE = "expo.modules.smsbridge.IGNORE"
    const val EXTRA_ROW_ID = "row_id"
    const val EXTRA_CATEGORY_ID = "category_id"
    private const val TAG = "NotifActionReceiver"

    fun confirmIntent(context: Context, rowId: Long, categoryId: Long): Intent =
      Intent(context, NotificationActionReceiver::class.java).apply {
        action = ACTION_CONFIRM_CATEGORY
        putExtra(EXTRA_ROW_ID, rowId)
        putExtra(EXTRA_CATEGORY_ID, categoryId)
      }

    fun ignoreIntent(context: Context, rowId: Long): Intent =
      Intent(context, NotificationActionReceiver::class.java).apply {
        action = ACTION_IGNORE
        putExtra(EXTRA_ROW_ID, rowId)
      }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    Thread {
      try {
        val app = context.applicationContext
        val rowId = intent.getLongExtra(EXTRA_ROW_ID, -1L)
        if (rowId == -1L) return@Thread
        val db = InboxDb(app)
        val row = db.findById(rowId) ?: run {
          TxnNotifier.cancel(app, rowId)
          return@Thread
        }
        when (intent.action) {
          ACTION_CONFIRM_CATEGORY -> {
            val categoryId = intent.getLongExtra(EXTRA_CATEGORY_ID, -1L).takeIf { it != -1L }
            db.updateState(rowId, InboxDb.STATE_CONFIRMED, categoryId)
            val parsed = row.parsedJson?.let {
              try {
                ParsedTxn.fromJson(JSONObject(it))
              } catch (_: Exception) {
                null
              }
            }
            val name = if (categoryId != null) {
              ConfigStore(app).loadConfig()?.let { SmsReceiver.categoryName(it, categoryId) }
            } else null
            TxnNotifier.showConfirmation(app, rowId, parsed?.amountMinor ?: 0L, name)
            SmsBridgeModule.emitInboxChanged()
          }
          ACTION_IGNORE -> {
            db.updateState(rowId, InboxDb.STATE_IGNORED, null)
            TxnNotifier.cancel(app, rowId)
            SmsBridgeModule.emitInboxChanged()
          }
          else -> {
            if (BuildConfig.DEBUG) Log.w(TAG, "unknown action: ${intent.action}")
          }
        }
      } finally {
        pending.finish()
      }
    }.apply { isDaemon = true }.start()
  }
}
