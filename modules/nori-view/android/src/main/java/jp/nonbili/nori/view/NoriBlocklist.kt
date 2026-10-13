package jp.nonbili.nori.view

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class BlocklistRecord : Record {
  @Field
  val enabled: Boolean = false

  @Field
  val blockedHosts: String = ""

  @Field
  val allowedHosts: String = ""

  @Field
  val revision: Int = 0
}

/** The hosts every [NoriWebView] refuses to load subresources from. */
object NoriBlocklist {
  @Volatile private var enabled = false
  @Volatile private var blockedHosts = emptySet<String>()
  @Volatile private var allowedHosts = emptySet<String>()

  private fun decodeHosts(value: String): Set<String> =
    value.lineSequence().map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toHashSet()

  fun set(record: BlocklistRecord) {
    blockedHosts = decodeHosts(record.blockedHosts)
    allowedHosts = decodeHosts(record.allowedHosts)
    enabled = record.enabled
  }

  /** A host is blocked by its own or a parent domain's entry, unless a more specific allow entry covers it. */
  fun shouldBlock(host: String?): Boolean {
    if (!enabled || host == null) {
      return false
    }

    val parts = host.lowercase().split(".")
    var blockIndex = -1
    var allowIndex = -1
    for (index in parts.indices) {
      val candidate = parts.drop(index).joinToString(".")
      if (blockIndex == -1 && blockedHosts.contains(candidate)) {
        blockIndex = index
      }
      if (allowIndex == -1 && allowedHosts.contains(candidate)) {
        allowIndex = index
      }
    }

    if (blockIndex == -1) {
      return false
    }
    return allowIndex == -1 || allowIndex > blockIndex
  }
}
