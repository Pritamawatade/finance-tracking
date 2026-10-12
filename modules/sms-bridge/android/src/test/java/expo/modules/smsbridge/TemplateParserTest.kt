package expo.modules.smsbridge

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/**
 * Runs the shared fixtures (finance-tracking/fixtures/sms.json) against the
 * Kotlin TemplateParser. If the fixtures file is absent (e.g. created by a
 * parallel agent and not yet present), falls back to hardcoded copies of the
 * 3 reference messages from spec §7.1.
 */
class TemplateParserTest {

  data class Fixture(
    val body: String,
    val direction: String,
    val amountMinor: Long,
    val last4: String?,
    val reference: String?,
    val counterparty: String?,
    val description: String?,
    val channel: String,
    val txnDate: String,
    val balanceAfterMinor: Long?
  )

  private fun seedConfigJson(): String {
    val debit = """^INR\s(?<amt>[\d,]+\.?\d*)\s(?:has been\s)?debited\sfrom\sEquitas(?:\sA\/c\s|-)(?<acct>\d{3,4})\s(?:via\sUPI\s-?Ref:(?<ref>\d+)\sto\s(?<payee>.+?)|towards\s(?<desc>.+?))\son\s(?<date>\d{2}-\d{2}-\d{2})\.\s?(?:Avl\s)?Bal(?:\sis)?\sINR\s(?<bal>[\d,]+\.?\d*)"""
    val credit = """^INR\s(?<amt>[\d,]+\.?\d*)\scredited(?:\svia\sUPI)?\sto\sEquitas(?:\sA\/c\s|-)(?<acct>\d{3,4})\s-?Ref:(?<ref>\d+)\son\s(?<date>\d{2}-\d{2}-\d{2})\sfrom\s(?<payee>.+?)\.\s?(?:Avl\s)?Bal(?:\sis)?\sINR\s(?<bal>[\d,]+\.?\d*)"""
    return JSONObject()
      .put("version", 1)
      .put("monitoredSenderPatterns", JSONArray().put("EQUTAS").put("EQUITAS"))
      .put("ignorePatterns", JSONArray()
        .put("\\bOTP\\b")
        .put("will be (debited|credited)")
        .put("(collect|payment) request")
        .put("minimum balance")
        .put("statement")
        .put("is due"))
      .put("templates", JSONArray()
        .put(JSONObject()
          .put("id", "equitas-debit-v1").put("mode", "full").put("bankName", "Equitas")
          .put("direction", "debit").put("pattern", debit).put("flags", "i")
          .put("dateFormat", "dd-MM-yy"))
        .put(JSONObject()
          .put("id", "equitas-credit-v1").put("mode", "full").put("bankName", "Equitas")
          .put("direction", "credit").put("pattern", credit).put("flags", "i")
          .put("dateFormat", "dd-MM-yy")))
      .put("quickCategories", JSONObject()
        .put("debit", JSONArray()).put("credit", JSONArray()))
      .put("rules", JSONArray())
      .put("promptNotificationsEnabled", true)
      .put("silentConfirmationsEnabled", true)
      .toString()
  }

  private fun hardcodedFixtures(): List<Fixture> = listOf(
    Fixture(
      body = "INR 6.73 has been debited from Equitas A/c 2825 towards SMS ALRT CHGS+GST:300926/263641980 on 02-10-26. Avl Bal is INR 94.45.",
      direction = "debit", amountMinor = 673, last4 = "2825", reference = null,
      counterparty = null, description = "SMS ALRT CHGS+GST:300926/263641980",
      channel = "other", txnDate = "2026-10-02", balanceAfterMinor = 9445
    ),
    Fixture(
      body = "INR 2,500.00 credited via UPI to Equitas A/c 2825 -Ref:867186099240 on 11-10-26 from SANYOG NANASAH. Avl Bal is INR 3,364.45.",
      direction = "credit", amountMinor = 250000, last4 = "2825", reference = "867186099240",
      counterparty = "SANYOG NANASAH", description = null,
      channel = "upi", txnDate = "2026-10-11", balanceAfterMinor = 336445
    ),
    Fixture(
      body = "INR 30.00 debited from Equitas-2825 via UPI -Ref:627951725402 to Vikas Munshilal on 06-10-26.Bal INR 864.45.Not U?SMS BLOCK UPI to 7045030000",
      direction = "debit", amountMinor = 3000, last4 = "2825", reference = "627951725402",
      counterparty = "Vikas Munshilal", description = null,
      channel = "upi", txnDate = "2026-10-06", balanceAfterMinor = 86445
    )
  )

  /** Walks up from the JVM working dir looking for fixtures/sms.json. */
  private fun findFixturesFile(): File? {
    var dir: File? = File(System.getProperty("user.dir", ".")).canonicalFile
    repeat(7) {
      val candidate = File(dir, "fixtures/sms.json")
      if (candidate.isFile) return candidate
      dir = dir?.parentFile
    }
    return null
  }

  private fun loadFixtures(): List<Fixture> {
    val file = findFixturesFile()
    if (file != null) {
      try {
        val root = JSONObject(file.readText())
        val arr = root.optJSONArray("messages") ?: root.optJSONArray("fixtures")
        if (arr != null) {
          return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            val exp = o.optJSONObject("expected") ?: o
            Fixture(
              body = o.getString("body"),
              direction = exp.getString("direction"),
              amountMinor = exp.getLong("amountMinor"),
              last4 = exp.optString("last4", null),
              reference = exp.optString("reference", null),
              counterparty = exp.optString("counterparty", null),
              description = exp.optString("description", null),
              channel = exp.optString("channel", "other"),
              txnDate = exp.getString("txnDate"),
              balanceAfterMinor = if (exp.isNull("balanceAfterMinor")) null else exp.getLong("balanceAfterMinor")
            )
          }
        }
      } catch (_: Exception) {
        // Fall through to hardcoded fixtures.
      }
    }
    return hardcodedFixtures()
  }

  @Test
  fun referenceMessagesParseExactly() {
    val config = TemplateParser.parseConfigJson(seedConfigJson())
    val fixtures = loadFixtures()
    assertTrue("expected at least the 3 reference fixtures", fixtures.size >= 3)
    for (f in fixtures) {
      val result = TemplateParser.parse(config, "AX-EQUTAS-S", f.body)
      assertTrue("expected Parsed for: ${f.body.take(60)}", result is ParseResult.Parsed)
      val txn = (result as ParseResult.Parsed).txn
      assertEquals(f.body, f.direction, txn.direction)
      assertEquals(f.body, f.amountMinor, txn.amountMinor)
      assertEquals(f.body, f.last4, txn.accountLast4)
      assertEquals(f.body, f.reference, txn.reference)
      assertEquals(f.body, f.counterparty, txn.counterparty)
      assertEquals(f.body, f.description, txn.description)
      assertEquals(f.body, f.channel, txn.channel)
      assertEquals(f.body, f.txnDate, txn.txnDate)
      assertEquals(f.body, f.balanceAfterMinor, txn.balanceAfterMinor)
    }
  }

  @Test
  fun ignorePatternsMatchOtpButNotFixtures() {
    val config = TemplateParser.parseConfigJson(seedConfigJson())
    val otp = "Your OTP is 482913. Do not share it with anyone."
    assertTrue(TemplateParser.parse(config, "AX-EQUTAS-S", otp) is ParseResult.Ignored)
    for (f in hardcodedFixtures()) {
      val r = TemplateParser.parse(config, "AX-EQUTAS-S", f.body)
      assertTrue("fixture must not be ignored: ${f.body.take(40)}", r is ParseResult.Parsed)
    }
  }

  @Test
  fun amountMathNeverFloats() {
    assertEquals(673L, TemplateParser.amountToMinor("6.73"))
    assertEquals(250000L, TemplateParser.amountToMinor("2,500.00"))
    assertEquals(3000L, TemplateParser.amountToMinor("30.00"))
    assertEquals(10000050L, TemplateParser.amountToMinor("1,00,000.50"))
    assertEquals(500L, TemplateParser.amountToMinor("5"))
    assertEquals(505L, TemplateParser.amountToMinor("5.05"))
  }

  @Test
  fun normalizeKeyMatchesSpec() {
    assertEquals("vikas munshilal", TemplateParser.normalizeKey("Vikas Munshilal"))
    assertEquals("sms alrt chgs gst 300926 263641980", TemplateParser.normalizeKey("SMS ALRT CHGS+GST:300926/263641980"))
  }
}
