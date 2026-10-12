package expo.modules.smsbridge

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class InboxRow(
  val id: Long,
  val smsHash: String,
  val sender: String,
  val body: String,
  val receivedAt: Long,
  val parsedJson: String?,
  val state: String,
  val categoryId: Long?,
  val acked: Int,
  val createdAt: Long,
  val resolvedAt: Long?
)

/**
 * Private outbox DB (inbox.db). The main ledger (finance.db) has a single
 * writer (JS); native only stages rows here for drainInbox()/ackInbox().
 */
class InboxDb(context: Context) :
  SQLiteOpenHelper(context.applicationContext, "inbox.db", null, 1) {

  companion object {
    const val STATE_PENDING = "pending"
    const val STATE_CONFIRMED = "confirmed"
    const val STATE_AUTO_CONFIRMED = "auto_confirmed"
    const val STATE_IGNORED = "ignored"
    private const val PURGE_AFTER_MS = 30L * 24 * 60 * 60 * 1000 // 30 days
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE inbox (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        sms_hash     TEXT NOT NULL UNIQUE,
        sender       TEXT NOT NULL,
        body         TEXT NOT NULL,
        received_at  INTEGER NOT NULL,
        parsed_json  TEXT,
        state        TEXT NOT NULL DEFAULT 'pending'
                     CHECK (state IN ('pending','confirmed','auto_confirmed','ignored')),
        category_id  INTEGER,
        acked        INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        resolved_at  INTEGER
      )
      """.trimIndent()
    )
    db.execSQL("CREATE INDEX ix_inbox_acked ON inbox(acked)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // v1 — no migrations yet.
  }

  /** Inserts a row; returns the new id, or the existing row id when the hash already exists. */
  fun insert(
    smsHash: String,
    sender: String,
    body: String,
    receivedAt: Long,
    parsedJson: String?,
    state: String = STATE_PENDING,
    categoryId: Long? = null
  ): Long {
    val now = System.currentTimeMillis()
    val values = ContentValues().apply {
      put("sms_hash", smsHash)
      put("sender", sender)
      put("body", body)
      put("received_at", receivedAt)
      put("parsed_json", parsedJson)
      put("state", state)
      put("category_id", categoryId)
      put("acked", 0)
      put("created_at", now)
      if (state != STATE_PENDING) put("resolved_at", now)
    }
    val db = writableDatabase
    val id = db.insertWithOnConflict("inbox", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    if (id != -1L) return id
    return findByHash(smsHash)?.id ?: -1L
  }

  /**
   * Updates state/category on user or auto-confirm action.
   * Any state change resets acked=0 so JS re-drains the row (§4.2 rule 1).
   */
  fun updateState(rowId: Long, state: String, categoryId: Long?) {
    val values = ContentValues().apply {
      put("state", state)
      put("category_id", categoryId)
      put("acked", 0)
      put("resolved_at", System.currentTimeMillis())
    }
    writableDatabase.update("inbox", values, "id = ?", arrayOf(rowId.toString()))
  }

  fun drainUnacked(): List<InboxRow> {
    val db = readableDatabase
    val rows = mutableListOf<InboxRow>()
    db.query("inbox", null, "acked = 0", null, null, null, "id ASC").use { c ->
      while (c.moveToNext()) rows.add(readRow(c))
    }
    return rows
  }

  fun ack(ids: List<Long>) {
    if (ids.isEmpty()) return
    val db = writableDatabase
    db.beginTransaction()
    try {
      val values = ContentValues().apply { put("acked", 1) }
      for (id in ids) {
        db.update("inbox", values, "id = ?", arrayOf(id.toString()))
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /** Deletes acked rows older than 30 days (§4.2 rule 6). */
  fun purge(nowMs: Long = System.currentTimeMillis()): Int {
    return writableDatabase.delete(
      "inbox",
      "acked = 1 AND created_at < ?",
      arrayOf((nowMs - PURGE_AFTER_MS).toString())
    )
  }

  fun findByHash(smsHash: String): InboxRow? {
    readableDatabase.query("inbox", null, "sms_hash = ?", arrayOf(smsHash), null, null, null).use { c ->
      if (c.moveToFirst()) return readRow(c)
    }
    return null
  }

  fun findById(rowId: Long): InboxRow? {
    readableDatabase.query("inbox", null, "id = ?", arrayOf(rowId.toString()), null, null, null).use { c ->
      if (c.moveToFirst()) return readRow(c)
    }
    return null
  }

  private fun readRow(c: android.database.Cursor): InboxRow {
    fun str(name: String): String = c.getString(c.getColumnIndexOrThrow(name)) ?: ""
    fun nullableStr(name: String): String? {
      val i = c.getColumnIndexOrThrow(name)
      return if (c.isNull(i)) null else c.getString(i)
    }
    fun nullableLong(name: String): Long? {
      val i = c.getColumnIndexOrThrow(name)
      return if (c.isNull(i)) null else c.getLong(i)
    }
    return InboxRow(
      id = c.getLong(c.getColumnIndexOrThrow("id")),
      smsHash = str("sms_hash"),
      sender = str("sender"),
      body = str("body"),
      receivedAt = c.getLong(c.getColumnIndexOrThrow("received_at")),
      parsedJson = nullableStr("parsed_json"),
      state = str("state"),
      categoryId = nullableLong("category_id"),
      acked = c.getInt(c.getColumnIndexOrThrow("acked")),
      createdAt = c.getLong(c.getColumnIndexOrThrow("created_at")),
      resolvedAt = nullableLong("resolved_at")
    )
  }
}
