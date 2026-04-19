import ExpoModulesCore
import StoreKit
import UIKit

struct NoriBillingProductRecord: Record {
  @Field
  var id: String = ""

  @Field
  var title: String = ""

  @Field
  var description: String = ""

  @Field
  var displayPrice: String = ""
}

struct NoriBillingEntitlementRecord: Record {
  @Field
  var transactionId: String = ""

  @Field
  var originalTransactionId: String = ""

  @Field
  var productId: String = ""

  @Field
  var purchaseDate: String = ""

  @Field
  var expirationDate: String? = nil

  @Field
  var revocationDate: String? = nil

  @Field
  var appAccountToken: String? = nil

  @Field
  var environment: String? = nil

  @Field
  var signedTransactionInfo: String = ""
}

public class NoriBillingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NoriBilling")

    AsyncFunction("getProducts") { (productIds: [String]) async throws -> [NoriBillingProductRecord] in
      let products = try await Product.products(for: productIds)
      return products.map { product in
        NoriBillingProductRecord(
          id: product.id,
          title: product.displayName,
          description: product.description,
          displayPrice: product.displayPrice
        )
      }
    }

    AsyncFunction("purchase") { (productId: String, appAccountToken: String) async throws -> NoriBillingEntitlementRecord in
      let products = try await Product.products(for: [productId])
      guard let product = products.first else {
        throw NSError(domain: "NoriBilling", code: 404, userInfo: [NSLocalizedDescriptionKey: "Product not found"])
      }
      guard let token = UUID(uuidString: appAccountToken) else {
        throw NSError(domain: "NoriBilling", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid app account token"])
      }

      let result = try await product.purchase(options: [.appAccountToken(token)])
      switch result {
      case .success(let verification):
        let transaction = try self.unwrap(verification)
        await transaction.finish()
        return self.serialize(verification)
      case .pending:
        throw NSError(domain: "NoriBilling", code: 202, userInfo: [NSLocalizedDescriptionKey: "Purchase pending approval"])
      case .userCancelled:
        throw NSError(domain: "NoriBilling", code: 499, userInfo: [NSLocalizedDescriptionKey: "Purchase cancelled"])
      @unknown default:
        throw NSError(domain: "NoriBilling", code: 500, userInfo: [NSLocalizedDescriptionKey: "Unknown purchase result"])
      }
    }

    AsyncFunction("restore") { () async throws -> [NoriBillingEntitlementRecord] in
      try await AppStore.sync()
      return try await self.collectCurrentEntitlements()
    }

    AsyncFunction("getCurrentEntitlements") { () async throws -> [NoriBillingEntitlementRecord] in
      try await self.collectCurrentEntitlements()
    }

    AsyncFunction("manageSubscriptions") { () async throws in
      guard let scene = self.getActiveScene() else {
        throw NSError(domain: "NoriBilling", code: 500, userInfo: [NSLocalizedDescriptionKey: "No active scene"])
      }
      try await AppStore.showManageSubscriptions(in: scene)
    }
  }

  private func unwrap<T>(_ verification: VerificationResult<T>) throws -> T {
    switch verification {
    case .verified(let value):
      return value
    case .unverified(_, let error):
      throw error
    }
  }

  private func collectCurrentEntitlements() async throws -> [NoriBillingEntitlementRecord] {
    var records: [NoriBillingEntitlementRecord] = []
    for await verification in Transaction.currentEntitlements {
      _ = try unwrap(verification)
      records.append(serialize(verification))
    }
    return records
  }

  private func serialize(_ verification: VerificationResult<Transaction>) -> NoriBillingEntitlementRecord {
    let transaction: Transaction
    switch verification {
    case .verified(let value):
      transaction = value
    case .unverified(let value, _):
      transaction = value
    }

    return NoriBillingEntitlementRecord(
      transactionId: String(transaction.id),
      originalTransactionId: String(transaction.originalID),
      productId: transaction.productID,
      purchaseDate: transaction.purchaseDate.ISO8601Format(),
      expirationDate: transaction.expirationDate?.ISO8601Format(),
      revocationDate: transaction.revocationDate?.ISO8601Format(),
      appAccountToken: transaction.appAccountToken?.uuidString.lowercased(),
      environment: transaction.environmentStringRepresentation,
      signedTransactionInfo: verification.jwsRepresentation
    )
  }

  private func getActiveScene() -> UIWindowScene? {
    UIApplication.shared.connectedScenes
      .first { $0.activationState == .foregroundActive } as? UIWindowScene
  }
}
