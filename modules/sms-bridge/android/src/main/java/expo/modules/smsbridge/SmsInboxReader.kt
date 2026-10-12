package expo.modules.smsbridge

import android.content.Context
import android.net.Uri

data class RawSms(
  val smsHash: String,
  val sender: String,
  val body: String,
  val receivedAt: Long
)

/**
 * Reads content://sms/inbox for backfill and for the "pick your bank
 * senders" onboarding step. Requires READ_SMS at call time.
 */
object SmsInboxReader {

  fun read(context: Context, sinceEpochMs: Long, limit: Int): List<RawSms> {
    val out = mutableListOf<RawSms>()
    val uri = Uri.parse("content://sms/inbox")
    val projection = arrayOf("address", "body", "date")
    val selection = "date >= ?"
    val args = arrayOf(sinceEpochMs.toString())
    val cursor = try {
      context.contentResolver.query(
        uri, projection, selection, args, "date DESC LIMIT ${limit.coerceIn(1, 1000)}"
      )
    } catch (e: SecurityException) {
      throw e
    } catch (_: Exception) {
      return emptyList()
    } ?: return emptyList()
    cursor.use { c ->
      val iAddr = c.getColumnIndex("address")
      val iBody = c.getColumnIndex("body")
      val iDate = c.getColumnIndex("date")
      while (c.moveToNext()) {
        val sender = if (iAddr != -1 && !c.isNull(iAddr)) c.getString(iAddr) ?: "" else ""
        val body = if (iBody != -1 && !c.isNull(iBody)) c.getString(iBody) ?: "" else ""
        val date = if (iDate != -1 && !c.isNull(iDate)) c.getLong(iDate) else 0L
        if (body.isEmpty()) continue
        out.add(RawSms(smsHash = TemplateParser.sha256Hex(body), sender = sender, body = body, receivedAt = date))
        if (out.size >= limit.coerceIn(1, 1000)) break
      }
    }
    return out
  }
}
