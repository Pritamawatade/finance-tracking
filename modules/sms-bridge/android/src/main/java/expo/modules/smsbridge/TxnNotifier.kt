package expo.modules.smsbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Transaction prompt + confirmation notifications (spec §6.2).
 *
 * Channels: txn_review (HIGH) for prompts, txn_saved (LOW) for confirmations.
 * Notification id = inbox row id. Group key "txn".
 */
object TxnNotifier {

  const val CHANNEL_REVIEW = "txn_review"
  const val CHANNEL_SAVED = "txn_saved"
  const val GROUP_TXN = "txn"

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_REVIEW, "Transaction review", NotificationManager.IMPORTANCE_HIGH)
    )
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_SAVED, "Saved confirmations", NotificationManager.IMPORTANCE_LOW)
    )
  }

  /** Indian digit grouping: 250000 paise -> "₹2,500.00". Integer math only. */
  fun formatINR(minor: Long): String {
    val negative = minor < 0
    val abs = if (negative) -minor else minor
    val rupees = abs / 100
    val paise = (abs % 100).toString().padStart(2, '0')
    val s = rupees.toString()
    val grouped = if (s.length <= 3) {
      s
    } else {
      val last3 = s.takeLast(3)
      var rest = s.dropLast(3)
      val parts = mutableListOf<String>()
      while (rest.length > 2) {
        parts.add(0, rest.takeLast(2))
        rest = rest.dropLast(2)
      }
      if (rest.isNotEmpty()) parts.add(0, rest)
      parts.joinToString(",") + ",$last3"
    }
    return (if (negative) "-₹" else "₹") + grouped + "." + paise
  }

  private fun bankNameOf(config: ParserConfigData, templateId: String): String? =
    config.templates.firstOrNull { it.id == templateId }?.bankName

  private fun deepLinkIntent(context: Context, smsHash: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("financetracker://review/$smsHash")).apply {
      setPackage(context.packageName)
    }

  private fun contentPendingIntent(context: Context, smsHash: String, rowId: Long): PendingIntent =
    PendingIntent.getActivity(
      context,
      uniqueCode(rowId, 9),
      deepLinkIntent(context, smsHash).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP) },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  private fun uniqueCode(rowId: Long, actionIndex: Int): Int =
    ((rowId % 100000L) * 10L + actionIndex).toInt()

  /**
   * Suggestion buttons: rule match first, then most-used (quickCategories) for
   * the txn direction. Returns at most 2 categories; the 3rd slot is More….
   */
  fun pickSuggestions(
    config: ParserConfigData,
    parsed: ParsedTxn,
    rule: NativeRule?
  ): List<QuickCategory> {
    val pool = if (parsed.direction == "debit") config.quickCategoriesDebit else config.quickCategoriesCredit
    val out = mutableListOf<QuickCategory>()
    if (rule != null) {
      val all = config.quickCategoriesDebit + config.quickCategoriesCredit
      all.firstOrNull { it.id == rule.categoryId }?.let { out.add(it) }
    }
    for (q in pool) {
      if (out.size >= 2) break
      if (out.none { it.id == q.id }) out.add(q)
    }
    return out.take(2)
  }

  fun showPrompt(
    context: Context,
    config: ParserConfigData,
    row: InboxRow,
    parsed: ParsedTxn,
    rule: NativeRule?
  ) {
    if (!config.promptNotificationsEnabled && rule?.autoConfirm != true) {
      // Prompts disabled and no auto-confirm rule: stay silent (item still in inbox for Review).
      return
    }
    ensureChannels(context)
    val app = context.applicationContext
    val amount = formatINR(parsed.amountMinor)
    val who = parsed.counterparty?.ifEmpty { null }
      ?: parsed.description?.ifEmpty { null }
      ?: "Unknown"
    val bank = bankNameOf(config, parsed.templateId)
    val acct = parsed.accountLast4?.let { " ••$it" } ?: ""
    val bankPart = if (bank != null) " · $bank$acct" else acct.trimStart(' ', '·')

    val title = if (parsed.lowConfidence) {
      if (parsed.direction == "debit") "Check details: $amount debited"
      else "Check details: $amount received"
    } else if (parsed.direction == "debit") {
      "$amount debited — add as expense?"
    } else {
      "$amount received — add as income?"
    }
    val text = if (parsed.direction == "debit") {
      val bal = parsed.balanceAfterMinor?.let { " · Bal ${formatINR(it)}" } ?: ""
      "$who$bankPart$bal"
    } else {
      "$who$bankPart"
    }

    val contentPi = contentPendingIntent(app, row.smsHash, row.id)
    val publicNotif = NotificationCompat.Builder(app, CHANNEL_REVIEW)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("New bank transaction")
      .setContentText("Open the app to review.")
      .setGroup(GROUP_TXN)
      .build()
    val builder = NotificationCompat.Builder(app, CHANNEL_REVIEW)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setContentIntent(contentPi)
      .setAutoCancel(true)
      .setGroup(GROUP_TXN)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicNotif)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    val suggestions = pickSuggestions(config, parsed, rule)
    suggestions.forEachIndexed { index, q ->
      val label = if (q.emoji.isNotEmpty()) "${q.emoji} ${q.name}" else q.name
      val pi = PendingIntent.getBroadcast(
        app,
        uniqueCode(row.id, index),
        NotificationActionReceiver.confirmIntent(app, row.id, q.id),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      builder.addAction(android.R.drawable.ic_menu_save, label, pi)
    }
    val morePi = PendingIntent.getActivity(
      app,
      uniqueCode(row.id, 3),
      deepLinkIntent(app, row.smsHash).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP) },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    builder.addAction(android.R.drawable.ic_menu_more, "More…", morePi)

    try {
      NotificationManagerCompat.from(app).notify(row.id.toInt(), builder.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS not granted — item stays in inbox for Review.
    }
  }

  /** Replaces the prompt with a "Saved … ✓" confirmation that auto-dismisses in 3 s. */
  fun showConfirmation(context: Context, rowId: Long, amountMinor: Long, categoryName: String?) {
    ensureChannels(context)
    val app = context.applicationContext
    val text = if (categoryName != null) "Saved ${formatINR(amountMinor)} · $categoryName ✓"
    else "Saved ${formatINR(amountMinor)} ✓"
    val notif = NotificationCompat.Builder(app, CHANNEL_SAVED)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(text)
      .setContentText(text)
      .setAutoCancel(true)
      .setGroup(GROUP_TXN)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setTimeoutAfter(3000)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    try {
      NotificationManagerCompat.from(app).notify(rowId.toInt(), notif)
    } catch (_: SecurityException) {
      // Notifications disabled — nothing to do.
    }
  }

  /** Auto-confirm path: silent txn_saved notification only (if enabled). */
  fun showAutoConfirmation(
    context: Context,
    config: ParserConfigData,
    rowId: Long,
    amountMinor: Long,
    categoryName: String?
  ) {
    if (!config.silentConfirmationsEnabled) return
    showConfirmation(context, rowId, amountMinor, categoryName)
  }

  fun cancel(context: Context, rowId: Long) {
    try {
      NotificationManagerCompat.from(context.applicationContext).cancel(rowId.toInt())
    } catch (_: Exception) {
      // Best effort.
    }
  }

  fun cancelForHash(context: Context, smsHash: String) {
    try {
      val row = InboxDb(context).findByHash(smsHash) ?: return
      cancel(context, row.id)
    } catch (_: Exception) {
      // Best effort.
    }
  }
}
