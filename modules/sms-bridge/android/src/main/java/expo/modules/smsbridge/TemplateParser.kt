package expo.modules.smsbridge

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.security.MessageDigest
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.regex.Pattern

/**
 * Executes ParserConfig templates. Must stay in sync with the TS parser
 * (src/services/parser tree) and spec §7. Normalization rules are identical
 * on both sides: see normalizeKey, amountToMinor, sha256Hex, parseBodyDate.
 */
data class ParsedTxn(
  val templateId: String,
  val direction: String, // 'debit' | 'credit'
  val amountMinor: Long, // paise, integer — never a float
  val accountLast4: String?,
  val reference: String?,
  val counterparty: String?,
  val description: String?,
  val channel: String, // 'upi' | 'other'
  val txnDate: String, // 'YYYY-MM-DD' (from body)
  val balanceAfterMinor: Long?,
  val lowConfidence: Boolean
) {
  fun toJson(): JSONObject = JSONObject()
    .put("templateId", templateId)
    .put("direction", direction)
    .put("amountMinor", amountMinor)
    .put("accountLast4", accountLast4 ?: JSONObject.NULL)
    .put("reference", reference ?: JSONObject.NULL)
    .put("counterparty", counterparty ?: JSONObject.NULL)
    .put("description", description ?: JSONObject.NULL)
    .put("channel", channel)
    .put("txnDate", txnDate)
    .put("balanceAfterMinor", balanceAfterMinor ?: JSONObject.NULL)
    .put("lowConfidence", lowConfidence)

  companion object {
    fun fromJson(obj: JSONObject): ParsedTxn = ParsedTxn(
      templateId = obj.getString("templateId"),
      direction = obj.getString("direction"),
      amountMinor = obj.getLong("amountMinor"),
      accountLast4 = obj.optString("accountLast4", null),
      reference = obj.optString("reference", null),
      counterparty = obj.optString("counterparty", null),
      description = obj.optString("description", null),
      channel = obj.getString("channel"),
      txnDate = obj.getString("txnDate"),
      balanceAfterMinor = if (obj.isNull("balanceAfterMinor")) null else obj.getLong("balanceAfterMinor"),
      lowConfidence = obj.optBoolean("lowConfidence", false)
    )
  }
}

sealed interface ParseResult {
  data class Parsed(val txn: ParsedTxn) : ParseResult
  data object NoMatch : ParseResult
  data object Ignored : ParseResult
}

data class QuickCategory(val id: Long, val name: String, val emoji: String)

data class NativeRule(
  val match: String, // 'exact' | 'contains'
  val key: String, // normalized counterparty key
  val direction: String, // 'debit' | 'credit' | 'any'
  val categoryId: Long,
  val autoConfirm: Boolean
)

sealed interface ParserTemplate {
  val id: String
  val bankName: String

  data class Full(
    override val id: String,
    override val bankName: String,
    val senderMatch: String?,
    val direction: String,
    val pattern: Pattern,
    val dateFormat: String
  ) : ParserTemplate

  data class Fields(
    override val id: String,
    override val bankName: String,
    val fields: Map<String, String>,
    val debitKeywords: List<String>,
    val creditKeywords: List<String>,
    val dateFormats: List<String>
  ) : ParserTemplate
}

data class ParserConfigData(
  val version: Int,
  val monitoredSenderPatterns: List<Pattern>,
  val ignorePatterns: List<Pattern>,
  val templates: List<ParserTemplate>,
  val quickCategoriesDebit: List<QuickCategory>,
  val quickCategoriesCredit: List<QuickCategory>,
  val rules: List<NativeRule>,
  val promptNotificationsEnabled: Boolean,
  val silentConfirmationsEnabled: Boolean
)

object TemplateParser {

  fun parseConfigJson(json: String): ParserConfigData {
    val root = JSONObject(json)
    fun patternList(key: String): List<Pattern> {
      val arr = root.optJSONArray(key) ?: JSONArray()
      return (0 until arr.length()).map { i ->
        Pattern.compile(arr.getString(i), Pattern.CASE_INSENSITIVE)
      }
    }
    val templates = mutableListOf<ParserTemplate>()
    val tArr = root.optJSONArray("templates") ?: JSONArray()
    for (i in 0 until tArr.length()) {
      val t = tArr.getJSONObject(i)
      val id = t.getString("id")
      val bankName = t.optString("bankName", "")
      if (t.optString("mode", "full") == "fields") {
        val fields = mutableMapOf<String, String>()
        val fObj = t.optJSONObject("fields")
        if (fObj != null) {
          for (k in listOf("amt", "acct", "ref", "payee", "bal", "date")) {
            if (fObj.has(k) && !fObj.isNull(k)) fields[k] = fObj.getString(k)
          }
        }
        fun strList(key: String): List<String> {
          val a = t.optJSONArray(key) ?: JSONArray()
          return (0 until a.length()).map { j -> a.getString(j) }
        }
        templates.add(
          ParserTemplate.Fields(
            id = id, bankName = bankName, fields = fields,
            debitKeywords = strList("debitKeywords"),
            creditKeywords = strList("creditKeywords"),
            dateFormats = strList("dateFormats")
          )
        )
      } else {
        val flags = t.optString("flags", "")
        val pFlags = if (flags.contains("i")) Pattern.CASE_INSENSITIVE else 0
        templates.add(
          ParserTemplate.Full(
            id = id, bankName = bankName,
            senderMatch = if (t.has("senderMatch") && !t.isNull("senderMatch")) t.getString("senderMatch") else null,
            direction = t.getString("direction"),
            pattern = Pattern.compile(t.getString("pattern"), pFlags),
            dateFormat = t.optString("dateFormat", "dd-MM-yy")
          )
        )
      }
    }
    fun quickList(parent: JSONObject?, key: String): List<QuickCategory> {
      val a = parent?.optJSONArray(key) ?: JSONArray()
      return (0 until a.length()).map { j ->
        val o = a.getJSONObject(j)
        QuickCategory(id = o.getLong("id"), name = o.getString("name"), emoji = o.optString("emoji", ""))
      }
    }
    val qc = root.optJSONObject("quickCategories")
    val rules = mutableListOf<NativeRule>()
    val rArr = root.optJSONArray("rules") ?: JSONArray()
    for (i in 0 until rArr.length()) {
      val o = rArr.getJSONObject(i)
      rules.add(
        NativeRule(
          match = o.getString("match"),
          key = o.getString("key"),
          direction = o.getString("direction"),
          categoryId = o.getLong("categoryId"),
          autoConfirm = o.optBoolean("autoConfirm", false)
        )
      )
    }
    return ParserConfigData(
      version = root.optInt("version", 0),
      monitoredSenderPatterns = patternList("monitoredSenderPatterns"),
      ignorePatterns = patternList("ignorePatterns"),
      templates = templates,
      quickCategoriesDebit = quickList(qc, "debit"),
      quickCategoriesCredit = quickList(qc, "credit"),
      rules = rules,
      promptNotificationsEnabled = root.optBoolean("promptNotificationsEnabled", true),
      silentConfirmationsEnabled = root.optBoolean("silentConfirmationsEnabled", true)
    )
  }

  /** Full pipeline entry: ignore-check → first-match-wins template evaluation. */
  fun parse(config: ParserConfigData, sender: String, body: String): ParseResult {
    for (p in config.ignorePatterns) {
      if (p.matcher(body).find()) return ParseResult.Ignored
    }
    for (t in config.templates) {
      when (t) {
        is ParserTemplate.Full -> {
          if (t.senderMatch != null) {
            try {
              if (!Pattern.compile(t.senderMatch, Pattern.CASE_INSENSITIVE).matcher(sender).find()) continue
            } catch (_: Exception) {
              continue
            }
          }
          val m = try {
            t.pattern.matcher(body)
          } catch (_: Exception) {
            continue
          }
          if (!m.find()) continue
          val amtRaw = group(m, "amt") ?: continue
          val dateRaw = group(m, "date") ?: continue
          val amountMinor = try {
            amountToMinor(amtRaw)
          } catch (_: Exception) {
            continue
          }
          val txnDate = try {
            parseBodyDate(dateRaw, t.dateFormat)
          } catch (_: Exception) {
            continue
          }
          val ref = group(m, "ref")?.trim()?.ifEmpty { null }
          val payee = group(m, "payee")?.trim()?.ifEmpty { null }
          val desc = group(m, "desc")?.trim()?.ifEmpty { null }
          val balRaw = group(m, "bal")
          return ParseResult.Parsed(
            ParsedTxn(
              templateId = t.id,
              direction = t.direction,
              amountMinor = amountMinor,
              accountLast4 = group(m, "acct")?.trim()?.ifEmpty { null },
              reference = ref,
              counterparty = payee,
              description = desc,
              channel = if (ref != null) "upi" else "other",
              txnDate = txnDate,
              balanceAfterMinor = balRaw?.let {
                try {
                  amountToMinor(it)
                } catch (_: Exception) {
                  null
                }
              },
              lowConfidence = false
            )
          )
        }
        is ParserTemplate.Fields -> {
          val parsed = parseFields(t, body) ?: continue
          return ParseResult.Parsed(parsed)
        }
      }
    }
    return ParseResult.NoMatch
  }

  private fun parseFields(t: ParserTemplate.Fields, body: String): ParsedTxn? {
    val amtSrc = t.fields["amt"] ?: return null
    val amtRaw = try {
      val m = Pattern.compile(amtSrc, Pattern.CASE_INSENSITIVE).matcher(body)
      if (!m.find()) return null
      m.group(1) ?: return null
    } catch (_: Exception) {
      return null
    }
    val amountMinor = try {
      amountToMinor(amtRaw)
    } catch (_: Exception) {
      return null
    }
    val lower = body.lowercase(Locale.ROOT)
    val hasDebit = t.debitKeywords.any { it.lowercase(Locale.ROOT) in lower }
    val hasCredit = t.creditKeywords.any { it.lowercase(Locale.ROOT) in lower }
    val direction = when {
      hasCredit && !hasDebit -> "credit"
      hasDebit && !hasCredit -> "debit"
      else -> return null
    }
    fun field(name: String): String? = try {
      val src = t.fields[name] ?: return null
      val m = Pattern.compile(src, Pattern.CASE_INSENSITIVE).matcher(body)
      if (!m.find()) null else m.group(1)?.trim()?.ifEmpty { null }
    } catch (_: Exception) {
      null
    }
    val ref = field("ref")
    val dateRaw = field("date")
    val txnDate = if (dateRaw != null) {
      var parsed: String? = null
      for (fmt in t.dateFormats) {
        try {
          parsed = parseBodyDate(dateRaw, fmt); break
        } catch (_: Exception) {
          // try next format
        }
      }
      parsed ?: LocalDate.now().toString()
    } else {
      LocalDate.now().toString()
    }
    return ParsedTxn(
      templateId = t.id,
      direction = direction,
      amountMinor = amountMinor,
      accountLast4 = field("acct"),
      reference = ref,
      counterparty = field("payee"),
      description = null,
      channel = if (ref != null) "upi" else "other",
      txnDate = txnDate,
      balanceAfterMinor = field("bal")?.let {
        try {
          amountToMinor(it)
        } catch (_: Exception) {
          null
        }
      },
      lowConfidence = true
    )
  }

  /** matcher.group(name) throws IllegalArgumentException when the pattern has no such group. */
  private fun group(m: java.util.regex.Matcher, name: String): String? {
    return try {
      m.group(name)
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  /** Counterparty key: lowercase → non [a-z0-9 ] to space → collapse whitespace → trim. */
  fun normalizeKey(raw: String): String {
    return raw.lowercase(Locale.ROOT)
      .replace(Regex("[^a-z0-9 ]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  /**
   * Amount string → minor units using string math only (never Double).
   * Strips commas/spaces, pads or truncates the fraction to 2 digits.
   */
  fun amountToMinor(raw: String): Long {
    val cleaned = raw.replace(",", "").replace(" ", "").replace("₹", "").trim()
    require(cleaned.isNotEmpty()) { "empty amount" }
    val negative = cleaned.startsWith("-")
    val unsigned = if (negative) cleaned.substring(1) else cleaned
    val parts = unsigned.split(".")
    require(parts.size <= 2) { "bad amount: $raw" }
    val intPart = parts[0].ifEmpty { "0" }
    require(intPart.all { it.isDigit() }) { "bad amount: $raw" }
    var fracPart = if (parts.size == 2) parts[1] else ""
    require(fracPart.all { it.isDigit() }) { "bad amount: $raw" }
    if (fracPart.length > 2) fracPart = fracPart.substring(0, 2)
    while (fracPart.length < 2) fracPart += "0"
    var result = BigInteger(intPart.ifEmpty { "0" }).multiply(BigInteger.valueOf(100))
      .add(BigInteger(fracPart.ifEmpty { "0" }))
    if (negative) result = result.negate()
    return result.longValueExact()
  }

  /** SHA-256 hex of body.trim() (UTF-8). */
  fun sha256Hex(body: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val bytes = digest.digest(body.trim().toByteArray(Charsets.UTF_8))
    return bytes.joinToString("") { "%02x".format(it) }
  }

  /** Body date → 'YYYY-MM-DD'. Two-digit years map to 2000–2099. */
  fun parseBodyDate(raw: String, format: String): String {
    val v = raw.trim()
    return when (format) {
      "dd-MM-yy" -> {
        val p = v.split("-")
        require(p.size == 3) { "bad date: $raw" }
        "20${p[2]}-${p[1]}-${p[0]}"
      }
      "dd-MM-yyyy" -> {
        val p = v.split("-")
        require(p.size == 3) { "bad date: $raw" }
        "${p[2]}-${p[1]}-${p[0]}"
      }
      "dd/MM/yy" -> {
        val p = v.split("/")
        require(p.size == 3) { "bad date: $raw" }
        "20${p[2]}-${p[1]}-${p[0]}"
      }
      "dd-MMM-yy" -> {
        val parsed = LocalDate.parse(
          v.uppercase(Locale.ENGLISH),
          DateTimeFormatter.ofPattern("dd-MMM-yy", Locale.ENGLISH)
        )
        parsed.toString()
      }
      else -> throw IllegalArgumentException("unsupported dateFormat: $format")
    }
  }
}
