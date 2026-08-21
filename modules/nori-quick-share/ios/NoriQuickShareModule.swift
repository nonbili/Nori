import ExpoModulesCore
import Foundation

struct PendingQuickShareLinkRecord: Record {
  @Field
  var id: String = ""

  @Field
  var url: String = ""

  @Field
  var targetListId: String = ""

  @Field
  var createdAt: String = ""
}

private let quickShareInboxKey = "quick_share_inbox"
private let appShareInboxKey = "app_share_inbox"

public class NoriQuickShareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoriQuickShare")

    AsyncFunction("configure") { (enabled: Bool, targetListId: String) in
      let defaults = self.defaults()
      defaults.set(enabled, forKey: "quick_save_enabled")
      defaults.set(targetListId, forKey: "quick_save_target_list_id")
      defaults.synchronize()
    }

    AsyncFunction("getPendingLinks") { () -> [PendingQuickShareLinkRecord] in
      return self.readInbox().map { item in
        PendingQuickShareLinkRecord(
          id: item["id"] ?? "",
          url: item["url"] ?? "",
          targetListId: item["targetListId"] ?? "",
          createdAt: item["createdAt"] ?? ""
        )
      }
    }

    AsyncFunction("removePendingLinkIds") { (ids: [String]) in
      self.writeInbox(self.removing(ids, from: self.readInbox()), forKey: quickShareInboxKey)
    }

    AsyncFunction("getPendingAppLinks") { () -> [PendingQuickShareLinkRecord] in
      return self.readInbox(forKey: appShareInboxKey).map { item in
        PendingQuickShareLinkRecord(
          id: item["id"] ?? "",
          url: item["url"] ?? "",
          targetListId: item["targetListId"] ?? "",
          createdAt: item["createdAt"] ?? ""
        )
      }
    }

    AsyncFunction("removePendingAppLinkIds") { (ids: [String]) in
      let inbox = self.readInbox(forKey: appShareInboxKey)
      self.writeInbox(self.removing(ids, from: inbox), forKey: appShareInboxKey)
    }
  }

  private func removing(_ ids: [String], from items: [[String: String]]) -> [[String: String]] {
    let removeIds = Set(ids)
    return items.filter { item in
      guard let id = item["id"] else {
        return true
      }
      return !removeIds.contains(id)
    }
  }

  private func defaults() -> UserDefaults {
    if let appGroupId = Bundle.main.object(forInfoDictionaryKey: "ExpoShareIntoAppGroupId") as? String,
       let defaults = UserDefaults(suiteName: appGroupId) {
      return defaults
    }
    return UserDefaults.standard
  }

  private func readInbox(forKey key: String = quickShareInboxKey) -> [[String: String]] {
    guard let data = defaults().data(forKey: key),
          let value = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
      return []
    }
    return value
  }

  private func writeInbox(_ items: [[String: String]], forKey key: String = quickShareInboxKey) {
    let data = try? JSONSerialization.data(withJSONObject: items)
    defaults().set(data, forKey: key)
    defaults().synchronize()
  }
}

