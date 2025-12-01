import Foundation

/// The status of a stash item
enum ItemStatus: String, Codable {
    case unopened
    case opened
    case done
}
