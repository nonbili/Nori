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
      let removeIds = Set(ids)
      let next = self.readInbox().filter { item in
        guard let id = item["id"] else {
          return true
        }
        return !removeIds.contains(id)
      }
      self.writeInbox(next)
    }
  }

  private func defaults() -> UserDefaults {
    if let appGroupId = Bundle.main.object(forInfoDictionaryKey: "ExpoShareIntoAppGroupId") as? String,
       let defaults = UserDefaults(suiteName: appGroupId) {
      return defaults
    }
    return UserDefaults.standard
  }

  private func readInbox() -> [[String: String]] {
    guard let data = defaults().data(forKey: "quick_share_inbox"),
          let value = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
      return []
    }
    return value
  }

  private func writeInbox(_ items: [[String: String]]) {
    let data = try? JSONSerialization.data(withJSONObject: items)
    defaults().set(data, forKey: "quick_share_inbox")
    defaults().synchronize()
  }
}

