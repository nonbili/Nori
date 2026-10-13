import ExpoModulesCore
import WebKit

struct BlocklistRecord: Record {
  @Field
  var enabled: Bool = false

  @Field
  var blockedHosts: String = ""

  @Field
  var allowedHosts: String = ""

  @Field
  var revision: Int = 0
}

/// Compiles the blocklist into a content rule list and keeps every live
/// [NoriWebView] carrying it. Rule lists are attached per web view, and only
/// affect the loads that start after they are added.
final class NoriBlocklist {
  static let shared = NoriBlocklist()

  private let identifier = "nori.runtime.blocklist"
  private var revision = -1
  private(set) var ruleList: WKContentRuleList?
  private let views = NSHashTable<NoriWebView>.weakObjects()

  func register(_ view: NoriWebView) {
    views.add(view)
    view.applyBlocklist(ruleList)
  }

  func unregister(_ view: NoriWebView) {
    views.remove(view)
  }

  /// Completes once the new rule list is attached, so a caller that reloads
  /// afterwards loads with it.
  func set(_ next: BlocklistRecord, completion: @escaping () -> Void) {
    revision = next.revision
    guard next.enabled, !next.blockedHosts.isEmpty else {
      DispatchQueue.main.async {
        self.ruleList = nil
        self.applyToViews()
        WKContentRuleListStore.default().removeContentRuleList(forIdentifier: self.identifier) { _ in }
        completion()
      }
      return
    }

    let target = next.revision
    DispatchQueue.global(qos: .userInitiated).async {
      let encoded = Self.encode(next)
      DispatchQueue.main.async {
        WKContentRuleListStore.default().compileContentRuleList(
          forIdentifier: self.identifier,
          encodedContentRuleList: encoded
        ) { ruleList, error in
          defer { completion() }
          // A newer list has been handed over while this one compiled.
          guard self.revision == target else {
            return
          }
          if error != nil {
            return
          }
          self.ruleList = ruleList
          self.applyToViews()
        }
      }
    }
  }

  private func applyToViews() {
    for view in views.allObjects {
      view.applyBlocklist(ruleList)
    }
  }

  /// Everything but `document`, which covers top-level navigation, so a bookmark on a listed
  /// host still opens. Frames count as documents too, so ads in iframes are not blocked.
  private static let subresourceTypes = ["image", "style-sheet", "script", "font", "raw", "svg-document", "media", "popup"]

  private static func decodeHosts(_ value: String) -> [String] {
    return value
      .split(separator: "\n", omittingEmptySubsequences: true)
      .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }

  /// Block rules first and allow rules after them, with the more specific hosts
  /// later, since a later `ignore-previous-rules` wins over an earlier block.
  private static func encode(_ blocklist: BlocklistRecord) -> String {
    struct Entry {
      let host: String
      let allow: Bool
      let partCount: Int
    }

    var entries = decodeHosts(blocklist.blockedHosts).map { Entry(host: $0, allow: false, partCount: $0.split(separator: ".").count) }
    entries += decodeHosts(blocklist.allowedHosts).map { Entry(host: $0, allow: true, partCount: $0.split(separator: ".").count) }
    if entries.isEmpty {
      return "[]"
    }

    entries.sort { lhs, rhs in
      if lhs.partCount != rhs.partCount {
        return lhs.partCount < rhs.partCount
      }
      if lhs.allow != rhs.allow {
        return rhs.allow
      }
      return lhs.host < rhs.host
    }

    var rules = [String]()
    rules.reserveCapacity(entries.count)
    for entry in entries {
      let escapedHost = NSRegularExpression.escapedPattern(for: entry.host)
      let rule: [String: Any] = [
        "trigger": [
          "url-filter": "^[^:]+://([^/]+\\.)?\(escapedHost)(?::[0-9]+)?/",
          "resource-type": Self.subresourceTypes,
        ],
        "action": ["type": entry.allow ? "ignore-previous-rules" : "block"],
      ]
      if let data = try? JSONSerialization.data(withJSONObject: rule),
        let string = String(data: data, encoding: .utf8)
      {
        rules.append(string)
      }
    }
    return "[\n" + rules.joined(separator: ",\n") + "\n]"
  }
}
